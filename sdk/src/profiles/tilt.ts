import type { ControllerProfile, RenderContext } from "./profile";
import { installTouchGuards } from "./touch-guards";
import { syntheticRotation } from "../ui/landscape";

/**
 * Tilt profile — gyro steering (hold the phone like a steering wheel) +
 * left/right triggers + A/B buttons. Built for racing games.
 *
 * Steering comes from `deviceorientation`. On browsers that gate motion
 * sensors behind a permission prompt (iOS Safari), the UI shows an
 * "enable tilt" overlay first — the permission request must run inside
 * a user gesture.
 *
 * Games depend on this event contract only; the UI may change between
 * versions.
 */

export type TiltButton = "a" | "b";

export type TiltEvents = {
  /** Steering from device tilt. value ∈ [-1, 1]; negative = left. Fires on change. */
  tilt: { value: number };
  buttonDown: { button: TiltButton };
  buttonUp: { button: TiltButton };
  /** Triggers. value 1 on press, 0 on release. */
  trigger: { side: "left" | "right"; value: number };
};

export const tiltProfile: ControllerProfile<TiltEvents> = {
  id: "tilt",
  version: 1,
  render: renderTilt,
};

/* ------------------------------------------------------------------ */
/* UI implementation                                                   */
/* ------------------------------------------------------------------ */

const STYLE_ID = "opencontrol-tilt-style";

