import {
  parseMessage,
  type GameBridge,
  type HostMessage,
  type HostSession,
  type NetworkConnection,
  type Player,
  type Unsubscribe,
} from "@bosco98/opencontrol-sdk";
import { MSG_PROFILE, isReservedType } from "./oc-messages";

export interface CartridgeCallbacks {
  /** The game's session shut down (its own close, or its transport died). */
  onGameClosed(): void;
  /** First player accepted by the game — safe to drop the loading curtain. */
  onFirstWelcome(): void;
  /** A phone couldn't enter the game (e.g. game full). */
  onPlayerRejected(player: Player, reason: string): void;
}

/**
 * Relays between the deck's phones and one bridged game: for every connected
 * phone it opens a synthetic controller connection into the game's iframe and
 * speaks the normal wire protocol over it — hello (with the phone's name and,
 * on reconnect, the game-side resume token), input frames forward, vibrate /
 * message feedback backward. Pure relay: no UI, no phase logic.
 */
export class CartridgeHost {
  private readonly conns = new Map<string, NetworkConnection>(); // playerId → conn
  private readonly inputSubs = new Map<string, Unsubscribe>();
  private readonly gameResume = new Map<string, string>(); // playerId → game resume token
  private readonly subs: Unsubscribe[] = [];
  private welcomed = false;
  private stopped = false;

  constructor(
    private readonly session: HostSession,
    private readonly bridge: GameBridge,
    private readonly profile: string,
    private readonly cb: CartridgeCallbacks,
  ) {}

  start(): void {
    for (const player of this.session.players) {
      if (player.status === "connected") this.attach(player);
    }
    this.subs.push(
      this.session.on("join", (player) => this.attach(player)),
      this.session.on("reconnect", (player) => this.attach(player)),
      this.session.on("disconnect", (player) => this.detach(player, { bye: false })),
      this.session.on("leave", (player) => this.detach(player, { bye: true })),
      this.bridge.onClosed(() => this.cb.onGameClosed()),
    );
  }

  /** Idempotent. Sends bye for every synthetic controller and closes the bridge. */
  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    for (const unsubscribe of this.subs.splice(0)) unsubscribe();
    for (const [playerId] of [...this.conns]) {
      const player = this.session.players.find((p) => p.id === playerId);
      if (player) this.detach(player, { bye: true });
    }
    this.bridge.close();
  }

  private attach(player: Player): void {
    if (this.stopped || this.conns.has(player.id)) return;

    const conn = this.bridge.openConnection();
    this.conns.set(player.id, conn);
    conn.onMessage((raw) => this.handleGameMessage(player, raw));
    conn.onClose(() => this.conns.delete(player.id));

    // A resume token from an earlier connection reclaims the player's slot
    // in the game (un-ghosts them) instead of joining as someone new.
    conn.send(
      JSON.stringify({
        t: "hello",
        profile: this.profile,
        name: player.name,
        resume: this.gameResume.get(player.id),
      }),
    );

    this.inputSubs.set(
      player.id,
      player.onAnyInput((event, data) => {
        if (isReservedType(event)) return; // console controls never reach games
        conn.send(JSON.stringify({ t: "input", event, data }));
      }),
    );
  }

  private detach(player: Player, options: { bye: boolean }): void {
    this.inputSubs.get(player.id)?.();
    this.inputSubs.delete(player.id);
    const conn = this.conns.get(player.id);
    if (!conn) return;
    this.conns.delete(player.id);
    if (options.bye) conn.send(JSON.stringify({ t: "bye" }));
    conn.close();
    if (options.bye) this.gameResume.delete(player.id);
  }

  private handleGameMessage(player: Player, raw: string): void {
    const message = parseMessage<HostMessage>(raw);
    if (!message) return;
    switch (message.t) {
      case "welcome":
        this.gameResume.set(player.id, message.resume);
        if (!this.welcomed) {
          this.welcomed = true;
          this.cb.onFirstWelcome();
        }
        break;
      case "reject":
        this.detach(player, { bye: false });
        // Give the phone a usable pad again even though the deck stays in-game.
        player.send(MSG_PROFILE, { profile: "menu" });
        this.cb.onPlayerRejected(player, message.reason);
        break;
      case "vibrate":
        player.vibrate(message.pattern);
        break;
      case "message":
        // Pass the game's custom messages through — but never let a game
        // (especially a remote one) speak the console's own oc:* channel.
        if (!isReservedType(message.type)) player.send(message.type, message.data);
        break;
      case "closed":
        break; // per-player courtesy frame; host-closed handles the real teardown
    }
  }
}
