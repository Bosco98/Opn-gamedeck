import { Emitter, type Unsubscribe } from "../events/emitter";
import { RoomUnavailableError } from "../errors";
import type { HostTransport, NetworkAdapter, NetworkConnection } from "../networking/adapter";
import { parseMessage, type ControllerMessage, type EventMap, type JoinRejectReason } from "../types";
import { generateId } from "../utils/id";
import { generateRoomCode, normalizeRoomCode } from "../utils/room-code";
import { Player } from "./player";

export interface HostOptions {
  /** Controller profile id every controller must join with (e.g. "classic"). */
  controller: string;
  /** Networking adapter. `OpenControl.host()` defaults this to PeerJS. */
  adapter?: NetworkAdapter;
  /** Default 8. */
  maxPlayers?: number;
  /** How long a disconnected player's slot is held for reconnection. Default 60s. */
  reconnectWindowMs?: number;
  /** Force a specific room code (dev/tests). Normally auto-generated. */
  roomCode?: string;
}

export type HostSessionEvents<E extends EventMap> = {
  /** A new player joined. */
  join: Player<E>;
  /** A player's slot was released (left, or reconnect window elapsed). */
  leave: Player<E>;
  /** A player lost connection; their slot is held for the reconnect window. */
  disconnect: Player<E>;
  /** A disconnected player came back. */
  reconnect: Player<E>;
  /** The session was closed. */
  close: undefined;
};

const DEFAULT_MAX_PLAYERS = 8;
const DEFAULT_RECONNECT_WINDOW_MS = 60_000;
const HOST_CODE_ATTEMPTS = 10;

type Timer = ReturnType<typeof setTimeout>;

export class HostSession<E extends EventMap = EventMap> {
  readonly code: string;
  readonly profile: string;
  closed = false;

  private readonly transport: HostTransport;
  private readonly maxPlayers: number;
  private readonly reconnectWindowMs: number;
  private readonly emitter = new Emitter<HostSessionEvents<E>>();
  private readonly playersById = new Map<string, Player<E>>();
  private readonly resumeTokens = new Map<string, string>(); // token → playerId
  private readonly removalTimers = new Map<string, Timer>(); // playerId → timer

  /** @internal — use `OpenControl.host()` / `createHostSession()`. */
  constructor(code: string, profile: string, transport: HostTransport, options: HostOptions) {
    this.code = code;
    this.profile = profile;
    this.transport = transport;
    this.maxPlayers = options.maxPlayers ?? DEFAULT_MAX_PLAYERS;
    this.reconnectWindowMs = options.reconnectWindowMs ?? DEFAULT_RECONNECT_WINDOW_MS;
    transport.onConnection((connection) => this.handleConnection(connection));
  }

  get players(): Player<E>[] {
    return [...this.playersById.values()];
  }

  get playerCount(): number {
    return this.playersById.size;
  }

  on<K extends keyof HostSessionEvents<E>>(
    event: K,
    listener: (payload: HostSessionEvents<E>[K]) => void,
  ): Unsubscribe {
    return this.emitter.on(event, listener);
  }

  off<K extends keyof HostSessionEvents<E>>(
    event: K,
    listener: (payload: HostSessionEvents<E>[K]) => void,
  ): void {
    this.emitter.off(event, listener);
  }

  /**
   * Build the URL a phone should open, given the address of your controller
   * page. Appends `?room=<code>`, which `OpenControl.join()` pages read.
   */
  getJoinUrl(controllerPageUrl: string): string {
    const base = typeof location !== "undefined" ? location.href : undefined;
    const url = new URL(controllerPageUrl, base);
    url.searchParams.set("room", this.code);
    return url.toString();
  }

