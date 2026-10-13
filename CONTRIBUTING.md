# Contributing to Tuner

Thanks for helping. Bug reports, fixes and ideas are all welcome. Please read this first; it is short.

## Ground rules

- **Tuner is a player, not a source.** It plays the user's own Xtream Codes subscription. Contributions that add, suggest, list or link to channels, playlists, servers or ways to find them will be closed. That includes fixtures, screenshots and issue text.
- **Never share credentials.** No server addresses, usernames, passwords, stream URLs or channel lists in issues, commits, logs or screenshots. Stream URLs contain the password: log them only through `redact()` from `packages/core`.
- **Be kind.** See the [Code of Conduct](CODE_OF_CONDUCT.md).

## Set up

You need Windows 10 or 11, [Node.js LTS](https://nodejs.org), [pnpm](https://pnpm.io) and the [Tauri 2 prerequisites](https://v2.tauri.app/start/prerequisites/) (Rust, Microsoft C++ Build Tools, WebView2).

1. `pnpm install`
2. Put the three libmpv DLLs in `apps/desktop/src-tauri/lib/`. [README → Build from source](README.md#build-from-source) lists them.
3. Optional, for the dev suites and fixture recording: copy `.env.example` to `.env.local` and fill in your own subscription. That file is gitignored; keep it that way.
4. `pnpm dev` runs the app. `pnpm dev:web` runs the UI alone in a browser (no player).

## Before you open a pull request

- `pnpm test` and `pnpm lint` pass. `pnpm format` fixes formatting.
- For Rust changes, `cargo test` in `apps/desktop/src-tauri` passes.
- Add a line under **Unreleased** in [CHANGELOG.md](CHANGELOG.md) for anything a user would notice.
- One concern per pull request, with [conventional commit](https://www.conventionalcommits.org) messages (`fix(core): …`, `feat(desktop): …`).
- For UI changes, follow `docs/DESIGN.md`: design tokens only (no hard-coded colours or font sizes), and attach a screenshot without personal content.
- For bigger changes or new dependencies, open an issue first. `docs/DECISIONS.md` explains the stack choices.

## Where things are

| Path | What |
| --- | --- |
| `apps/desktop/src` | React UI |
| `apps/desktop/src-tauri` | Rust: mpv bridge, keychain, image cache |
| `packages/core` | Xtream client, sync, storage and search (plain TypeScript, no React or Tauri) |
| `docs/` | Spec, roadmap, design system, API notes, decisions, release steps |

`CLAUDE.md` is the full developer guide, including every command.
