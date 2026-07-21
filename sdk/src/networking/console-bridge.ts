import { ConnectionTimeoutError, OpenControlError } from "../errors";
import { generateId } from "../utils/id";
import type { HostTransport, NetworkAdapter, NetworkConnection, Unsubscribe } from "./adapter";

/**
 * Console bridge — lets a console shell embed a game in an iframe and hand it
 * players from the console's own session, so phones join once and stay
 * connected across games.
 *
 * Both ends live in this file on purpose: a remote game bundles its own copy
 * of the SDK, and the postMessage protocol below is the compatibility
 * contract between that copy and the console's.
 *
 * How it fits together:
 * - The console loads the game with `?oc=console` in the iframe URL.
 * - The game calls `OpenControl.host()` as usual; the SDK detects the console
 *   context (`isConsoleEmbedded`) and substitutes `ConsoleBridgeAdapter` for
 *   PeerJS. The game's HostSession runs unmodified over the bridge.
 * - The console (`connectToBridgedGame`) opens one `MessagePort` pair per
 *   phone and speaks the normal wire protocol over it as a synthetic
 *   controller — the game cannot tell it apart from a real phone.
 *
 * Window-level envelopes (all `{ oc: "bridge", v: 1 }`; unknown `t` ignored
 * so future additions stay backward-compatible):
 * - game → console  `host-ready`   (retried until acked; game pins the
 *                                   console's origin from the ack)
 * - console → game  `host-ack`
 * - console → game  `connect` + transferred MessagePort (one per controller)
 * - game → console  `host-closed`
 *
 * Port-level messages: plain strings are untouched wire-protocol frames;
 * `{ oc: "bridge-ctl", t: "close" }` is the in-band close sentinel
 * (MessagePort has no reliable cross-browser close event).
 */

export const BRIDGE_VERSION = 1;

const CONSOLE_PARAM = "oc";
const CONSOLE_PARAM_VALUE = "console";
const HOST_READY_RETRY_MS = 500;
const HANDSHAKE_TIMEOUT_MS = 15_000;

type BridgeEnvelope =
  | { oc: "bridge"; v: number; t: "host-ready" }
  | { oc: "bridge"; v: number; t: "host-ack" }
  | { oc: "bridge"; v: number; t: "connect"; connId: string }
  | { oc: "bridge"; v: number; t: "host-closed" };

function isEnvelope(data: unknown): data is BridgeEnvelope {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as { oc?: unknown }).oc === "bridge" &&
    typeof (data as { t?: unknown }).t === "string"
  );
}

/**
 * True when this page runs inside a console shell's iframe (the console
 * appends `?oc=console` to the game URL). `OpenControl.host()` uses this to
 * pick the bridge adapter over PeerJS.
 */
export function isConsoleEmbedded(): boolean {
  return (
    typeof window !== "undefined" &&
    window.parent !== window &&
    new URLSearchParams(window.location.search).get(CONSOLE_PARAM) === CONSOLE_PARAM_VALUE
  );
}

/** Append the console marker to a game URL (what the console shell does). */
export function withConsoleParam(url: URL): URL {
  url.searchParams.set(CONSOLE_PARAM, CONSOLE_PARAM_VALUE);
  return url;
}

/* ------------------------------------------------------------------ */
/* Shared: NetworkConnection over a MessagePort                        */
/* ------------------------------------------------------------------ */

/**
 * Mirrors MemoryConnection's semantics: multiple subscribers, messages that
 * arrive before the first `onMessage` subscriber are buffered, close is
 * idempotent and delivered to both ends (via the in-band sentinel).
 */
class PortConnection implements NetworkConnection {
  private messageHandlers = new Set<(data: string) => void>();
  private closeHandlers = new Set<() => void>();
  private pending: string[] = [];
  private closed = false;