  /** Send a custom message to every connected player. */
  broadcast(type: string, data?: unknown): void {
    for (const player of this.playersById.values()) player.send(type, data);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const player of this.playersById.values()) {
      player.sendRaw({ t: "closed" });
      player.dispose();
    }
    for (const timer of this.removalTimers.values()) clearTimeout(timer);
    this.removalTimers.clear();
    this.playersById.clear();
    this.resumeTokens.clear();
    this.transport.close();
    this.emitter.emit("close", undefined);
    this.emitter.clear();
  }

  private handleConnection(connection: NetworkConnection): void {
    let player: Player<E> | null = null;

    connection.onMessage((raw) => {
      const message = parseMessage<ControllerMessage>(raw);
      if (!message) return;

      if (!player) {
        if (message.t !== "hello") {
          connection.close();
          return;
        }
        player = this.handleHello(connection, message);
        return;
      }

      if (message.t === "input") {
        if (player.status === "connected") player.handleInput(message.event, message.data);
      } else if (message.t === "bye") {
        const leaving = player;
        player = null;
        this.removePlayer(leaving);
        connection.close();
      }
    });

    connection.onClose(() => {
      if (player) this.handleDisconnect(player, connection);
    });
  }

  private handleHello(
    connection: NetworkConnection,
    message: Extract<ControllerMessage, { t: "hello" }>,
  ): Player<E> | null {
    if (message.profile !== this.profile) {
      this.reject(connection, "profile-mismatch");
      return null;
    }

    // Reconnection: a valid resume token reclaims the existing player slot.
    if (message.resume) {
      const playerId = this.resumeTokens.get(message.resume);
      const existing = playerId ? this.playersById.get(playerId) : undefined;
      if (existing) {
        const wasReconnecting = existing.status === "reconnecting";
        existing.connection?.close(); // stale connection, e.g. quick page refresh
        existing.connection = connection;
        existing.status = "connected";
        const timer = this.removalTimers.get(existing.id);
        if (timer) {
          clearTimeout(timer);
          this.removalTimers.delete(existing.id);
        }
        this.sendWelcome(existing, message.resume);
        if (wasReconnecting) this.emitter.emit("reconnect", existing);
        return existing;
      }
    }

    if (this.playersById.size >= this.maxPlayers) {
      this.reject(connection, "full");
      return null;
    }

    const player = new Player<E>(
      generateId(),
      this.nextPlayerIndex(),
      message.name ?? `Player ${this.nextPlayerIndex() + 1}`,
    );
    player.connection = connection;
    const resumeToken = generateId();
    this.resumeTokens.set(resumeToken, player.id);
    this.playersById.set(player.id, player);
    this.sendWelcome(player, resumeToken);
    this.emitter.emit("join", player);
    return player;
  }

  private sendWelcome(player: Player<E>, resumeToken: string): void {
    player.sendRaw({
      t: "welcome",
      playerId: player.id,
      index: player.index,
      resume: resumeToken,
      profile: this.profile,
    });
  }

  private reject(connection: NetworkConnection, reason: JoinRejectReason): void {
    connection.send(JSON.stringify({ t: "reject", reason }));
    connection.close();
  }

  private handleDisconnect(player: Player<E>, connection: NetworkConnection): void {
    // Ignore closes from connections this player already replaced.
    if (player.connection !== connection) return;
    if (!this.playersById.has(player.id)) return;

    player.connection = null;
    player.status = "reconnecting";
    this.emitter.emit("disconnect", player);

    const timer = setTimeout(() => this.removePlayer(player), this.reconnectWindowMs);
    this.removalTimers.set(player.id, timer);
  }

  private removePlayer(player: Player<E>): void {
    if (!this.playersById.delete(player.id)) return;
    const timer = this.removalTimers.get(player.id);
    if (timer) {
      clearTimeout(timer);
      this.removalTimers.delete(player.id);
    }
    for (const [token, playerId] of this.resumeTokens) {
      if (playerId === player.id) this.resumeTokens.delete(token);
    }
    player.dispose();
    this.emitter.emit("leave", player);
  }

  private nextPlayerIndex(): number {
    const used = new Set([...this.playersById.values()].map((p) => p.index));
    let index = 0;
    while (used.has(index)) index++;
    return index;
  }
}

/**
 * Create a host session. Generates room codes and retries on collision;
 * a caller-supplied `roomCode` is used as-is (collision throws).
 */
export async function createHostSession<E extends EventMap = EventMap>(
  options: HostOptions & { adapter: NetworkAdapter },
): Promise<HostSession<E>> {
  let attempts = 0;
  for (;;) {
    const code = options.roomCode ? normalizeRoomCode(options.roomCode) : generateRoomCode();
    try {
      const transport = await options.adapter.host(code);
      return new HostSession<E>(code, options.controller, transport, options);
    } catch (error) {
      const canRetry = error instanceof RoomUnavailableError && !options.roomCode;
      if (!canRetry || ++attempts >= HOST_CODE_ATTEMPTS) throw error;
    }
  }
}
