import { OpenControlError } from "../errors";
import type { EventMap } from "../types";
import type { ControllerProfile } from "./profile";

const profiles = new Map<string, ControllerProfile>();

export function registerProfile<E extends EventMap>(profile: ControllerProfile<E>): void {
  profiles.set(profile.id, profile as unknown as ControllerProfile);
}

export function getProfile(id: string): ControllerProfile {
  const profile = profiles.get(id);
  if (!profile) {
    const known = [...profiles.keys()].join(", ") || "(none)";
    throw new OpenControlError(`Unknown controller profile "${id}". Registered profiles: ${known}`);
  }
  return profile;
}
