---
name: opencontrol-game
description: Build and ship a new phone-controlled game (cartridge) for the Opn-gamedeck console using @bosco98/opencontrol-sdk. Use when the user asks to create a new game, add a game/cartridge to the deck/console, or wire an existing web game up to OpenControl phone controllers.
---

# Build an Opn-gamedeck cartridge

You are adding a game to the Opn-gamedeck ecosystem. The full background is
in `docs/BUILDING-A-GAME.md` — read it first. This skill is the operational
sequence and the project-specific rules.

## Ground rules (locked with the user)

- **No tests.** The user tests on real phones themselves.
- **Fullscreen always**: the game must fill the viewport (`position: fixed;
  inset: 0`), never boxed in a page layout.
- Code follows **SRP / DRY / KISS** — small single-purpose modules, no
  speculative abstraction.
- Each game is its **own public GitHub repo** (owner `Bosco98`) with its own
  GitHub Pages deployment; the deck references it by URL in
  `console/public/games.json`. Game folders may live inside `game-t1/` as
  nested checkouts — the parent repo gitignores them.
- Games must run **standalone AND as a cartridge** with zero code branches:
  never pass a custom `adapter`, never gate gameplay behind a lobby (start on
  first `join`), handle mid-game joins and ghost/unghost.
- `player.send()` types starting with `oc:` are reserved — never use them.

## Sequence

1. **Clarify with the user** (only what's genuinely open): game concept, and
   which profile — `classic` (d-pad+ABXY), `arcade`, `tilt` (gyro), or a new
   custom profile. Stack: plain HTML+IIFE (like `game-platformer/`) for
   simple games, Vite+TS (like `game-racing/`) when a build step earns its
   keep. Mirror the existing game of the same stack for all config.

2. **Scaffold** in a new folder `game-<id>/` at the repo root:
   - Plain stack: `index.html` + `controller.html` + `game.js` +
     `server.mjs` (copy from `game-platformer/`, it's dependency-free) and a
     vendored copy of `sdk/dist/opencontrol.js` (build the SDK first if its
     source changed). Script src is relative: `src="opencontrol.js"`.
   - Vite stack: mirror `game-racing/` (`package.json`, `tsconfig.json`,
     `vite.config.ts` with `base: "./"` and multi-page inputs, `.npmrc` with
     `@bosco98:registry=https://npm.pkg.github.com`). Dependency:
     `"@bosco98/opencontrol-sdk": "^<current version>"`. For local builds
     link it (`cd sdk && npm link`, then `npm link @bosco98/opencontrol-sdk`
     in the game) — fresh registry installs need the user's `read:packages`
     PAT in `~/.npmrc`.

3. **Implement** host + controller pages per `docs/BUILDING-A-GAME.md`
   sections 3–5. Copy the join-screen/reconnect-banner patterns from the
   existing games rather than inventing new ones.

4. **Verify locally**: build (Vite stack: `npm run build` runs `tsc` too),
   then serve and curl the pages. Do NOT playtest gameplay — the user does
   that on phones.

5. **Ship it as its own repo** (`git init` inside the folder — the parent
   gitignores it; if the folder is new, add it to the parent `.gitignore`):
   - Plain stack: push to `Bosco98/game-<id>`, enable branch-based Pages
     (`gh api repos/Bosco98/game-<id>/pages -X POST -f 'source[branch]=main'
     -f 'source[path]=/'`).
   - Vite stack: copy `game-racing/.github/workflows/pages.yml` (it uses the
     `PACKAGES_READ_TOKEN` secret — ask the user to add that secret to the
     new repo: `gh secret set PACKAGES_READ_TOKEN -R Bosco98/game-<id>`),
     push, enable workflow Pages (`-f build_type=workflow`).

6. **Register the cartridge**: add the entry (Pages URL, matching `profile`)
   to `console/public/games.json`, draw a simple SVG cover into
   `console/public/covers/<id>.svg` (320×200 viewBox, match the existing
   covers' flat neon-on-dark style), rebuild the console
   (`cd console && npm run build`), commit + push the Opn-gamedeck repo.

7. **Verify deployments**: `gh run list` on both repos until green, then
   curl the game's Pages URL and the console's `games.json`.

## Custom profiles

If no built-in profile fits: add `sdk/src/profiles/<id>.ts` following
`menu.ts` (typed event map, `ensureStyles` with unique style id + class
prefix, `installTouchGuards`, AbortController cleanup), register + export it
in `sdk/src/index.ts`, bump the SDK version in `sdk/package.json` (CI
publishes to GitHub Packages on push), rebuild, and update consumers. The
deck's universal controller renders any registered profile automatically —
no console changes needed.
