import { Emitter, type Unsubscribe } from "../events/emitter";
import { ConnectionTimeoutError, JoinRejectedError, OpenControlError } from "../errors";
import type { NetworkAdapter, NetworkConnection } from "../networking/adapter";
import { getProfile } from "../profiles/registry";
import {
  parseMessage,
  type ControllerMessage,
  type EventMap,
  type HostMessage,
  type WelcomeMessage,
} from "../types";
import { normalizeRoomCode } from "../utils/room-code";
import { installLandscapeLock } from "../ui/landscape";

export interface JoinOptions {
  /** Room code shown on the host screen (case-insensitive). */
  room: string;
  /** Controller profile id — must match what the host was created with. */
  controller: string;
  /** Networking adapter. `OpenControl.join()` defaults this to PeerJS. */
  adapter?: NetworkAdapter;
  /** Element to render the controller UI into. Omit to drive input yourself. */
  mount?: HTMLElement;
  /** Player display name. */
  name?: string;
  /** Auto-reconnect on connection loss. Default true. */
  reconnect?: boolean;
  /**
   * Controller UIs are landscape-only: when the phone is held (or rotation-
   * locked) in portrait, the UI is rotated 90° so it still renders landscape.
   * Set false to render into `mount` as-is. Default true.
   */
  landscape?: boolean;
}

export type ControllerSessionStatus = "connected" | "reconnecting" | "closed";

export type ControllerCloseReason = "left" | "session-ended" | "lost";

export type ControllerSessionEvents = {
  /** Custom message from the host (`player.send(...)`). */
  message: { type: string; data?: unknown };
  /** Host asked the controller to vibrate (also performed automatically). */
  vibrate: { pattern: number | number[] };
  /** Connection lost; auto-reconnect is running. */
  disconnect: undefined;
  /** Reconnected after a drop. */
  reconnect: undefined;
  /** Session over — left, host closed, or reconnect gave up. */
  close: { reason: ControllerCloseReason };
};

const HANDSHAKE_TIMEOUT_MS = 10_000;
const RECONNECT_WINDOW_MS = 60_000;
const RECONNECT_RETRY_DELAY_MS = 1_500;

/**
 * The controller (phone) side of a session.
 */
export class ControllerSession {
  readonly room: string;
  readonly profile: string;
  playerId!: string;
  playerIndex!: number;
  status: ControllerSessionStatus = "connected";

  private readonly adapter: NetworkAdapter;
  private readonly name?: string;
  private readonly reconnectEnabled: boolean;
  private readonly emitter = new Emitter<ControllerSessionEvents>();
  private connection: NetworkConnection | null = null;
  private detachConnection: (() => void) | null = null;
  private resumeToken: string | null = null;
  private cleanupRenderer: (() => void) | null = null;

  /** @internal — use `OpenControl.join()` / `joinControllerSession()`. */
  constructor(room: string, profile: string, adapter: NetworkAdapter, options: JoinOptions) {
    this.room = room;
    this.profile = profile;
    this.adapter = adapter;
    this.name = options.name;
    this.reconnectEnabled = options.reconnect ?? true;
  }

  on<K extends keyof ControllerSessionEvents>(
    event: K,
    listener: (payload: ControllerSessionEvents[K]) => void,
  ): Unsubscribe {
    return this.emitter.on(event, listener);
  }

  off<K extends keyof ControllerSessionEvents>(
    event: K,
    listener: (payload: ControllerSessionEvents[K]) => void,
  ): void {
    this.emitter.off(event, listener);
  }

  /**
   * Send a controller event to the host. Built-in profile UIs call this for
   * you; use it directly when building custom controller UIs.
   */
  sendInput(event: string, data: unknown): void {
    if (this.status !== "connected" || !this.connection) return;
    const message: ControllerMessage = { t: "input", event, data };
    this.connection.send(JSON.stringify(message));
  }

  /** Leave the session for good (releases the player slot immediately). */
  leave(): void {
    if (this.status === "closed") return;
    if (this.connection) {
      const message: ControllerMessage = { t: "bye" };
      this.connection.send(JSON.stringify(message));
    }
    this.finish("left");
  }

  /** @internal */
  attach(connection: NetworkConnection, welcome: WelcomeMessage, buffered: HostMessage[]): void {
    this.connection = connection;
    this.playerId = welcome.playerId;
    this.playerIndex = welcome.index;
    this.resumeToken = welcome.resume;
    storeResumeToken(this.room, welcome.resume);

    const offMessage = connection.onMessage((raw) => {
      const message = parseMessage<HostMessage>(raw);
      if (message) this.handleMessage(message);
    });
    const offClose = connection.onClose(() => this.handleConnectionLost(connection));
    this.detachConnection = () => {
      offMessage();
      offClose();
    };

    for (const message of buffered) this.handleMessage(message);
  }

  /** @internal */
  setRenderer(cleanup: () => void): void {
    this.cleanupRenderer = cleanup;
  }

  private handleMessage(message: HostMessage): void {
    switch (message.t) {
      case "vibrate":
        tryVibrate(message.pattern);
        this.emitter.emit("vibrate", { pattern: message.pattern });
        break;
      case "message":
        this.emitter.emit("message", { type: message.type, data: message.data });
        break;
      case "closed":
        this.finish("session-ended");
        break;
      case "welcome":
      case "reject":
        break; // handshake-only messages; ignore here
    }
  }

