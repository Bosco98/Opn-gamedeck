import {
  OpenControl,
  getProfile,
  installLandscapeLock,
  type ControllerSession,
} from "@bosco98/opencontrol-sdk";
import {
  INPUT_HOME,
  MSG_CROWN,
  MSG_PROFILE,
  MSG_TOAST,
  type CrownPayload,
  type ProfilePayload,
  type ToastPayload,
} from "../oc-messages";
import "./controller.css";

/**
 * The universal controller — the one page a phone ever opens. It joins the
 * deck's session with the menu profile, then re-renders whatever profile the
 * console asks for (`oc:profile`), so players survive game switches without
 * ever re-scanning.
 */

const MENU_PROFILE = "menu";
const HOME_HOLD_MS = 1000;
const NAME_KEY = "opn:name";
const SCALE_KEY = "opn:ctrl-scale";
const SCALE_MIN = 0.7;
const SCALE_MAX = 1.5;

main();

function main(): void {
  applyStoredScale();
  const root = document.createElement("div");
  root.id = "root";
  document.body.appendChild(root);

  const join = renderJoinScreen(root);
  const roomFromUrl = new URLSearchParams(location.search).get("room");
  if (roomFromUrl) {
    join.codeInput.value = roomFromUrl.toUpperCase();
    void join.submit();
  }
}

/* ------------------------------------------------------------------ */
/* Join screen                                                         */
/* ------------------------------------------------------------------ */

function renderJoinScreen(root: HTMLElement) {
  const screen = document.createElement("div");
  screen.className = "screen";
  screen.innerHTML = `
    <div class="brand">Opn-gamedeck</div>
    <h1>Join the deck</h1>
    <p>Enter the room code on the big screen — you only do this once.</p>
    <input class="name" maxlength="14" placeholder="Your name" autocomplete="off" />
    <input class="code" maxlength="4" placeholder="ABCD" autocomplete="off" autocapitalize="characters" />
    <button>Join</button>
    <div class="error"></div>
  `;
  document.body.appendChild(screen);

  const nameInput = screen.querySelector<HTMLInputElement>(".name")!;
  const codeInput = screen.querySelector<HTMLInputElement>(".code")!;
  const button = screen.querySelector<HTMLButtonElement>("button")!;
  const error = screen.querySelector<HTMLElement>(".error")!;
  nameInput.value = localStorage.getItem(NAME_KEY) ?? "";

  const submit = async () => {
    const room = codeInput.value.trim();
    if (room.length < 4) {
      error.textContent = "Enter the 4-letter room code";
      return;
    }
    const name = nameInput.value.trim() || undefined;
    if (name) localStorage.setItem(NAME_KEY, name);

    button.disabled = true;
    button.textContent = "Connecting…";
    error.textContent = "";
    try {
      // No `mount`: this page owns rendering so it can swap profiles at runtime.
      const session = await OpenControl.join({ room, controller: MENU_PROFILE, name });
      screen.classList.add("hidden");
      startController(root, session, () => {
        screen.classList.remove("hidden");
        button.disabled = false;
        button.textContent = "Join";
      });
      keepAwake();
    } catch (err) {
      error.textContent = joinErrorText(err);
      console.error(err);
    }
    button.disabled = false;
    button.textContent = "Join";
  };

  button.addEventListener("click", () => void submit());
  codeInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") void submit();
  });

  return { codeInput, submit };
}

function joinErrorText(err: unknown): string {
  const name = err instanceof Error ? err.name : "";
  if (name === "RoomNotFoundError") return "No deck found for that code";
  if (name === "JoinRejectedError") return "The deck is full";
  return "Could not connect — try again";
}

/* ------------------------------------------------------------------ */
/* Connected controller                                                */
/* ------------------------------------------------------------------ */

function startController(
  root: HTMLElement,
  session: ControllerSession,
  onClosed: (reason: string) => void,
): void {
  // One landscape lock for the page's whole life; profiles render into
  // profileMount, the console's own chrome lives in a sibling overlay that
  // profile swaps can never clobber.
  const lock = installLandscapeLock(root);
  const profileMount = document.createElement("div");
  profileMount.className = "profile-mount";
  const overlay = document.createElement("div");
  overlay.className = "overlay";
  lock.surface.append(profileMount, overlay);

  const chrome = renderChrome(overlay, session);
  const banner = document.createElement("div");
  banner.className = "banner hidden";
  banner.textContent = "Reconnecting…";
  document.body.appendChild(banner);

  let crowned = false;
  let currentProfile: string | null = null;
  let cleanupProfile: (() => void) | null = null;

  const renderProfile = (id: string) => {
    if (id === currentProfile) return;
    cleanupProfile?.();
    cleanupProfile = null;
    currentProfile = id;
    try {
      cleanupProfile =
        getProfile(id).render?.(profileMount, {
          emit: (event, data) => session.sendInput(String(event), data),
          playerIndex: session.playerIndex,
          room: session.room,
        }) ?? null;
    } catch (err) {
      console.error(err);
      chrome.toast(`Unknown controller "${id}"`);
    }
    chrome.setHomeVisible(crowned && id !== MENU_PROFILE);
  };

  session.on("message", ({ type, data }) => {
    if (type === MSG_PROFILE) {
      renderProfile((data as ProfilePayload).profile);
    } else if (type === MSG_CROWN) {
      crowned = (data as CrownPayload).crown;
      chrome.setCrown(crowned);
      chrome.setHomeVisible(crowned && currentProfile !== MENU_PROFILE);
    } else if (type === MSG_TOAST) {
      chrome.toast((data as ToastPayload).text);
    }
  });

  session.on("disconnect", () => banner.classList.remove("hidden"));
  session.on("reconnect", () => banner.classList.add("hidden"));
  session.on("close", ({ reason }) => {
    banner.remove();
    cleanupProfile?.();
    lock.surface.textContent = "";
    lock.cleanup();
    onClosed(reason);
  });

  renderProfile(MENU_PROFILE);
}

