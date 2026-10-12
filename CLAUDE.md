# Tuner — IPTV player for your own subscription

Desktop app (Tauri 2 + React + libmpv) that signs in to any **Xtream Codes** IPTV subscription and makes live TV, movies and series fast to browse and reliable to play. It is a player, not a content provider.

"Tuner" is a working name. Keep the product name in one place (`tauri.conf.json` `productName` + `apps/desktop/src/app/brand.ts`) so renaming is a one-line change.

## Read these before writing code

| File | What it holds |
| --- | --- |
| `docs/SPEC.md` | What v1 does, screen by screen. The source of truth for behaviour. |
| `docs/ROADMAP.md` | Milestones M0–M6, tasks and acceptance checks. Work from this. |
| `docs/DESIGN.md` | Design tokens, components, motion, states. The source of truth for look. |
| `design/screens/*.dc.html` | The five approved screen mockups (see `design/README.md`). |
| `docs/XTREAM_API.md` | Endpoints, response shapes, stream URLs, provider quirks. |
| `docs/DECISIONS.md` | Stack decisions and why. Don't reopen them without asking. |

## Stack

- **Shell:** Tauri 2. Rust in `apps/desktop/src-tauri`.
- **UI:** React + TypeScript (strict), Vite, React Router, Zustand, TanStack Virtual, Motion, Tailwind CSS v4 over `tokens.css` (design tokens as theme variables; default palette disabled), Hugeicons (`@hugeicons/react` + `@hugeicons/core-free-icons`).
- **Core:** `packages/core`, plain TypeScript. Xtream client, models, sync, search. No React, no Tauri imports.
- **Storage:** SQLite through `tauri-plugin-sql`. Passwords in the OS keychain through the Rust `keyring` crate.
- **Network:** `tauri-plugin-http` (bypasses webview CORS; providers are often plain `http://`).
- **Player:** libmpv. M1 decides how it is embedded (see `docs/DECISIONS.md` D2).
- **Search:** MiniSearch index in a Web Worker, built after each sync.
- **Tests:** Vitest for `packages/core` (fixtures in `packages/core/test/fixtures`). Package manager: pnpm workspaces.

## Repo layout

```
apps/desktop/            Tauri app
  src/                   React UI: app/, screens/, components/, player/, styles/tokens.css
  src-tauri/             Rust: mpv bridge, keychain commands, image cache protocol
packages/core/           Xtream client, schemas, sync engine, storage + search interfaces
docs/  design/
```

## Commands

Run from the repo root. Keep this list current.

