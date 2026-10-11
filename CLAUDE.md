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
- **UI:** React + TypeScript (strict), Vite, React Router, Zustand, TanStack Virtual, Motion (framer-motion), CSS Modules over `tokens.css`.
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

Fill this in during M0 (`pnpm dev`, `pnpm test`, `pnpm lint`, `pnpm tauri build`) and keep it current.

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

- Primary OS for M1 and v1 first release: Windows or macOS? (Decides the M1 spike target.)
- Final app name and icon.
- Live TV preview: auto-play muted on selection, or only on click? Default until answered: auto-play muted.
- Does the provider support catch-up (`tv_archive`)? Check during M2 with real data.
- Auto-update in v1 or manual installs? Default until answered: manual.