const CSS = `
.oct-tilt {
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
.oct-top {
  display: flex;
  justify-content: center;
  gap: 8px;
  padding: calc(8px + env(safe-area-inset-top)) 12px 4px;
}
.oct-chip {
  background: rgba(255,255,255,.08);
  border: 1px solid rgba(255,255,255,.12);
  border-radius: 999px;
  padding: 4px 14px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: .14em;
}
.oct-chip-warn { border-color: rgba(255,90,95,.5); color: #ff8a8e; }
.oct-main {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 max(5vw, env(safe-area-inset-left)) calc(16px + env(safe-area-inset-bottom));
  gap: 16px;
}
.oct-center {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.oct-gauge {
  position: relative;
  width: min(100%, 340px);
  height: clamp(44px, 10vmin, 64px);
  border-radius: 999px;
  background: rgba(255,255,255,.05);
  border: 1px solid rgba(255,255,255,.1);
  touch-action: none;
}
.oct-gauge::before {
  content: "";
  position: absolute;
  left: 50%;
  top: 18%;
  bottom: 18%;
  width: 2px;
  transform: translateX(-50%);
  background: rgba(255,255,255,.18);
  border-radius: 2px;
}
.oct-needle {
  position: absolute;
  left: 50%;
  top: 50%;
  width: clamp(30px, 7vmin, 44px);
  aspect-ratio: 1;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, rgba(255,255,255,.4), rgba(255,255,255,.14) 60%);
  border: 1px solid rgba(255,255,255,.3);
  transform: translate(-50%, -50%);
  will-change: transform;
  pointer-events: none;
  box-shadow: 0 4px 12px rgba(0,0,0,.45);
}
.oct-hint {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: .14em;
  color: rgba(255,255,255,.45);
  text-align: center;
}
.oct-side {
  display: flex;
  flex-direction: column;
  gap: 14px;
  align-items: center;
  flex: none;
}
.oct-buttons { display: flex; gap: 14px; }
.oct-btn {
  width: clamp(48px, 11vmin, 72px);
  aspect-ratio: 1;
  border-radius: 50%;
  border: none;
  padding: 0;
  font-family: inherit;
  font-size: clamp(14px, 3vmin, 22px);
  font-weight: 800;
  color: rgba(0,0,0,.55);
  touch-action: none;
  -webkit-tap-highlight-color: transparent;
  box-shadow: 0 4px 0 rgba(0,0,0,.4), inset 0 1px 0 rgba(255,255,255,.35);
}
.oct-btn.oct-active {
  transform: translateY(3px);
  box-shadow: 0 1px 0 rgba(0,0,0,.4), inset 0 1px 0 rgba(255,255,255,.35);
  filter: brightness(1.15);
}
.oct-btn-a { background: #c792ea; }
.oct-btn-b { background: #4dd0e1; }
.oct-trigger {
  width: clamp(84px, 19vmin, 150px);
  height: clamp(110px, 26vmin, 200px);
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
.oct-trigger.oct-active {
  transform: translateY(4px);
  box-shadow: 0 1px 0 rgba(0,0,0,.4), inset 0 1px 0 rgba(255,255,255,.3);
  filter: brightness(1.12);
}
.oct-trigger-left { background: #ff5a5f; }
.oct-trigger-right { background: #46d369; }
.oct-overlay {
  position: absolute;
  inset: 0;
  background: rgba(10,11,14,.9);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  z-index: 10;
  padding: 24px;
  text-align: center;
}
.oct-overlay[hidden] { display: none; }
.oct-enable {
  border: none;
  border-radius: 999px;
  padding: 16px 32px;
  font-family: inherit;
  font-size: 16px;
  font-weight: 800;
  letter-spacing: .1em;
  color: rgba(0,0,0,.65);
  background: #46d369;
  -webkit-tap-highlight-color: transparent;
  box-shadow: 0 5px 0 rgba(0,0,0,.4), inset 0 1px 0 rgba(255,255,255,.3);
}
.oct-overlay-note {
  font-size: 12px;
  color: rgba(255,255,255,.5);
}
.oct-overlay-error { color: #ff8a8e; font-size: 13px; font-weight: 600; }
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

/** Tilt angle (deg) at which steering saturates at ±1. */
const MAX_TILT_DEG = 28;
const TILT_DEADZONE = 0.06;
const TILT_EPSILON = 0.02;
/** No sensor reading after this long → assume tilt is unavailable. */
const SENSOR_TIMEOUT_MS = 2500;

interface PermissionCapableOrientationEvent {
  requestPermission?: () => Promise<"granted" | "denied">;
}

/**
 * Steering angle in degrees from a deviceorientation reading, corrected
 * for how the screen is currently rotated. beta/gamma are reported in
 * the device's portrait frame, so the axis that means "steering wheel
 * roll" changes with screen orientation.
 *
 * The landscape lock's synthetic rotation counts too: with the OS pinned to
 * portrait but the UI CSS-rotated, the phone is physically held landscape,
 * so steering must use the landscape axis even though the OS reports 0°.
 */
function readSteeringAngle(event: DeviceOrientationEvent): number | null {
  const { beta, gamma } = event;
  if (beta === null || gamma === null) return null;
  const rotation =
    (screen.orientation?.angle ??
      (typeof window.orientation === "number" ? window.orientation : 0)) +
    syntheticRotation();
  switch ((rotation + 360) % 360) {
    case 90: return beta;    // landscape, rotated counter-clockwise
    case 270: return -beta;  // landscape, rotated clockwise
    case 180: return -gamma; // portrait upside down
    default: return gamma;   // portrait
  }
}

function renderTilt(container: HTMLElement, ctx: RenderContext<TiltEvents>): () => void {
  ensureStyles();
  container.classList.add("oct-tilt");
  const room = ctx.room.replace(/[^A-Z0-9-]/gi, "");

  container.innerHTML = `
    <div class="oct-top">
      <span class="oct-chip">P${ctx.playerIndex + 1}</span>
      <span class="oct-chip">${room}</span>
      <span class="oct-chip" data-oc="status">TILT</span>
    </div>
    <div class="oct-main">
      <button class="oct-trigger oct-trigger-left" data-trigger="left">BRAKE</button>
      <div class="oct-center">
        <div class="oct-gauge" data-oc="gauge">
          <div class="oct-needle"></div>
        </div>
        <div class="oct-hint">TILT TO STEER · TAP GAUGE TO RECENTER</div>
      </div>
      <div class="oct-side">
        <div class="oct-buttons">
          <button class="oct-btn oct-btn-b" data-btn="b">B</button>
          <button class="oct-btn oct-btn-a" data-btn="a">A</button>
        </div>
        <button class="oct-trigger oct-trigger-right" data-trigger="right">GAS</button>
      </div>
    </div>
    <div class="oct-overlay" data-oc="overlay" hidden>
      <button class="oct-enable" data-oc="enable">ENABLE TILT STEERING</button>
      <div class="oct-overlay-note">Uses your phone's motion sensor to steer</div>
      <div class="oct-overlay-error" data-oc="perm-error"></div>
    </div>
  `;

  const abort = new AbortController();
  const { signal } = abort;

  // Without these, a second finger can start a browser pinch/scroll gesture,
  // which pointercancels every active touch — multi-touch would go dead.
  installTouchGuards(container, signal);

  /* --- Tilt steering --- */
  const gauge = container.querySelector<HTMLElement>('[data-oc="gauge"]')!;
  const needle = container.querySelector<HTMLElement>(".oct-needle")!;
  const status = container.querySelector<HTMLElement>('[data-oc="status"]')!;
  const hint = container.querySelector<HTMLElement>(".oct-hint")!;

  let neutral: number | null = null; // first reading calibrates "straight ahead"
  let lastRaw = 0;
  let current = 0;
  let gotReading = false;
  let sensorTimer: ReturnType<typeof setTimeout> | undefined;

  const emitTilt = (value: number) => {
    if (Math.abs(value - current) < TILT_EPSILON && !(value === 0 && current !== 0)) return;
    current = value;
    ctx.emit("tilt", { value });
  };

  const onOrientation = (event: DeviceOrientationEvent) => {
    const raw = readSteeringAngle(event);
    if (raw === null) return;
    if (!gotReading) {
      gotReading = true;
      clearTimeout(sensorTimer);
      status.textContent = "TILT ON";
    }
    lastRaw = raw;
    if (neutral === null) neutral = raw;

    let value = (raw - neutral) / MAX_TILT_DEG;
    value = Math.max(-1, Math.min(1, value));
    if (Math.abs(value) < TILT_DEADZONE) value = 0;
    value = Math.round(value * 100) / 100;

    const range = gauge.clientWidth / 2 - needle.offsetWidth / 2 - 4;
    needle.style.transform = `translate(-50%, -50%) translateX(${value * range}px)`;
    emitTilt(value);
  };

  const startSensor = () => {
    addEventListener("deviceorientation", onOrientation, { signal });
    sensorTimer = setTimeout(() => {
      if (gotReading) return;
      status.textContent = "TILT N/A";
      status.classList.add("oct-chip-warn");
      hint.textContent = "NO MOTION SENSOR — NEEDS A PHONE OVER HTTPS";
    }, SENSOR_TIMEOUT_MS);
  };

  gauge.addEventListener("pointerdown", () => {
    if (!gotReading) return;
    neutral = lastRaw;
    hapticTap(8);
  }, { signal });

  /* --- iOS motion permission flow --- */
  const overlay = container.querySelector<HTMLElement>('[data-oc="overlay"]')!;
  const permissionError = container.querySelector<HTMLElement>('[data-oc="perm-error"]')!;
  // iOS exposes DeviceOrientationEvent.requestPermission as a static method that
  // must run with DeviceOrientationEvent as its `this`. Bind it — calling a
  // detached reference throws an illegal-invocation TypeError on WebKit.
  const rawRequestPermission =
    typeof DeviceOrientationEvent !== "undefined"
      ? (DeviceOrientationEvent as unknown as PermissionCapableOrientationEvent).requestPermission
      : undefined;
  const requestPermission =
    typeof rawRequestPermission === "function"
      ? rawRequestPermission.bind(DeviceOrientationEvent)
      : undefined;

  if (typeof requestPermission === "function") {
    overlay.hidden = false;
    const enable = container.querySelector<HTMLElement>('[data-oc="enable"]')!;
    enable.addEventListener("pointerdown", () => {
      requestPermission()
        .then((state) => {
          if (state === "granted") {
            overlay.hidden = true;
            startSensor();
          } else {
            permissionError.textContent = "Motion access denied — allow it in browser settings.";
          }
        })
        .catch(() => {
          permissionError.textContent = "Could not request motion access.";
        });
    }, { signal });
  } else {
    startSensor();
  }

  /* --- A/B buttons --- */
  for (const el of container.querySelectorAll<HTMLElement>("[data-btn]")) {
    const button = el.dataset.btn as TiltButton;
    let pointer: number | null = null;

    el.addEventListener("pointerdown", (event) => {
      if (pointer !== null) return;
      pointer = event.pointerId;
      el.setPointerCapture(event.pointerId);
      el.classList.add("oct-active");
      hapticTap();
      ctx.emit("buttonDown", { button });
    }, { signal });
    for (const type of ["pointerup", "pointercancel"] as const) {
      el.addEventListener(type, (event) => {
        if (event.pointerId !== pointer) return;
        pointer = null;
        el.classList.remove("oct-active");
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
      el.classList.add("oct-active");
      hapticTap();
      ctx.emit("trigger", { side, value: 1 });
    }, { signal });
    for (const type of ["pointerup", "pointercancel"] as const) {
      el.addEventListener(type, (event) => {
        if (event.pointerId !== pointer) return;
        pointer = null;
        el.classList.remove("oct-active");
        ctx.emit("trigger", { side, value: 0 });
      }, { signal });
    }
  }

  return () => {
    abort.abort();
    clearTimeout(sensorTimer);
    container.innerHTML = "";
    container.classList.remove("oct-tilt");
  };
}
