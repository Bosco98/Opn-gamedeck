import type { ControllerProfile, RenderContext } from "./profile";
import { installTouchGuards } from "./touch-guards";
import { localStickDelta } from "../ui/landscape";

/**
 * Arcade profile — analog joystick + A/B buttons + left/right triggers.
 * Great for racing games and shooters.
 *
 * Games depend on this event contract only; the UI may change between
 * versions.
 */

export type ArcadeButton = "a" | "b";

export type ArcadeEvents = {
  /** Analog stick. x/y ∈ [-1, 1]; y = -1 is up. Fires on change. */
  joystick: { x: number; y: number };
  buttonDown: { button: ArcadeButton };
  buttonUp: { button: ArcadeButton };
  /** Triggers. value 1 on press, 0 on release. */
  trigger: { side: "left" | "right"; value: number };
};

export const arcadeProfile: ControllerProfile<ArcadeEvents> = {
  id: "arcade",
  version: 1,
  render: renderArcade,
};

/* ------------------------------------------------------------------ */
/* UI implementation                                                   */
/* ------------------------------------------------------------------ */

const STYLE_ID = "opencontrol-arcade-style";

const CSS = `
.oca-arcade {
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
.oca-top {
  display: flex;
  justify-content: center;
  gap: 8px;
  padding: calc(8px + env(safe-area-inset-top)) 12px 4px;
}
.oca-chip {
  background: rgba(255,255,255,.08);
  border: 1px solid rgba(255,255,255,.12);
  border-radius: 999px;
  padding: 4px 14px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: .14em;
}
.oca-main {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 max(5vw, env(safe-area-inset-left)) calc(16px + env(safe-area-inset-bottom));
  gap: 16px;
}
.oca-stick {
  position: relative;
  width: calc(clamp(170px, 46vmin, 340px) * var(--oc-scale, 1));
  aspect-ratio: 1;
  border-radius: 50%;
  background: rgba(255,255,255,.05);
  border: 1px solid rgba(255,255,255,.1);
  flex: none;
  touch-action: none;
}
.oca-stick::before {
  content: "";
  position: absolute;
  inset: 30%;
  border-radius: 50%;
  border: 1px dashed rgba(255,255,255,.12);
}
.oca-thumb {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 38%;
  aspect-ratio: 1;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, rgba(255,255,255,.35), rgba(255,255,255,.12) 60%);
  border: 1px solid rgba(255,255,255,.3);
  transform: translate(-50%, -50%);
  will-change: transform;
  pointer-events: none;
  box-shadow: 0 6px 18px rgba(0,0,0,.45);
}
.oca-right {
  display: flex;
  flex-direction: column;
  gap: 14px;
  align-items: flex-end;
  flex: none;
}
.oca-buttons { display: flex; gap: 14px; }
.oca-btn {
  width: calc(clamp(60px, 14vmin, 94px) * var(--oc-scale, 1));
  aspect-ratio: 1;
  border-radius: 50%;
  border: none;
  padding: 0;
  font-family: inherit;
  font-size: clamp(15px, 3.2vmin, 24px);
  font-weight: 800;
  color: rgba(0,0,0,.55);
  touch-action: none;
  -webkit-tap-highlight-color: transparent;
  box-shadow: 0 4px 0 rgba(0,0,0,.4), inset 0 1px 0 rgba(255,255,255,.35);
}
.oca-btn.oca-active {
  transform: translateY(3px);
  box-shadow: 0 1px 0 rgba(0,0,0,.4), inset 0 1px 0 rgba(255,255,255,.35);
  filter: brightness(1.15);
}
.oca-btn-a { background: #c792ea; }
.oca-btn-b { background: #4dd0e1; }
.oca-triggers { display: flex; gap: 14px; }
.oca-trigger {
  width: calc(clamp(92px, 21vmin, 164px) * var(--oc-scale, 1));
  height: calc(clamp(120px, 28vmin, 220px) * var(--oc-scale, 1));
  border: none;
  border-radius: 22px;
  padding: 0;
  font-family: inherit;
  font-size: clamp(13px, 2.8vmin, 20px);
  font-weight: 800;
  letter-spacing: .1em;
  color: rgba(0,0,0,.6);
  touch-action: none;
  -webkit-tap-highlight-color: transparent;
  box-shadow: 0 5px 0 rgba(0,0,0,.4), inset 0 1px 0 rgba(255,255,255,.3);
}
.oca-trigger.oca-active {
  transform: translateY(4px);
  box-shadow: 0 1px 0 rgba(0,0,0,.4), inset 0 1px 0 rgba(255,255,255,.3);
  filter: brightness(1.12);
}
.oca-trigger-left { background: #ff5a5f; }
.oca-trigger-right { background: #46d369; }
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

const STICK_DEADZONE = 0.08;
const STICK_EPSILON = 0.03;

function renderArcade(container: HTMLElement, ctx: RenderContext<ArcadeEvents>): () => void {
  ensureStyles();
  container.classList.add("oca-arcade");
  const room = ctx.room.replace(/[^A-Z0-9-]/gi, "");

  container.innerHTML = `
    <div class="oca-top">
      <span class="oca-chip">P${ctx.playerIndex + 1}</span>
      <span class="oca-chip">${room}</span>
    </div>
    <div class="oca-main">
      <div class="oca-stick" data-oc="stick">
        <div class="oca-thumb"></div>
      </div>
      <div class="oca-right">
        <div class="oca-buttons">
          <button class="oca-btn oca-btn-b" data-btn="b">B</button>
          <button class="oca-btn oca-btn-a" data-btn="a">A</button>
        </div>
        <div class="oca-triggers">
          <button class="oca-trigger oca-trigger-left" data-trigger="left">BRAKE</button>
          <button class="oca-trigger oca-trigger-right" data-trigger="right">GAS</button>
        </div>
      </div>
    </div>
  `;

  const abort = new AbortController();
  const { signal } = abort;

  // Without these, a second finger can start a browser pinch/scroll gesture,
  // which pointercancels every active touch — multi-touch would go dead.
  installTouchGuards(container, signal);

  /* --- Analog joystick --- */
  const stick = container.querySelector<HTMLElement>('[data-oc="stick"]')!;
  const thumb = container.querySelector<HTMLElement>(".oca-thumb")!;
  let current = { x: 0, y: 0 };
  let stickPointer: number | null = null;

  const emitStick = (x: number, y: number) => {
    if (Math.abs(x - current.x) < STICK_EPSILON && Math.abs(y - current.y) < STICK_EPSILON) return;
    current = { x, y };
    ctx.emit("joystick", { x, y });
  };

  const updateStick = (event: PointerEvent) => {
    const size = stick.getBoundingClientRect().width;
    let { dx, dy } = localStickDelta(event, stick);
    const distance = Math.hypot(dx, dy);
    if (distance > 1) {
      dx /= distance;
      dy /= distance;
    }
    thumb.style.transform = `translate(-50%, -50%) translate(${dx * size * 0.3}px, ${dy * size * 0.3}px)`;
    if (distance < STICK_DEADZONE) {
      emitStick(0, 0);
      return;
    }
    emitStick(Math.round(dx * 100) / 100, Math.round(dy * 100) / 100);
  };

  const releaseStick = () => {
    stickPointer = null;
    thumb.style.transform = "translate(-50%, -50%)";
    current = { x: NaN, y: NaN }; // force the zero emit through the epsilon check
    emitStick(0, 0);
  };

  stick.addEventListener("pointerdown", (event) => {
    if (stickPointer !== null) return;
    stickPointer = event.pointerId;
    stick.setPointerCapture(event.pointerId);
    hapticTap(8);
    updateStick(event);
  }, { signal });
  stick.addEventListener("pointermove", (event) => {
    if (event.pointerId === stickPointer) updateStick(event);
  }, { signal });
  for (const type of ["pointerup", "pointercancel"] as const) {
    stick.addEventListener(type, (event) => {
      if (event.pointerId === stickPointer) releaseStick();
    }, { signal });
  }

  /* --- A/B buttons --- */
  for (const el of container.querySelectorAll<HTMLElement>("[data-btn]")) {
    const button = el.dataset.btn as ArcadeButton;
    let pointer: number | null = null;

    el.addEventListener("pointerdown", (event) => {
      if (pointer !== null) return;
      pointer = event.pointerId;
      el.setPointerCapture(event.pointerId);
      el.classList.add("oca-active");
      hapticTap();
      ctx.emit("buttonDown", { button });
    }, { signal });
    for (const type of ["pointerup", "pointercancel"] as const) {
      el.addEventListener(type, (event) => {
        if (event.pointerId !== pointer) return;
        pointer = null;
        el.classList.remove("oca-active");
        ctx.emit("buttonUp", { button });
      }, { signal });
    }
  }

  /* --- Triggers --- */
  for (const el of container.querySelectorAll<HTMLElement>("[data-trigger]")) {
    const side = el.dataset.trigger as "left" | "right";
    let pointer: number | null = null;

    el.addEventListener("pointerdown", (event) => {
      if (pointer !== null) return;
      pointer = event.pointerId;
      el.setPointerCapture(event.pointerId);
      el.classList.add("oca-active");
      hapticTap();
      ctx.emit("trigger", { side, value: 1 });
    }, { signal });
    for (const type of ["pointerup", "pointercancel"] as const) {
      el.addEventListener(type, (event) => {
        if (event.pointerId !== pointer) return;
        pointer = null;
        el.classList.remove("oca-active");
        ctx.emit("trigger", { side, value: 0 });
      }, { signal });
    }
  }

  return () => {
    abort.abort();
    container.innerHTML = "";
    container.classList.remove("oca-arcade");
  };
}