| Command | What it does |
| --- | --- |
| `pnpm install` | Install all workspace packages |
| `pnpm dev` | Run the desktop app (`tauri dev`: Vite on :1420 + Rust) |
| `pnpm dev:web` | Vite only, in a browser (no Tauri APIs, no mpv) |
| `pnpm test` | Vitest in every package that has tests (`packages/core`) |
| `pnpm lint` | ESLint, Prettier check, then `tsc --noEmit` in every package |
| `pnpm format` | Prettier write (Tailwind class sorting included). Markdown is not formatted |
| `pnpm tauri build` | Release build + Windows installers (NSIS `.exe`, MSI) in `apps/desktop/src-tauri/target/release/bundle/` |
| `pnpm tauri icon <file>` | Regenerate app icons from a 1024² SVG/PNG (`apps/desktop/app-icon.svg`) |
| `TUNER_M2_SUITE=1 pnpm dev` | Dev build that connects with the `.env.local` account through the real Connect code (unreachable server, connect, keychain, first sync, image cache) and prints `RESULT` lines. Run it on a fresh app-data folder to time a first sync |
| `TUNER_M3_SUITE="live=<id>,archive=<id>" pnpm dev` | Dev build that runs the M3 Live TV and player checks by itself through the real screens (scroll fps on the full list, layout vs the mockup, mpv alignment, click/zap timings, frame hold, shortcuts, favorites, hide/unhide, EPG cache, catch-up) and prints `RESULT` lines. It checks `active_cons` before opening any stream. `live` is a channel to zap from, `archive` a channel with `tv_archive`; optional `zaps=6,firsts=5`. Ids come from your own library (never commit them) |
| `TUNER_M4_SUITE="movie=<id>,series=<id>" pnpm dev` | Dev build that runs the M4 Movies/Series checks by itself (grid layout and sort, 60 fps on the real list and on 50,000 synthetic items, artwork, detail pages, the movie player and its shortcuts, track memory, resume points, watched at 90%, next-episode autoplay and cancel) and prints `RESULT` lines. Pick a movie with 2+ audio tracks and subtitles, and a series with 2+ episodes in season 1. It leaves the movie's resume point at 600 s: launch again with `,phase=restart` to check resume across a restart (that run cleans up everything the suite wrote). `,only=series` runs the series steps alone |
| `TUNER_M5_SUITE="live=<id>,movie=<id>,series=<id>,query=<word>" pnpm dev` | Dev build that runs the M5 Home, search and favorites checks by itself (cold start to Home, search index load and build, keystroke-to-results latency on the full library, accents and typos, keyboard choice, hidden categories, Favorites in Movies and Series, Home's layout vs the mockup, empty states, Resume from Home, search over the player) and prints `RESULT` lines. `live` is a channel with a guide, `series` one with episodes, `query` a word written with accents in some title, typed without them (default `telefoot`). It backs up favorites, history, resume points, hidden categories and account settings first and restores them exactly at the end (or on the next run after a crash). `,phase=cold` only times a cold start and the index load from disk |
| `node scripts/record-fixtures.mjs` | Re-record the Xtream fixtures in `packages/core/test/fixtures` from `.env.local` (credentials, host and content names are stripped) |
| `TUNER_M1_SUITE="live=<id>,hevc=<id>,ac3=<id>.<ext>,eac3=<id>.<ext>" pnpm dev` | Dev build that opens `/debug/player` and runs the M1 playback suite by itself; results print as `[player] RESULT …` lines. Ids come from your own account (never commit them) |

**libmpv binaries** (needed before `pnpm dev` or `pnpm tauri build`; `src-tauri/lib/` is gitignored and bundled as resources): put `libmpv-2.dll` (from `mpv-dev-lgpl-x86_64-<date>.7z`, [zhongfly/mpv-winbuild](https://github.com/zhongfly/mpv-winbuild/releases), non-`v3`) and `libmpv-wrapper.dll` (from `libmpv-wrapper-windows-x86_64.zip`, [nini22P/libmpv-wrapper](https://github.com/nini22P/libmpv-wrapper/releases)) in `apps/desktop/src-tauri/lib/`. Check each archive against its release's `sha256.txt`. M1 used build `20261011-git-d94d095814` and wrapper `v0.1.1`. The player debug screen opens with Ctrl+Shift+D in dev builds.

Scaffolded with `create-tauri-app` (react-ts). Add packages with `pnpm --filter @tuner/desktop add …` or `pnpm --filter @tuner/core add …`. TypeScript is pinned to `~6.0` because typescript-eslint does not support 7.x yet.

## Rules

1. **Work milestone by milestone** from `docs/ROADMAP.md`. Finish a milestone's acceptance checks, then stop and ask for review before starting the next.
2. **M1 is a gate.** Do not build screens until playback is proven on the target OS and the result is written into `docs/DECISIONS.md`.
3. **Credentials:** never commit them, never log them. Stream URLs contain the password: log only through `redact()` from `packages/core`. Dev credentials live in `.env.local` (gitignored).
4. **No bundled content.** No default servers, channels or playlists anywhere in code, fixtures or copy.
5. **One stream at a time.** Many subscriptions allow a single connection. The Live TV preview and the full-screen player are the same mpv instance; never open a second stream while one plays.
6. **UI never fetches.** Screens read from stores backed by `packages/core`. Only core talks to the provider.
7. **Core stays portable.** `packages/core` takes adapters (http, sql, secrets) by interface so a future React Native build can supply its own.
8. **Tolerant parsing.** Provider JSON is messy (see `docs/XTREAM_API.md`). Parse with zod schemas that coerce and default; one bad item must never break a whole list.
9. **Design fidelity.** Use tokens from `docs/DESIGN.md`; no hard-coded colors or font sizes in components. Match the mockups in `design/screens/`.
10. **Performance targets** in `docs/SPEC.md` (Quality bar) are requirements. Virtualise every list over ~100 items.
11. **Ask before** adding a dependency not named here or in `docs/DECISIONS.md`, or changing anything in `docs/DECISIONS.md`.
12. **Commits:** small, one concern each, conventional style (`feat(core): …`). Run tests and lint before committing.

## Open questions (ask the user, don't guess)

- ~~Primary OS for M1 and v1 first release~~ **Answered 2026-10-11: Windows.** macOS later.
- Final app name and icon.
- ~~Live TV preview behaviour~~ **Answered 2026-10-11: auto-play muted on selection.**
- ~~Does the provider support catch-up (`tv_archive`)?~~ **Yes, checked in M3 (2026-10-11):** 400 channels have it (2–3 days), the `/timeshift/` path form plays (start time on the server clock). Implemented in M3.
- Auto-update in v1 or manual installs? Default until answered: manual.
