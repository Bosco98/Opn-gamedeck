import type { ControllerProfile, RenderContext } from "./profile";
import { installTouchGuards } from "./touch-guards";

/**
 * Menu profile — 4-way navigation pad + confirm/back.
 * Made for console shells and game-select screens: discrete presses with
 * hold-to-repeat, not analog state.
 *
 * Games (or shells) depend on this event contract only.
 */

export type MenuDirection = "up" | "down" | "left" | "right";

export type MenuEvents = {
  /** One discrete step. Repeats while the pad is held. */
  navigate: { dir: MenuDirection };
  confirm: Record<string, never>;
  back: Record<string, never>;
};

export const menuProfile: ControllerProfile<MenuEvents> = {
  id: "menu",
  version: 1,
  render: renderMenu,
};

/* ------------------------------------------------------------------ */
/* UI implementation                                                   */
/* ------------------------------------------------------------------ */

const STYLE_ID = "opencontrol-menu-style";

const REPEAT_DELAY_MS = 400;
const REPEAT_INTERVAL_MS = 150;

const CSS = `
.ocm-menu {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: radial-gradient(120% 120% at 50% 0%, #23262e 0%, #101216 60%, #0a0b0e 100%);
  color: #e8eaf0;
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
  -webkit-tap-highlight-color: transparent;
  touch-action: none;
  overscroll-behavior: none;
  display: flex;
  flex-direction: column;
}
.ocm-top {
  display: flex;
  justify-content: center;
  gap: 8px;
  padding: calc(8px + env(safe-area-inset-top)) 12px 4px;
}
.ocm-chip {
  background: rgba(255,255,255,.08);
  border: 1px solid rgba(255,255,255,.12);
  border-radius: 999px;
  padding: 4px 14px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: .14em;
}
.ocm-main {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 max(5vw, env(safe-area-inset-left)) calc(16px + env(safe-area-inset-bottom));
  gap: 12px;
}
.ocm-pad {
  position: relative;
  width: calc(clamp(170px, 44vmin, 320px) * var(--oc-scale, 1));
  aspect-ratio: 1;
  flex: none;
}
.ocm-arrow {
  position: absolute;
  width: 34%;
  aspect-ratio: 1;
  border: 1px solid rgba(255,255,255,.14);
  border-radius: 18px;
  padding: 0;
  background: rgba(255,255,255,.07);
  color: #cfd3dc;
  font-family: inherit;
  font-size: clamp(18px, 4vmin, 28px);
  display: flex;
  align-items: center;
  justify-content: center;
  touch-action: none;
  -webkit-tap-highlight-color: transparent;
}
.ocm-arrow.ocm-active { background: rgba(255,255,255,.24); color: #ffffff; }
.ocm-arrow-up    { left: 33%; top: 0; }
.ocm-arrow-left  { left: 0;   top: 33%; }
.ocm-arrow-right { left: 66%; top: 33%; }
.ocm-arrow-down  { left: 33%; top: 66%; }
.ocm-hub {
  position: absolute;
  left: 33%;
  top: 33%;
  width: 34%;
  aspect-ratio: 1;
  border-radius: 50%;
  background: rgba(255,255,255,.04);
  border: 1px solid rgba(255,255,255,.08);
}
.ocm-face {
  position: relative;
  width: calc(clamp(170px, 44vmin, 320px) * var(--oc-scale, 1));
  aspect-ratio: 1;
  flex: none;
}
.ocm-btn {
  position: absolute;
  width: 40%;
  aspect-ratio: 1;
  border-radius: 50%;
  border: none;
  padding: 0;
  font-family: inherit;
  font-size: clamp(16px, 3.6vmin, 26px);
  font-weight: 800;
  color: rgba(0,0,0,.55);
  display: flex;
  align-items: center;
  justify-content: center;
  touch-action: none;
  -webkit-tap-highlight-color: transparent;
  box-shadow: 0 4px 0 rgba(0,0,0,.4), inset 0 1px 0 rgba(255,255,255,.35);
}
.ocm-btn.ocm-active {
  transform: translateY(3px);
  box-shadow: 0 1px 0 rgba(0,0,0,.4), inset 0 1px 0 rgba(255,255,255,.35);
  filter: brightness(1.15);
}
.ocm-btn-a { left: 44%; top: 52%; background: #46d369; }
.ocm-btn-b { left: 6%;  top: 16%; background: #ff5a5f; }
.ocm-hint {
  position: absolute;
  bottom: calc(10px + env(safe-area-inset-bottom));
  left: 50%;
  transform: translateX(-50%);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: .16em;
  color: #9aa1af;
  white-space: nowrap;
}
`;

