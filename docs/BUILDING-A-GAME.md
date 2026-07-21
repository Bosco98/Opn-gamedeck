# Building a game for Opn-gamedeck

How to build a phone-controlled web game with `@bosco98/opencontrol-sdk` and
ship it as a cartridge the deck can launch. API reference lives in
[`sdk/README.md`](../sdk/README.md); this is the workflow.

A finished game is **one static web app** with two pages:

- **Host page** (`index.html`) — the big screen. Runs the game, calls
  `OpenControl.host()`, shows a QR/room code for standalone play.
- **Controller page** (`controller.html`) — what a phone opens in standalone
  play. A thin "enter code → `OpenControl.join()`" wrapper; the SDK renders
  the whole controller UI from the profile. *(Inside the console this page is
  never used — the deck's universal controller takes over — but ship it so the
  game also works standalone.)*

## 1. Choose how to consume the SDK

**No build step (plain HTML/JS)** — copy `opencontrol.js` (the IIFE bundle
from the SDK's `dist/`) into your repo and:

```html
<script src="opencontrol.js"></script>  <!-- window.OpenControl -->
```

**npm (ESM + TypeScript)** — the package lives on GitHub Packages, which
needs auth even though it's public:

```bash
# .npmrc in the project:
#   @bosco98:registry=https://npm.pkg.github.com
# ~/.npmrc on your machine (PAT with read:packages):
#   //npm.pkg.github.com/:_authToken=YOUR_TOKEN
npm install @bosco98/opencontrol-sdk
```

In CI use a `read:packages` PAT stored as a repo secret (see
`game-racing/.github/workflows/pages.yml` for the working pattern).

If you build with a bundler, set a **relative base** (Vite: `base: "./"`) so
the same build works at `/`, under `/<repo>/` on Pages, and inside the deck.

## 2. Pick a controller profile

The profile is the event contract between phones and your game. Built-ins:

| id | phone shows | your game receives |
|---|---|---|
| `classic` | d-pad + A/B/X/Y + start/select | `move {x,y}`, `buttonDown/Up {button}`, `start`, `select` |
| `arcade` | joystick + buttons | see `sdk/src/profiles/arcade.ts` |
| `tilt` | gyro steering + triggers + A/B | `tilt {value}`, `trigger {side,value}`, `buttonDown/Up` |
| `menu` | nav pad + A/B (used by the deck itself) | `navigate {dir}`, `confirm`, `back` |

Need something else? `registerProfile()` a custom profile (id + version +
optional `render`) **on both the host and controller pages** before
hosting/joining — see `sdk/src/profiles/menu.ts` for the canonical shape.

## 3. Write the host page

```ts
const session = await OpenControl.host({ controller: "classic" });

// Standalone join flow (skipped instantly inside the console):
showQr(session.getJoinUrl(new URL("controller.html", location.href).toString()));
showRoomCode(session.code);

session.on("join", (player) => {
  spawn(player);                       // start playing on the FIRST join
  player.on("buttonDown", ({ button }) => { /* … */ });
  player.vibrate(200);                 // feedback → phone
});
session.on("disconnect", (p) => ghost(p));    // slot held 60s
session.on("reconnect", (p) => unghost(p));
session.on("leave", (p) => remove(p));
```

Rules that make a game feel right on the deck **and** standalone:

- **Fill the viewport.** `position: fixed; inset: 0`, no page scroll. The
  deck shows you in a fullscreen iframe; boxed layouts look broken.
- **No lobby gate.** Start gameplay on the first `join`; hide any join
  overlay once `playerCount > 0`. The deck injects already-connected players
  immediately after load — a "press start to begin" screen would strand them.
- **Handle mid-game joins** (late players appear while running) and
  **ghost/unghost** on disconnect/reconnect.
- **Never block on player count.** 1..8 players, appearing in any order.

## 4. Write the controller page

Copy the pattern from `game-platformer/controller.html` (or
`game-racing/src/ControllerApp.tsx`): read `?room=` from the URL, call
`OpenControl.join({ room, controller: "<your profile>", mount })`, wire
`disconnect`/`reconnect`/`close` to a banner. The SDK renders the pad.

## 5. The console-cartridge contract

You get console support **for free**: when the deck iframes your game with
`?oc=console`, the SDK's `host()` swaps PeerJS for a postMessage bridge to
the parent automatically. The deck then feeds your session synthetic
controllers indistinguishable from real phones. Requirements:

- Build against an SDK version that has the console bridge (≥ 0.1.0).
- Call `OpenControl.host()` **without** passing a custom `adapter`.
- Host over **HTTPS** (an HTTPS deck cannot embed HTTP games).
- Don't use message types starting with `oc:` in `player.send()` — that
  prefix is reserved for deck↔phone control traffic and gets dropped.
- Declare the profile your game hosts with in the deck's registry entry —
  the two must match or players get rejected with `profile-mismatch`.

## 6. Deploy to GitHub Pages

- **Static game** (platformer-style): push to a public repo, enable Pages
  from branch `main` / root. Done.
- **Built game** (racing-style): copy
  `game-racing/.github/workflows/pages.yml` — it builds with npm + the
  `PACKAGES_READ_TOKEN` secret and deploys `dist/` via Actions. Enable Pages
  with build type "GitHub Actions".

## 7. Register the cartridge

Add an entry to the deck's [`console/public/games.json`](../console/public/games.json):

```json
{
  "id": "my-game",
  "title": "My Game",
  "tagline": "One line of flavor",
  "cover": "covers/my-game.svg",
  "url": "https://<user>.github.io/<repo>/",
  "profile": "classic",
  "maxPlayers": 8
}
```

`url` may also be relative (e.g. `my-game/`) for cartridges served by the
deck's own origin during development. Add a cover SVG under
`console/public/covers/`, rebuild the console, push — the deck now lists it.

## 8. Test checklist

1. Standalone: host page on a laptop (LAN URL, not localhost), phone scans QR,
   plays, survives a phone reload (reconnect), second phone joins mid-game.
2. Deck, locally: entry in `games.json`, `node server.mjs`, power on, launch
   from the library — phones' pads switch automatically, Home (P1) ejects.
3. Deck, deployed: same flow on the deployed console URL.
