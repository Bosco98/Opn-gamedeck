# OpenControl

Turn any phone into a programmable controller for your web app.

This repo is a plain multi-app layout (no workspace tooling):

| Folder | What it is | How it consumes the SDK |
|---|---|---|
| [`sdk/`](sdk/) | The `@opencontrol/sdk` TypeScript SDK | — |
| [`game-platformer/`](game-platformer/) | Fullscreen multiplayer platformer in plain HTML/JS | `<script src="/opencontrol.js">` (IIFE build) |
| [`game-racing/`](game-racing/) | React racing game (joystick steering, gas/brake, nitro) | `npm link @opencontrol/sdk` (ESM build) |

## Quick start

```bash
# 1. Build the SDK
cd sdk
npm install
npm run build

# 2a. Run the platformer (plain HTML, script-tag SDK)
cd ../game-platformer
node server.mjs

# 2b. Run the racing game (React, npm-linked SDK)
cd ../sdk && npm link
cd ../game-racing
npm install
npm link @opencontrol/sdk
npm run dev
```

Open the **Network** URL that the server prints (e.g. `http://192.168.1.23:8080`)
on your desktop — the game shows a room code + QR. Scan it with a phone on the
same network and the phone becomes the controller. More phones = more players.

> `npm install` in `game-racing/` removes the link — rerun
> `npm link @opencontrol/sdk` (or `npm run link:sdk`) after installing.

> Don't open `localhost` if you want phones to join — they can't reach it.
> Networking is peer-to-peer WebRTC (PeerJS public broker), so an internet
> connection is needed for the initial handshake.

## What the SDK gives you

- **Sessions** — room codes, join/leave/reconnect, player slots. Never write lobby code.
- **Controller profiles** — versioned, strongly-typed event contracts (`classic` ships today) with built-in touch UIs.
- **Networking abstraction** — PeerJS adapter by default; the `NetworkAdapter` interface makes transports swappable (WebSocket, native WebRTC, …).
- **Bidirectional channel** — controllers send input; the host can vibrate phones and push messages back.

See [`sdk/README.md`](sdk/README.md) for API docs, and [`prompt.md`](prompt.md) for the full project vision.
