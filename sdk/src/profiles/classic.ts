import type { ControllerProfile, RenderContext } from "./profile";
import { installTouchGuards } from "./touch-guards";
import { localStickDelta } from "../ui/landscape";

/**
 * Classic profile — D-pad + A/B/X/Y + Start/Select.
 * Great for platformers, fighting games, puzzle games.
 *
 * Games depend on this event contract only. The UI below is an
 * implementation detail and free to change in future versions.
 */

export type ClassicButton = "a" | "b" | "x" | "y";

export type ClassicEvents = {
  /** D-pad state. x/y ∈ {-1, 0, 1}; y = -1 is up. Fires on change. */
  move: { x: number; y: number };
  buttonDown: { button: ClassicButton };
  buttonUp: { button: ClassicButton };
  start: Record<string, never>;
  select: Record<string, never>;
};

export const classicProfile: ControllerProfile<ClassicEvents> = {
  id: "classic",
  version: 1,
  render: renderClassic,
};

/* ------------------------------------------------------------------ */
/* UI implementation                                                   */
/* ------------------------------------------------------------------ */

const STYLE_ID = "opencontrol-classic-style";

const CSS = `
.ocx-classic {
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
.ocx-top {
  display: flex;
  justify-content: center;
  gap: 8px;
  padding: calc(8px + env(safe-area-inset-top)) 12px 4px;
}
.ocx-chip {
  background: rgba(255,255,255,.08);
  border: 1px solid rgba(255,255,255,.12);
  border-radius: 999px;
  padding: 4px 14px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: .14em;
}
.ocx-main {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 max(5vw, env(safe-area-inset-left)) calc(16px + env(safe-area-inset-bottom));
  gap: 12px;
}
.ocx-dpad {
  position: relative;
  width: clamp(150px, 38vmin, 280px);
  aspect-ratio: 1;
  border-radius: 50%;
  background: rgba(255,255,255,.05);
  border: 1px solid rgba(255,255,255,.1);
  flex: none;
  touch-action: none;
}
.ocx-dpad-cross::before, .ocx-dpad-cross::after {
  content: "";
  position: absolute;
  background: rgba(255,255,255,.07);
  border-radius: 14px;
}
.ocx-dpad-cross::before { left: 50%; top: 9%; bottom: 9%; width: 32%; transform: translateX(-50%); }
.ocx-dpad-cross::after  { top: 50%; left: 9%; right: 9%; height: 32%; transform: translateY(-50%); }
.ocx-thumb {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 36%;
  aspect-ratio: 1;
  border-radius: 50%;
  background: rgba(255,255,255,.16);
  border: 1px solid rgba(255,255,255,.28);
  transform: translate(-50%, -50%);
  transition: transform .06s linear;
  will-change: transform;
  pointer-events: none;
}
.ocx-face {
  position: relative;
  width: clamp(150px, 38vmin, 280px);
  aspect-ratio: 1;
  flex: none;
}
.ocx-btn {
  position: absolute;
  width: 34%;
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
.ocx-btn.ocx-active {
  transform: translateY(3px);
  box-shadow: 0 1px 0 rgba(0,0,0,.4), inset 0 1px 0 rgba(255,255,255,.35);
  filter: brightness(1.15);
}
.ocx-btn-y { left: 33%; top: 0;   background: #ffd042; }
.ocx-btn-x { left: 0;   top: 33%; background: #4aa8ff; }
.ocx-btn-b { left: 66%; top: 33%; background: #ff5a5f; }
.ocx-btn-a { left: 33%; top: 66%; background: #46d369; }
.ocx-center {
  position: absolute;
  bottom: calc(10px + env(safe-area-inset-bottom));
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 10px;
}
.ocx-pill {
  background: rgba(255,255,255,.1);
  border: 1px solid rgba(255,255,255,.16);
  color: #cfd3dc;
  border-radius: 999px;
  padding: 9px 20px;
  font-family: inherit;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: .16em;
  touch-action: none;
  -webkit-tap-highlight-color: transparent;
}
.ocx-pill.ocx-active { background: rgba(255,255,255,.28); }
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

// Octant index (angle / 45°) → d-pad direction. Screen coords: +y is down.
const OCTANTS: Record<number, { x: number; y: number }> = {
  0: { x: 1, y: 0 },
  1: { x: 1, y: 1 },
  2: { x: 0, y: 1 },
  3: { x: -1, y: 1 },
  4: { x: -1, y: 0 },
  [-4]: { x: -1, y: 0 },
  [-3]: { x: -1, y: -1 },
  [-2]: { x: 0, y: -1 },
  [-1]: { x: 1, y: -1 },
};

const DPAD_DEADZONE = 0.28;

function renderClassic(container: HTMLElement, ctx: RenderContext<ClassicEvents>): () => void {
  ensureStyles();
  container.classList.add("ocx-classic");
  const room = ctx.room.replace(/[^A-Z0-9-]/gi, "");

  container.innerHTML = `
    <div class="ocx-top">
      <span class="ocx-chip">P${ctx.playerIndex + 1}</span>
      <span class="ocx-chip">${room}</span>
    </div>
    <div class="ocx-main">
      <div class="ocx-dpad" data-oc="dpad">
        <div class="ocx-dpad-cross"></div>
        <div class="ocx-thumb"></div>
      </div>
      <div class="ocx-face">
        <button class="ocx-btn ocx-btn-y" data-btn="y">Y</button>
        <button class="ocx-btn ocx-btn-x" data-btn="x">X</button>
        <button class="ocx-btn ocx-btn-b" data-btn="b">B</button>
        <button class="ocx-btn ocx-btn-a" data-btn="a">A</button>
      </div>
    </div>
    <div class="ocx-center">
      <button class="ocx-pill" data-pill="select">SELECT</button>
      <button class="ocx-pill" data-pill="start">START</button>
    </div>
  `;

  const abort = new AbortController();
  const { signal } = abort;

  // Without these, a second finger can start a browser pinch/scroll gesture,
  // which pointercancels every active touch — multi-touch would go dead.
  installTouchGuards(container, signal);

  /* --- D-pad: single pad, 8-way, supports sliding --- */
  const dpad = container.querySelector<HTMLElement>('[data-oc="dpad"]')!;
  const thumb = container.querySelector<HTMLElement>(".ocx-thumb")!;
  let current = { x: 0, y: 0 };
  let dpadPointer: number | null = null;

  const setMove = (x: number, y: number) => {
    if (x === current.x && y === current.y) return;
    current = { x, y };
    ctx.emit("move", { x, y });
  };

  const updateDpad = (event: PointerEvent) => {
    const size = dpad.getBoundingClientRect().width;
    let { dx, dy } = localStickDelta(event, dpad);
    const distance = Math.hypot(dx, dy);
    if (distance > 1) {
      dx /= distance;
      dy /= distance;
    }
    thumb.style.transform = `translate(-50%, -50%) translate(${dx * size * 0.28}px, ${dy * size * 0.28}px)`;
    if (distance < DPAD_DEADZONE) {
      setMove(0, 0);
      return;
    }
    const octant = Math.round(Math.atan2(dy, dx) / (Math.PI / 4));
    const direction = OCTANTS[octant] ?? { x: 0, y: 0 };
    setMove(direction.x, direction.y);
  };

  const releaseDpad = () => {
    dpadPointer = null;
    thumb.style.transform = "translate(-50%, -50%)";
    setMove(0, 0);
  };

  dpad.addEventListener("pointerdown", (event) => {
    if (dpadPointer !== null) return;
    dpadPointer = event.pointerId;
    dpad.setPointerCapture(event.pointerId);
    hapticTap(8);
    updateDpad(event);
  }, { signal });
  dpad.addEventListener("pointermove", (event) => {
    if (event.pointerId === dpadPointer) updateDpad(event);
  }, { signal });
  for (const type of ["pointerup", "pointercancel"] as const) {
    dpad.addEventListener(type, (event) => {
      if (event.pointerId === dpadPointer) releaseDpad();
    }, { signal });
  }

  /* --- Face buttons: independent multi-touch --- */
  for (const el of container.querySelectorAll<HTMLElement>("[data-btn]")) {
    const button = el.dataset.btn as ClassicButton;
    let pointer: number | null = null;

    const press = (event: PointerEvent) => {
      if (pointer !== null) return;
      pointer = event.pointerId;
      el.setPointerCapture(event.pointerId);
      el.classList.add("ocx-active");
      hapticTap();
      ctx.emit("buttonDown", { button });
    };
    const release = (event: PointerEvent) => {
      if (event.pointerId !== pointer) return;
      pointer = null;
      el.classList.remove("ocx-active");
      ctx.emit("buttonUp", { button });
    };

    el.addEventListener("pointerdown", press, { signal });
    el.addEventListener("pointerup", release, { signal });
    el.addEventListener("pointercancel", release, { signal });
  }

  /* --- Start / Select --- */
  for (const el of container.querySelectorAll<HTMLElement>("[data-pill]")) {
    const which = el.dataset.pill as "start" | "select";
    el.addEventListener("pointerdown", () => {
      el.classList.add("ocx-active");
      hapticTap();
      ctx.emit(which, {});
    }, { signal });
    for (const type of ["pointerup", "pointercancel"] as const) {
      el.addEventListener(type, () => el.classList.remove("ocx-active"), { signal });
    }
  }

  return () => {
    abort.abort();
    container.innerHTML = "";
    container.classList.remove("ocx-classic");
  };
}