/** The console's own controller chrome: crown badge, Home hold, toasts. */
function renderChrome(overlay: HTMLElement, session: ControllerSession) {
  const crownBadge = document.createElement("div");
  crownBadge.className = "crown-badge hidden";
  crownBadge.textContent = "👑";

  const homeBtn = document.createElement("button");
  homeBtn.className = "home-btn hidden";
  homeBtn.innerHTML = `<span class="ring"></span>⌂`;
  homeBtn.style.setProperty("--held", "0");

  const settingsBtn = document.createElement("button");
  settingsBtn.className = "settings-btn";
  settingsBtn.setAttribute("aria-label", "Controller size");
  settingsBtn.textContent = "⚙";
  overlay.append(crownBadge, settingsBtn, homeBtn);

  wireSettings(overlay, settingsBtn);
  wireHomeHold(homeBtn, () => session.sendInput(INPUT_HOME, {}));

  let toastTimer: ReturnType<typeof setTimeout> | null = null;
  return {
    setCrown(on: boolean) {
      crownBadge.classList.toggle("hidden", !on);
    },
    setHomeVisible(on: boolean) {
      homeBtn.classList.toggle("hidden", !on);
    },
    toast(text: string) {
      overlay.querySelector(".toast")?.remove();
      if (toastTimer) clearTimeout(toastTimer);
      const el = document.createElement("div");
      el.className = "toast";
      el.textContent = text;
      overlay.appendChild(el);
      toastTimer = setTimeout(() => el.remove(), 3500);
    },
  };
}

/** Hold-to-confirm so a mid-game thumb can't accidentally exit for everyone. */
function wireHomeHold(button: HTMLElement, onHome: () => void): void {
  let pointer: number | null = null;
  let raf = 0;
  let start = 0;

  const tick = () => {
    const held = Math.min((performance.now() - start) / HOME_HOLD_MS, 1);
    button.style.setProperty("--held", String(held));
    if (held >= 1) {
      release();
      if (navigator.vibrate) navigator.vibrate(30);
      onHome();
      return;
    }
    raf = requestAnimationFrame(tick);
  };

  const release = () => {
    pointer = null;
    cancelAnimationFrame(raf);
    button.style.setProperty("--held", "0");
  };

  button.addEventListener("pointerdown", (event) => {
    if (pointer !== null) return;
    pointer = event.pointerId;
    button.setPointerCapture(event.pointerId);
    start = performance.now();
    raf = requestAnimationFrame(tick);
  });
  for (const type of ["pointerup", "pointercancel"] as const) {
    button.addEventListener(type, (event) => {
      if (event.pointerId === pointer) release();
    });
  }
}

/* ------------------------------------------------------------------ */
/* Controller size                                                     */
/* ------------------------------------------------------------------ */

function clampScale(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(SCALE_MAX, Math.max(SCALE_MIN, value));
}

function storedScale(): number {
  return clampScale(parseFloat(localStorage.getItem(SCALE_KEY) ?? "1"));
}

/** Push the scale into a CSS var that the SDK profiles multiply their sizes by. */
function applyScale(scale: number): void {
  document.documentElement.style.setProperty("--oc-scale", String(scale));
}

function applyStoredScale(): void {
  applyScale(storedScale());
}

/** Gear button + slider panel to resize the on-screen controls. */
function wireSettings(overlay: HTMLElement, button: HTMLElement): void {
  const panel = document.createElement("div");
  panel.className = "settings-panel hidden";
  panel.innerHTML = `
    <label class="settings-label">Controller size <span class="settings-value"></span></label>
    <input class="settings-slider" type="range"
      min="${SCALE_MIN}" max="${SCALE_MAX}" step="0.05" />
  `;
  overlay.appendChild(panel);

  const slider = panel.querySelector<HTMLInputElement>(".settings-slider")!;
  const value = panel.querySelector<HTMLElement>(".settings-value")!;

  const sync = (scale: number) => {
    value.textContent = `${Math.round(scale * 100)}%`;
  };
  slider.value = String(storedScale());
  sync(storedScale());

  slider.addEventListener("input", () => {
    const scale = clampScale(parseFloat(slider.value));
    applyScale(scale);
    localStorage.setItem(SCALE_KEY, String(scale));
    sync(scale);
    if (navigator.vibrate) navigator.vibrate(4);
  });

  button.addEventListener("pointerdown", (event) => {
    event.stopPropagation(); // don't let the document dismiss handler see this tap
    panel.classList.toggle("hidden");
  });
  // Tapping anywhere else — including the controls in the sibling profile
  // mount — dismisses the panel so it never sits over the game.
  document.addEventListener("pointerdown", (event) => {
    if (panel.classList.contains("hidden")) return;
    if (panel.contains(event.target as Node)) return;
    panel.classList.add("hidden");
  });
}

/** Keep the phone screen on while playing (best effort). */
async function keepAwake(): Promise<void> {
  try {
    if (navigator.wakeLock) await navigator.wakeLock.request("screen");
  } catch {
    /* not critical */
  }
}