  private handleConnectionLost(connection: NetworkConnection): void {
    if (this.status !== "connected" || this.connection !== connection) return;
    this.detach();
    if (!this.reconnectEnabled || !this.resumeToken) {
      this.finish("lost");
      return;
    }
    this.status = "reconnecting";
    this.emitter.emit("disconnect", undefined);
    void this.reconnectLoop();
  }

  private async reconnectLoop(): Promise<void> {
    const deadline = Date.now() + RECONNECT_WINDOW_MS;
    while (this.status === "reconnecting" && Date.now() < deadline) {
      try {
        const connection = await this.adapter.join(this.room);
        const { welcome, takeover } = await handshake(connection, {
          t: "hello",
          profile: this.profile,
          name: this.name,
          resume: this.resumeToken ?? undefined,
        });
        if (this.status !== "reconnecting") {
          connection.close();
          return;
        }
        const buffered = takeover();
        this.status = "connected";
        this.attach(connection, welcome, buffered);
        this.emitter.emit("reconnect", undefined);
        return;
      } catch (error) {
        if (error instanceof JoinRejectedError) break; // host said no — retrying won't help
        await delay(RECONNECT_RETRY_DELAY_MS);
      }
    }
    if (this.status === "reconnecting") this.finish("lost");
  }

  private detach(): void {
    this.detachConnection?.();
    this.detachConnection = null;
    this.connection = null;
  }

  private finish(reason: ControllerCloseReason): void {
    if (this.status === "closed") return;
    const connection = this.connection;
    this.detach();
    this.status = "closed";
    connection?.close();
    this.cleanupRenderer?.();
    this.cleanupRenderer = null;
    if (reason !== "lost") clearResumeToken(this.room);
    this.emitter.emit("close", { reason });
    this.emitter.clear();
  }
}

/**
 * Join a hosted session as a controller.
 */
export async function joinControllerSession(
  options: JoinOptions & { adapter: NetworkAdapter },
): Promise<ControllerSession> {
  const room = normalizeRoomCode(options.room);
  const connection = await options.adapter.join(room);
  const { welcome, takeover } = await handshake(connection, {
    t: "hello",
    profile: options.controller,
    name: options.name,
    resume: readResumeToken(room) ?? undefined,
  });

  const session = new ControllerSession(room, options.controller, options.adapter, options);
  session.attach(connection, welcome, takeover());

  if (options.mount) {
    const profile = getProfile(options.controller);
    if (profile.render) {
      let surface = options.mount;
      let uninstallLandscape: (() => void) | null = null;
      if (options.landscape ?? true) {
        const lock = installLandscapeLock(options.mount);
        surface = lock.surface;
        uninstallLandscape = lock.cleanup;
      }
      const cleanup = profile.render(surface, {
        emit: (event, data) => session.sendInput(String(event), data),
        playerIndex: session.playerIndex,
        room,
      });
      session.setRenderer(() => {
        cleanup();
        uninstallLandscape?.();
      });
    }
  }

  return session;
}

/**
 * Send hello, wait for welcome/reject. Keeps buffering host messages that
 * arrive right after the welcome until the session takes the connection over,
 * so nothing sent from a `join` handler is lost.
 */
function handshake(
  connection: NetworkConnection,
  hello: Extract<ControllerMessage, { t: "hello" }>,
): Promise<{ welcome: WelcomeMessage; takeover: () => HostMessage[] }> {
  return new Promise((resolve, reject) => {
    const buffered: HostMessage[] = [];
    let welcomed = false;

    const offMessage = connection.onMessage((raw) => {
      const message = parseMessage<HostMessage>(raw);
      if (!message) return;
      if (welcomed) {
        buffered.push(message);
        return;
      }
      if (message.t === "welcome") {
        welcomed = true;
        clearTimeout(timer);
        offClose();
        resolve({
          welcome: message,
          takeover: () => {
            offMessage();
            return buffered;
          },
        });
      } else if (message.t === "reject") {
        cleanup();
        connection.close();
        reject(new JoinRejectedError(message.reason));
      }
    });

    const offClose = connection.onClose(() => {
      cleanup();
      reject(new OpenControlError("Connection closed during join"));
    });

    const timer = setTimeout(() => {
      cleanup();
      connection.close();
      reject(new ConnectionTimeoutError("Host did not answer the join request in time"));
    }, HANDSHAKE_TIMEOUT_MS);

    function cleanup(): void {
      clearTimeout(timer);
      offMessage();
      offClose();
    }

    connection.send(JSON.stringify(hello));
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function tryVibrate(pattern: number | number[]): void {
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    navigator.vibrate(pattern);
  }
}

// Resume tokens survive page reloads via sessionStorage (guarded: not every
// environment has it, e.g. Node tests).
function resumeKey(room: string): string {
  return `opencontrol:resume:${room}`;
}

function readResumeToken(room: string): string | null {
  try {
    return sessionStorage.getItem(resumeKey(room));
  } catch {
    return null;
  }
}

function storeResumeToken(room: string, token: string): void {
  try {
    sessionStorage.setItem(resumeKey(room), token);
  } catch {
    /* unavailable — in-memory token still covers live reconnects */
  }
}

function clearResumeToken(room: string): void {
  try {
    sessionStorage.removeItem(resumeKey(room));
  } catch {
    /* ignore */
  }
}
