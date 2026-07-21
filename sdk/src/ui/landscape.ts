/**
 * Landscape lock — controller layouts are landscape-only. When the viewport
 * is portrait-shaped (phone held upright, or the OS rotation lock pinning it
 * there), the UI is rotated 90° with CSS so it still renders landscape,
 * using the longer viewport edge as its width.
 *
 * A native `screen.orientation.lock("landscape")` is attempted too, but most
 * mobile browsers only honor it in fullscreen — the CSS rotation is the
 * fallback that always works.
 *
 * The rotation is applied to a dedicated "surface" element the profile UI
 * renders into, not the mount itself. Anything that maps screen coordinates
 * into UI space (stick math, tilt axes) must correct for the synthetic
 * rotation via `syntheticRotation()` / `localStickDelta()`.
 */

const STYLE_ID = "opencontrol-landscape-style";

const CSS = `
.oc-landscape-host {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
}
.oc-landscape-host > .oc-landscape-surface {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
}
.oc-landscape-host > .oc-landscape-surface.oc-rotated {
  transform: rotate(90deg);
  transform-origin: 0 0;
}
`;

function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}

// `lock`/`unlock` are missing from some TS DOM libs and some browsers alike.
interface LockCapableOrientation {
  lock?: (orientation: string) => Promise<void>;
  unlock?: () => void;
}

/** Synthetic rotation currently applied to the controller UI, in degrees. */
let activeRotation: 0 | 90 = 0;

export function syntheticRotation(): 0 | 90 {
  return activeRotation;
}

/**
 * Normalized pointer offset from a (square) stick element's center, in the
 * UI's local space — corrects for the synthetic landscape rotation, under
 * which raw client coordinates are 90° off.
 */
export function localStickDelta(
  event: PointerEvent,
  el: HTMLElement,
): { dx: number; dy: number } {
  const rect = el.getBoundingClientRect();
  const dx = (event.clientX - (rect.left + rect.width / 2)) / (rect.width / 2);
  const dy = (event.clientY - (rect.top + rect.height / 2)) / (rect.height / 2);
  // Surface rotated 90° clockwise: screen (x, y) → local (y, -x).
  if (activeRotation === 90) return { dx: dy, dy: -dx };
  return { dx, dy };
}

/**
 * Force landscape rendering inside `host`. Returns the surface element the
 * controller UI should render into and a cleanup function.
 */
export function installLandscapeLock(host: HTMLElement): {
  surface: HTMLElement;
  cleanup: () => void;
} {
  ensureStyles();
  host.classList.add("oc-landscape-host");
  const surface = document.createElement("div");
  surface.className = "oc-landscape-surface";
  host.appendChild(surface);

  const apply = () => {
    const w = host.clientWidth;
    const h = host.clientHeight;
    if (h > w) {
      activeRotation = 90;
      surface.classList.add("oc-rotated");
      // Swap the axes: the surface is laid out landscape (h × w), then
      // rotated into place. left = w puts the rotated box back over the host.
      surface.style.width = `${h}px`;
      surface.style.height = `${w}px`;
      surface.style.left = `${w}px`;
      surface.style.top = "0";
    } else {
      activeRotation = 0;
      surface.classList.remove("oc-rotated");
      surface.style.width = "";
      surface.style.height = "";
      surface.style.left = "";
      surface.style.top = "";
    }
  };
  apply();

  const orientation = (typeof screen !== "undefined"
    ? screen.orientation
    : undefined) as LockCapableOrientation | undefined;
  try {
    orientation?.lock?.("landscape").catch(() => {});
  } catch {
    /* not supported / not fullscreen — CSS rotation covers it */
  }

  const observer =
    typeof ResizeObserver !== "undefined" ? new ResizeObserver(apply) : null;
  observer?.observe(host);
  window.addEventListener("resize", apply);
  window.addEventListener("orientationchange", apply);

  return {
    surface,
    cleanup: () => {
      observer?.disconnect();
      window.removeEventListener("resize", apply);
      window.removeEventListener("orientationchange", apply);
      try {
        orientation?.unlock?.();
      } catch {
        /* ignore */
      }
      activeRotation = 0;
      surface.remove();
      host.classList.remove("oc-landscape-host");
    },
  };
}