function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}

function hapticTap(duration = 10): void {
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    navigator.vibrate(duration);
  }
}

function renderMenu(container: HTMLElement, ctx: RenderContext<MenuEvents>): () => void {
  ensureStyles();
  container.classList.add("ocm-menu");
  const room = ctx.room.replace(/[^A-Z0-9-]/gi, "");

  container.innerHTML = `
    <div class="ocm-top">
      <span class="ocm-chip">P${ctx.playerIndex + 1}</span>
      <span class="ocm-chip">${room}</span>
    </div>
    <div class="ocm-main">
      <div class="ocm-pad">
        <div class="ocm-hub"></div>
        <button class="ocm-arrow ocm-arrow-up" data-dir="up">▲</button>
        <button class="ocm-arrow ocm-arrow-left" data-dir="left">◀</button>
        <button class="ocm-arrow ocm-arrow-right" data-dir="right">▶</button>
        <button class="ocm-arrow ocm-arrow-down" data-dir="down">▼</button>
      </div>
      <div class="ocm-face">
        <button class="ocm-btn ocm-btn-b" data-btn="back">B</button>
        <button class="ocm-btn ocm-btn-a" data-btn="confirm">A</button>
      </div>
    </div>
    <div class="ocm-hint">A · SELECT&nbsp;&nbsp;&nbsp;B · BACK</div>
  `;

  const abort = new AbortController();
  const { signal } = abort;
  installTouchGuards(container, signal);

  const timers = new Set<ReturnType<typeof setTimeout>>();
  const clearTimers = () => {
    for (const timer of timers) clearTimeout(timer);
    timers.clear();
  };
  signal.addEventListener("abort", clearTimers);

  /* --- Arrows: discrete navigate with hold-to-repeat --- */
  for (const el of container.querySelectorAll<HTMLElement>("[data-dir]")) {
    const dir = el.dataset.dir as MenuDirection;
    let pointer: number | null = null;
    let delayTimer: ReturnType<typeof setTimeout> | null = null;
    let repeatTimer: ReturnType<typeof setInterval> | null = null;

    const stopRepeat = () => {
      if (delayTimer !== null) {
        clearTimeout(delayTimer);
        timers.delete(delayTimer);
        delayTimer = null;
      }
      if (repeatTimer !== null) {
        clearInterval(repeatTimer);
        timers.delete(repeatTimer);
        repeatTimer = null;
      }
    };

    const press = (event: PointerEvent) => {
      if (pointer !== null) return;
      pointer = event.pointerId;
      el.setPointerCapture(event.pointerId);
      el.classList.add("ocm-active");
      hapticTap(8);
      ctx.emit("navigate", { dir });
      delayTimer = setTimeout(() => {
        repeatTimer = setInterval(() => ctx.emit("navigate", { dir }), REPEAT_INTERVAL_MS);
        timers.add(repeatTimer);
      }, REPEAT_DELAY_MS);
      timers.add(delayTimer);
    };
    const release = (event: PointerEvent) => {
      if (event.pointerId !== pointer) return;
      pointer = null;
      el.classList.remove("ocm-active");
      stopRepeat();
    };

    el.addEventListener("pointerdown", press, { signal });
    el.addEventListener("pointerup", release, { signal });
    el.addEventListener("pointercancel", release, { signal });
  }

  /* --- Confirm / Back --- */
  for (const el of container.querySelectorAll<HTMLElement>("[data-btn]")) {
    const action = el.dataset.btn as "confirm" | "back";
    let pointer: number | null = null;

    el.addEventListener("pointerdown", (event) => {
      if (pointer !== null) return;
      pointer = event.pointerId;
      el.setPointerCapture(event.pointerId);
      el.classList.add("ocm-active");
      hapticTap();
      ctx.emit(action, {});
    }, { signal });
    for (const type of ["pointerup", "pointercancel"] as const) {
      el.addEventListener(type, (event) => {
        if (event.pointerId !== pointer) return;
        pointer = null;
        el.classList.remove("ocm-active");
      }, { signal });
    }
  }

  return () => {
    abort.abort();
    container.innerHTML = "";
    container.classList.remove("ocm-menu");
  };
}