  constructor(private readonly port: MessagePort) {
    port.addEventListener("message", (event: MessageEvent) => {
      const { data } = event;
      if (typeof data === "string") {
        this.deliver(data);
        return;
      }
      if (
        typeof data === "object" &&
        data !== null &&
        (data as { oc?: unknown }).oc === "bridge-ctl" &&
        (data as { t?: unknown }).t === "close"
      ) {
        this.handleRemoteClose();
      }
    });
    port.start();
  }

  send(data: string): void {
    if (this.closed) return;
    this.port.postMessage(data);
  }

  private deliver(data: string): void {
    if (this.closed) return;
    if (this.messageHandlers.size === 0) {
      this.pending.push(data);
      return;
    }
    for (const handler of [...this.messageHandlers]) handler(data);
  }

  onMessage(callback: (data: string) => void): Unsubscribe {
    this.messageHandlers.add(callback);
    if (this.pending.length > 0) {
      const buffered = this.pending.splice(0);
      queueMicrotask(() => {
        for (const data of buffered) {
          if (!this.closed) callback(data);
        }
      });
    }
    return () => this.messageHandlers.delete(callback);
  }

  onClose(callback: () => void): Unsubscribe {
    this.closeHandlers.add(callback);
    return () => this.closeHandlers.delete(callback);
  }

  close(): void {
    if (this.closed) return;
    try {
      this.port.postMessage({ oc: "bridge-ctl", t: "close" });
    } catch {
      /* port may already be neutered */
    }
    this.finish();
  }

  private handleRemoteClose(): void {
    if (this.closed) return;
    this.finish();
  }

  private finish(): void {
    this.closed = true;
    this.port.close();
    queueMicrotask(() => {
      for (const handler of [...this.closeHandlers]) handler();
      this.closeHandlers.clear();
      this.messageHandlers.clear();
    });
  }
}

/* ------------------------------------------------------------------ */
/* Game side: NetworkAdapter                                           */
/* ------------------------------------------------------------------ */

/**
 * The adapter a game's host session runs over when embedded in a console.
 * Host-only: controller pages never run inside the console's game iframe.
 */
export class ConsoleBridgeAdapter implements NetworkAdapter {
  host(_roomId: string): Promise<HostTransport> {
    return new Promise((resolve, reject) => {
      const parent = window.parent;
      let consoleOrigin: string | null = null;
      let settled = false;

      const connectionHandlers = new Set<(connection: NetworkConnection) => void>();
      const connections = new Set<PortConnection>();

      const onWindowMessage = (event: MessageEvent) => {
        if (event.source !== parent || !isEnvelope(event.data)) return;
        // Origin pinning: the first valid ack decides who our console is.
        if (consoleOrigin !== null && event.origin !== consoleOrigin) return;

        const envelope = event.data;
        if (envelope.t === "host-ack" && !settled) {
          settled = true;
          consoleOrigin = event.origin;
          clearInterval(retryTimer);
          clearTimeout(timeoutTimer);
          resolve(transport);
          return;
        }
        if (envelope.t === "connect" && settled) {
          const port = event.ports[0];
          if (!port) return;
          const connection = new PortConnection(port);
          connections.add(connection);
          connection.onClose(() => connections.delete(connection));
          queueMicrotask(() => {
            for (const handler of [...connectionHandlers]) handler(connection);
          });
        }
      };
      window.addEventListener("message", onWindowMessage);

      const transport: HostTransport = {
        onConnection(callback) {
          connectionHandlers.add(callback);
          return () => connectionHandlers.delete(callback);
        },
        close() {
          window.removeEventListener("message", onWindowMessage);
          if (consoleOrigin) {
            parent.postMessage(
              { oc: "bridge", v: BRIDGE_VERSION, t: "host-closed" },
              consoleOrigin,
            );
          }
          for (const connection of [...connections]) connection.close();
          connections.clear();
          connectionHandlers.clear();
        },
      };

      // The ready envelope carries nothing sensitive, so "*" is fine here;
      // the ack pins the console's origin for everything after.
      const announce = () =>
        parent.postMessage({ oc: "bridge", v: BRIDGE_VERSION, t: "host-ready" }, "*");
      announce();
      const retryTimer = setInterval(announce, HOST_READY_RETRY_MS);

      const timeoutTimer = setTimeout(() => {
        if (settled) return;
        settled = true;
        clearInterval(retryTimer);
        window.removeEventListener("message", onWindowMessage);
        reject(new ConnectionTimeoutError("Console did not answer the bridge handshake"));
      }, HANDSHAKE_TIMEOUT_MS);
    });
  }

