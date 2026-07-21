/**
 * OpenControl SDK — turn any phone into a programmable controller.
 *
 * Host side:
 * ```ts
 * const session = await OpenControl.host({ controller: "classic" });
 * session.on("join", (player) => {
 *   player.on("buttonDown", ({ button }) => console.log(player.name, button));
 * });
 * ```
 *
 * Controller side (the page the phone opens):
 * ```ts
 * await OpenControl.join({
 *   room: new URLSearchParams(location.search).get("room")!,
 *   controller: "classic",
 *   mount: document.getElementById("root")!,
 * });
 * ```
 */
import { arcadeProfile } from "./profiles/arcade";
import { classicProfile, type ClassicEvents } from "./profiles/classic";
import { tiltProfile } from "./profiles/tilt";
import { registerProfile } from "./profiles/registry";
import { PeerJSAdapter } from "./networking/peerjs-adapter";
import {
  createHostSession,
  HostSession,
  type HostOptions,
} from "./session/host-session";
import {
  ControllerSession,
  joinControllerSession,
  type JoinOptions,
} from "./session/controller-session";
import type { EventMap } from "./types";

registerProfile(classicProfile);
registerProfile(arcadeProfile);
registerProfile(tiltProfile);

/**
 * Start hosting a session. Returns once the room is open and joinable.
 * Uses the PeerJS adapter unless `options.adapter` says otherwise.
 */
export function host<E extends EventMap = ClassicEvents>(
  options: HostOptions,
): Promise<HostSession<E>> {
  return createHostSession<E>({ ...options, adapter: options.adapter ?? new PeerJSAdapter() });
}

/**
 * Join a session as a controller (call this from the phone's page).
 * Pass `mount` to render the profile's built-in UI.
 */
export function join(options: JoinOptions): Promise<ControllerSession> {
  return joinControllerSession({ ...options, adapter: options.adapter ?? new PeerJSAdapter() });
}

export const OpenControl = { host, join };
export default OpenControl;

/* Sessions */
export { HostSession, createHostSession } from "./session/host-session";
export type { HostOptions, HostSessionEvents } from "./session/host-session";
export { ControllerSession, joinControllerSession } from "./session/controller-session";
export type {
  JoinOptions,
  ControllerSessionEvents,
  ControllerSessionStatus,
  ControllerCloseReason,
} from "./session/controller-session";
export { Player } from "./session/player";

/* Networking */
export type { NetworkAdapter, NetworkConnection, HostTransport } from "./networking/adapter";
export { PeerJSAdapter } from "./networking/peerjs-adapter";
export type { PeerJSAdapterOptions } from "./networking/peerjs-adapter";
export { MemoryAdapter, resetMemoryAdapter } from "./networking/memory-adapter";

/* Profiles */
export { classicProfile } from "./profiles/classic";
export type { ClassicEvents, ClassicButton } from "./profiles/classic";
export { arcadeProfile } from "./profiles/arcade";
export type { ArcadeEvents, ArcadeButton } from "./profiles/arcade";
export { tiltProfile } from "./profiles/tilt";
export type { TiltEvents, TiltButton } from "./profiles/tilt";
export { registerProfile, getProfile } from "./profiles/registry";
export type { ControllerProfile, RenderContext } from "./profiles/profile";

/* UI */
export { installLandscapeLock } from "./ui/landscape";

/* Misc */
export type { EventMap, PlayerStatus, JoinRejectReason } from "./types";
export {
  OpenControlError,
  RoomUnavailableError,
  RoomNotFoundError,
  JoinRejectedError,
  ConnectionTimeoutError,
} from "./errors";
export { generateRoomCode, normalizeRoomCode } from "./utils/room-code";
export { Emitter } from "./events/emitter";
export type { Unsubscribe } from "./events/emitter";
