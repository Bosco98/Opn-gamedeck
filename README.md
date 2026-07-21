# Opn-gamedeck

A console-like experience for client-side gaming: phones scan one QR, land in
a lobby, and stay connected while the deck launches games as cartridges. Built
on **OpenControl** — the SDK that turns any phone into a programmable
controller for your web app.

**🎮 Live deck:** https://bosco98.github.io/Opn-gamedeck/ — open it on a laptop,
tap to power on, then scan the QR with your phone.

## Repositories

The deck and its cartridges are separate repos — games are plug and play; the
only thing a game needs is the SDK and an entry in the deck's registry.

| Repo | What it is |
|---|---|
| **this repo** — [`sdk/`](sdk/) + [`console/`](console/) | The `@bosco98/opencontrol-sdk` TypeScript SDK (published to **GitHub Packages** on every `sdk/` change) and the Opn-gamedeck console shell + universal phone controller |
| [game-platformer](https://github.com/Bosco98/game-platformer) | *Skyline Scramble* — plain HTML/JS platformer (classic profile, vendored IIFE bundle) → [Pages](https://bosco98.github.io/game-platformer/) |
| [game-racing](https://github.com/Bosco98/game-racing) | *Tilt Grand Prix* — React racing game (tilt profile, SDK from GitHub Packages) → [Pages](https://bosco98.github.io/game-racing/) |

> The `game-platformer/` and `game-racing/` folders in a local checkout are
> nested clones of those repos, gitignored here.

## Quick start — run the deck locally

```bash
# 1. SDK (the console consumes it via file:../sdk — no registry needed locally)
cd sdk && npm install && npm run build

# 2. Console shell
cd ../console && npm install && npm run build

# 3. Serve it
cd .. && node server.mjs
```

Open the **Network** URL it prints (e.g. `http://192.168.0.103:8080`) on the
big screen, tap to power on, and scan the QR with your phones. Player 1 (the
crown) browses the game library with their phone and launches games; everyone's
phone switches controller layouts automatically. Player 1 holds **⌂** to eject
back to the library.

The registry ([`console/public/games.json`](console/public/games.json)) points
at the games' own GitHub Pages sites, so the deck needs internet — which the
PeerJS handshake needs anyway. Local checkouts of the games are also served at
`/platformer/` and `/racing/` if you want to switch an entry to a relative URL
while developing a game.

## How the console works

- The console owns the **one real session** (PeerJS/WebRTC). Phones join once;
  controller layouts swap at runtime over the SDK's message channel.
- Games run untouched in fullscreen iframes — cross-origin included. Inside
  the console (`?oc=console`), the SDK swaps its PeerJS adapter for a
  **postMessage bridge** to the parent, and the console relays each phone into
  the game as a synthetic controller speaking the normal wire protocol —
  games can't tell the difference.
- **Adding a game:** build any web game with `@bosco98/opencontrol-sdk`, host it
  anywhere over HTTPS, add `{ id, title, cover, url, profile }` to
  `games.json`. Done. Full walkthrough: [docs/BUILDING-A-GAME.md](docs/BUILDING-A-GAME.md)
  (Claude Code users can invoke the `/opencontrol-game` skill).

## What the SDK gives you

- **Sessions** — room codes, join/leave/reconnect, player slots. Never write lobby code.
- **Controller profiles** — versioned, strongly-typed event contracts (`classic`, `arcade`, `tilt`, `menu`) with built-in touch UIs.
- **Networking abstraction** — PeerJS adapter by default; the `NetworkAdapter` interface makes transports swappable (WebSocket, native WebRTC, …).
- **Console bridge** — `isConsoleEmbedded()` / `ConsoleBridgeAdapter` / `connectToBridgedGame()` let any SDK game run as a cartridge inside a console shell.
- **Bidirectional channel** — controllers send input; the host can vibrate phones and push messages back.

See [`sdk/README.md`](sdk/README.md) for API docs, and [`prompt.md`](prompt.md) for the full project vision.

> If the console screen itself loses its network session, reload the page —
> phones auto-reconnect within 60s.
