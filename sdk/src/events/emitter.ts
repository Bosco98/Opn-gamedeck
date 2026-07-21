import type { EventMap } from "../types";

export type Unsubscribe = () => void;

/**
 * Minimal fully-typed event emitter.
 *
 * `E` maps event names to payload types, so both `on` and `emit` are
 * type-checked end to end.
 */
export class Emitter<E extends EventMap> {
  private listeners = new Map<keyof E, Set<(payload: never) => void>>();

  on<K extends keyof E>(event: K, listener: (payload: E[K]) => void): Unsubscribe {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener as (payload: never) => void);
    return () => this.off(event, listener);
  }

  once<K extends keyof E>(event: K, listener: (payload: E[K]) => void): Unsubscribe {
    const off = this.on(event, (payload) => {
      off();
      listener(payload);
    });
    return off;
  }

  off<K extends keyof E>(event: K, listener: (payload: E[K]) => void): void {
    this.listeners.get(event)?.delete(listener as (payload: never) => void);
  }

  emit<K extends keyof E>(event: K, payload: E[K]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const listener of [...set]) {
      (listener as (payload: E[K]) => void)(payload);
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}
