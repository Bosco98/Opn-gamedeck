/**
 * Shared types: event maps and the internal wire protocol.
 *
 * The wire protocol is an implementation detail — consumers never see these
 * messages. They only see typed controller events and session lifecycle events.
 */

/** A map of event name → payload type. Controller profiles define one of these. */
export type EventMap = Record<string, unknown>;

export type PlayerStatus = "connected" | "reconnecting";

export type JoinRejectReason = "full" | "profile-mismatch";

/** Controller → Host wire messages. */
export type ControllerMessage =
  | { t: "hello"; profile: string; name?: string; resume?: string }
  | { t: "input"; event: string; data: unknown }
  | { t: "bye" };

/** Host → Controller wire messages. */
export type HostMessage =
  | { t: "welcome"; playerId: string; index: number; resume: string; profile: string }
  | { t: "reject"; reason: JoinRejectReason }
  | { t: "vibrate"; pattern: number | number[] }
  | { t: "message"; type: string; data?: unknown }
  | { t: "closed" };

export type WelcomeMessage = Extract<HostMessage, { t: "welcome" }>;

export function parseMessage<T>(raw: string): T | null {
  try {
    const value = JSON.parse(raw) as T & { t?: unknown };
    if (typeof value !== "object" || value === null || typeof value.t !== "string") return null;
    return value;
  } catch {
    return null;
  }
}
