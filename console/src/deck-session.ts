import {
  OpenControl,
  type HostSession,
  type Player,
  type Unsubscribe,
} from "@bosco98/opencontrol-sdk";
import {
  MSG_CROWN,
  MSG_PROFILE,
  MSG_TOAST,
  type CrownPayload,
  type ProfilePayload,
  type ToastPayload,
} from "./oc-messages";

/** Fixed palette; a player keeps their color for the whole session (by slot index). */
export const PLAYER_COLORS = [
  "#7ee787", "#4aa8ff", "#ffd042", "#ff5a5f",
  "#c792ea", "#ff9e64", "#5ce1e6", "#f78fb3",
];

export interface RosterPlayer {
  id: string;
  name: string;
  index: number;
  color: string;
  status: "connected" | "reconnecting";
  crown: boolean;
}

const MENU_PROFILE = "menu";
const MAX_PLAYERS = 8;

/**
 * The deck's one real (PeerJS) session, for the whole runtime.
 *
 * Owns everything about *who is connected*: the roster snapshot the UI
 * renders, crown assignment (lowest connected slot), and which controller
 * profile every phone should currently render (re-sent on join/reconnect).
 * It does NOT know about phases or games — that's ConsoleApp / CartridgeHost.
 */
export class DeckSession {
  readonly session: HostSession;

  private currentProfile = MENU_PROFILE;
  private crownId: string | null = null;
  private rosterListeners = new Set<() => void>();
  private crownInputListeners = new Set<(event: string, data: unknown) => void>();

  static async create(): Promise<DeckSession> {
    const session = await OpenControl.host({ controller: MENU_PROFILE, maxPlayers: MAX_PLAYERS });
    return new DeckSession(session);
  }

  private constructor(session: HostSession) {
    this.session = session;
    session.on("join", (player) => this.handleJoin(player));
    session.on("leave", () => this.refresh());
    session.on("disconnect", () => this.refresh());
    session.on("reconnect", (player) => {
      // The phone may have reloaded — snap it back to the right UI.
      this.sendProfile(player);
      this.sendCrown(player);
      this.refresh();
    });
  }

  get code(): string {
    return this.session.code;
  }

  get joinUrl(): string {
    return this.session.getJoinUrl(new URL("controller.html", location.href).toString());
  }

  get roster(): RosterPlayer[] {
    return this.session.players
      .map((player) => ({
        id: player.id,
        name: player.name,
        index: player.index,
        color: PLAYER_COLORS[player.index % PLAYER_COLORS.length],
        status: player.status,
        crown: player.id === this.crownId,
      }))
      .sort((a, b) => a.index - b.index);
  }

  onRosterChange(listener: () => void): Unsubscribe {
    this.rosterListeners.add(listener);
    return () => this.rosterListeners.delete(listener);
  }

  /** Input events from whichever player currently holds the crown. */
  onCrownInput(listener: (event: string, data: unknown) => void): Unsubscribe {
    this.crownInputListeners.add(listener);
    return () => this.crownInputListeners.delete(listener);
  }

  /** Tell every phone (now and on future joins/reconnects) which UI to render. */
  setProfile(profile: string): void {
    this.currentProfile = profile;
    for (const player of this.session.players) this.sendProfile(player);
  }

  toast(player: Player, text: string): void {
    player.send(MSG_TOAST, { text } satisfies ToastPayload);
  }

  private handleJoin(player: Player): void {
    player.onAnyInput((event, data) => {
      if (player.id === this.crownId) {
        for (const listener of [...this.crownInputListeners]) listener(event, data);
      }
    });
    this.sendProfile(player);
    this.refresh();
  }

  private sendProfile(player: Player): void {
    player.send(MSG_PROFILE, { profile: this.currentProfile } satisfies ProfilePayload);
  }

  private sendCrown(player: Player): void {
    player.send(MSG_CROWN, { crown: player.id === this.crownId } satisfies CrownPayload);
  }

  /** Recompute the crown and notify the UI + any phones whose crown flag flipped. */
  private refresh(): void {
    const connected = this.session.players
      .filter((player) => player.status === "connected")
      .sort((a, b) => a.index - b.index);
    const nextCrownId = connected[0]?.id ?? null;

    if (nextCrownId !== this.crownId) {
      this.crownId = nextCrownId;
      for (const player of this.session.players) this.sendCrown(player);
    }
    for (const listener of [...this.rosterListeners]) listener();
  }
}
