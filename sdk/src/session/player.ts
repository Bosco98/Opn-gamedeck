import { Emitter, type Unsubscribe } from "../events/emitter";
import type { NetworkConnection } from "../networking/adapter";
import type { EventMap, HostMessage, PlayerStatus } from "../types";

/**
 * A connected controller, as seen by the host.
 *
 * `E` is the controller profile's event contract — `player.on("buttonDown", …)`
 * is typed against it.
 */
export class Player<E extends EventMap = EventMap> {
  readonly id: string;
  readonly index: number;
  name: string;
  status: PlayerStatus = "connected";

  private input = new Emitter<E>();
  /** @internal */
  connection: NetworkConnection | null = null;

  /** @internal */
  constructor(id: string, index: number, name: string) {
    this.id = id;
    this.index = index;
    this.name = name;
  }

  /** Subscribe to a controller event from this player's profile contract. */
  on<K extends keyof E>(event: K, listener: (payload: E[K]) => void): Unsubscribe {
    return this.input.on(event, listener);
  }

  off<K extends keyof E>(event: K, listener: (payload: E[K]) => void): void {
    this.input.off(event, listener);
  }

  /** Vibrate the player's phone (where the browser supports it). */
  vibrate(pattern: number | number[] = 100): void {
    this.sendRaw({ t: "vibrate", pattern });
  }

  /** Send a custom message to this player's controller. */
  send(type: string, data?: unknown): void {
    this.sendRaw({ t: "message", type, data });
  }

  /** @internal */
  handleInput(event: string, data: unknown): void {
    this.input.emit(event as keyof E, data as E[keyof E]);
  }

  /** @internal */
  sendRaw(message: HostMessage): void {
    if (this.connection && this.status === "connected") {
      this.connection.send(JSON.stringify(message));
    }
  }

  /** @internal */
  dispose(): void {
    this.input.clear();
    this.connection = null;
  }
}