  join(_roomId: string): Promise<NetworkConnection> {
    return Promise.reject(
      new OpenControlError("The console bridge adapter is host-only"),
    );
  }
}

/* ------------------------------------------------------------------ */
/* Console side: talk to a bridged game iframe                         */
/* ------------------------------------------------------------------ */

export interface GameBridge {
  /** Open a new synthetic controller connection into the game. */
  openConnection(): NetworkConnection;
  /** The game's host session closed (its transport shut down). */
  onClosed(callback: () => void): Unsubscribe;
  /** Detach listeners and close every open connection. */
  close(): void;
}

export interface ConnectToBridgedGameOptions {
  /** Origin the game is expected to be served from (from the registry). */
  origin: string;
  /** Handshake timeout. Default 15s. */
  timeoutMs?: number;
}

/**
 * Console side of the bridge: wait for the game inside `iframe` to announce
 * its host session, then hand out synthetic controller connections.
 */
export function connectToBridgedGame(
  iframe: HTMLIFrameElement,
  options: ConnectToBridgedGameOptions,
): Promise<GameBridge> {
  const { origin } = options;
  const timeoutMs = options.timeoutMs ?? HANDSHAKE_TIMEOUT_MS;

  return new Promise((resolve, reject) => {
    let settled = false;
    let closed = false;
    const closedHandlers = new Set<() => void>();
    const connections = new Set<PortConnection>();

    const detach = () => window.removeEventListener("message", onWindowMessage);

    const onWindowMessage = (event: MessageEvent) => {
      if (event.source !== iframe.contentWindow || event.origin !== origin) return;
      if (!isEnvelope(event.data)) return;
      const envelope = event.data;

      if (envelope.t === "host-ready") {
        if (typeof envelope.v === "number" && envelope.v !== BRIDGE_VERSION) {
          if (!settled) {
            settled = true;
            clearTimeout(timeoutTimer);
            detach();
            reject(
              new OpenControlError(
                `Bridge protocol version mismatch (game v${envelope.v}, console v${BRIDGE_VERSION})`,
              ),
            );
          }
          return;
        }
        // Ack every ready (the game retries until it hears one).
        iframe.contentWindow?.postMessage(
          { oc: "bridge", v: BRIDGE_VERSION, t: "host-ack" },
          origin,
        );
        if (!settled) {
          settled = true;
          clearTimeout(timeoutTimer);
          resolve(bridge);
        }
        return;
      }

      if (envelope.t === "host-closed" && settled && !closed) {
        for (const handler of [...closedHandlers]) handler();
      }
    };
    window.addEventListener("message", onWindowMessage);

    const bridge: GameBridge = {
      openConnection() {
        if (closed) throw new OpenControlError("Bridge is closed");
        const channel = new MessageChannel();
        iframe.contentWindow?.postMessage(
          { oc: "bridge", v: BRIDGE_VERSION, t: "connect", connId: generateId() },
          origin,
          [channel.port2],
        );
        const connection = new PortConnection(channel.port1);
        connections.add(connection);
        connection.onClose(() => connections.delete(connection));
        return connection;
      },
      onClosed(callback) {
        closedHandlers.add(callback);
        return () => closedHandlers.delete(callback);
      },
      close() {
        if (closed) return;
        closed = true;
        detach();
        for (const connection of [...connections]) connection.close();
        connections.clear();
        closedHandlers.clear();
      },
    };

    const timeoutTimer = setTimeout(() => {
      if (settled) return;
      settled = true;
      detach();
      reject(new ConnectionTimeoutError("Game did not announce a bridged host session"));
    }, timeoutMs);
  });
}
