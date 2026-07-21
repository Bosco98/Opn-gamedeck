import type { EventMap } from "../types";

/** Passed to a profile's renderer so its UI can emit contract events. */
export interface RenderContext<E extends EventMap = EventMap> {
  emit<K extends keyof E>(event: K, data: E[K]): void;
  playerIndex: number;
  room: string;
}

/**
 * A controller profile = a versioned event contract + (optionally) a
 * built-in UI. Games depend only on the contract; the UI is an
 * implementation detail and may change between versions.
 */
export interface ControllerProfile<E extends EventMap = EventMap> {
  id: string;
  version: number;
  /** Render the built-in UI into a container. Returns a cleanup function. */
  render?: (container: HTMLElement, context: RenderContext<E>) => () => void;
}
