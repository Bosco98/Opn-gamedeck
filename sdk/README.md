# @opencontrol/sdk

Turn any phone into a programmable controller for your web app.

You think about **players, controller events, profiles, and capabilities**.
The SDK owns WebRTC, sockets, reconnection, player IDs, and room management —
you never see them.

## Install

```bash
npm install @opencontrol/sdk     # ESM + full TypeScript types
```

or, with no build step at all:

```html
<script src="opencontrol.js"></script>  <!-- exposes window.OpenControl -->
```

Both builds come out of `npm run build` (`dist/index.js` + `dist/opencontrol.js`).

## Host (the big screen)

```ts
import { OpenControl } from "@opencontrol/sdk";

const session = await OpenControl.host({ controller: "classic" });

// Point phones at your controller page
showQr(session.getJoinUrl(`${location.origin}/controller.html`));
console.log(session.code); // e.g. "GKPW"

session.on("join", (player) => {
  player.on("move", ({ x, y }) => {/* d-pad */});
  player.on("buttonDown", ({ button }) => {/* "a" | "b" | "x" | "y" */});
  player.on("start", () => togglePause());

  player.vibrate(200);               // host → controller feedback
  player.send("theme", { hue: 120 }); // custom host → controller message
});

session.on("disconnect", (player) => {/* slot held for 60s */});
session.on("reconnect", (player) => {/* they're back */});
session.on("leave", (player) => {/* slot released */});
```

### `host(options)`

| option | default | |
|---|---|---|
| `controller` | — | Profile id all controllers must use (`"classic"`) |
| `maxPlayers` | `8` | Join attempts beyond this are rejected |
| `reconnectWindowMs` | `60000` | How long a dropped player's slot is held |
| `adapter` | PeerJS | Any `NetworkAdapter` implementation |
| `roomCode` | auto | Force a code (dev/testing) |

## Controller (the phone)

```ts
const session = await OpenControl.join({
  room: new URLSearchParams(location.search).get("room"),
  controller: "classic",
  mount: document.getElementById("root"), // renders the built-in touch UI
});

session.on("message", ({ type, data }) => {/* custom host messages */});
session.on("close", ({ reason }) => {/* "left" | "session-ended" | "lost" */});
```

Omit `mount` to build your own UI and call `session.sendInput(event, data)`
directly. Reconnection is automatic (including across page reloads, via a
resume token in `sessionStorage`).

The built-in UIs are **landscape-only**: if the phone is held — or
rotation-locked — in portrait, the UI is rotated 90° so it always renders
landscape across the longer screen edge (plus a best-effort native
`screen.orientation.lock` where the browser allows it). Pass
`landscape: false` to opt out; custom UIs can reuse the same behavior via the
exported `installLandscapeLock(mount)`.

## Controller profiles

A profile is a **versioned event contract** + a built-in touch UI. Games depend
only on the contract; the UI can evolve without breaking anything.

**`classic` v1** — D-pad, A/B/X/Y, Start/Select:

| event | payload |
|---|---|
| `move` | `{ x: -1\|0\|1, y: -1\|0\|1 }` (y = −1 is up; fires on change) |
| `buttonDown` / `buttonUp` | `{ button: "a"\|"b"\|"x"\|"y" }` |
| `start` / `select` | `{}` |

**`arcade` v1** — analog joystick, A/B, left/right triggers:

| event | payload |
|---|---|
| `joystick` | `{ x: -1..1, y: -1..1 }` (analog; fires on change) |
| `buttonDown` / `buttonUp` | `{ button: "a"\|"b" }` |
| `trigger` | `{ side: "left"\|"right", value: 0\|1 }` |

Coming next: `touch`, `sensor`.

## Networking adapters

The SDK talks to a `NetworkAdapter` — never to a transport directly.

- **`PeerJSAdapter`** *(default)* — WebRTC data channels via the free public
  PeerJS broker. Zero servers. Accepts `peerOptions` for a self-hosted
  PeerServer or custom ICE config.
- **`MemoryAdapter`** — same-page in-memory transport for demos and testing.
- **Write your own** — implement `host()`/`join()` returning connections that
  move opaque strings. See `src/networking/adapter.ts`.

## Architecture

```
src/
├── session/       host + controller sessions, players, reconnection
├── profiles/      event contracts + built-in controller UIs
├── networking/    adapter interface, PeerJS + memory adapters
├── ui/            landscape lock (portrait phones render rotated)
├── events/        typed emitter
└── utils/         room codes, ids
```

Single package externally; modular internally. Philosophy: the developer
builds a game, not an infrastructure project.
