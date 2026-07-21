/**
 * Console ↔ phone application messages, carried over the SDK's generic
 * `player.send()` / `session.on("message")` channel. Single source of truth
 * for both the shell and the universal controller page.
 *
 * The `oc:` prefix is reserved: the cartridge relay never forwards inbound
 * input events or outbound game messages that use it.
 */

export const OC_PREFIX = "oc:";

/** Host → controller: render this profile's UI. */
export const MSG_PROFILE = "oc:profile";
export interface ProfilePayload {
  profile: string;
}

/** Host → controller: you do / don't hold the crown (player 1 rights). */
export const MSG_CROWN = "oc:crown";
export interface CrownPayload {
  crown: boolean;
}

/** Host → controller: transient notice ("game is full", …). */
export const MSG_TOAST = "oc:toast";
export interface ToastPayload {
  text: string;
}

/** Controller → host input event: crown held the Home button. */
export const INPUT_HOME = "oc:home";

export function isReservedType(type: string): boolean {
  return type.startsWith(OC_PREFIX);
}
