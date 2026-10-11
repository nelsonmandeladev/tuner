# Decisions

Each entry is settled unless its status says otherwise. To change one, ask the user first, then update the entry with the date and the reason.

| # | Decision | Status |
| --- | --- | --- |
| D1 | Tauri 2 + React + TypeScript for the desktop app | Decided |
| D2 | libmpv for playback; embedded with `tauri-plugin-libmpv` (option 1) | Decided 2026-10-11 |
| D3 | Data logic in a portable TypeScript core (`packages/core`) | Decided |
| D4 | SQLite via `tauri-plugin-sql` as the local cache | Decided |
| D5 | Passwords in the OS keychain via the Rust `keyring` crate | Decided |
| D6 | Provider calls via `tauri-plugin-http` | Decided |
| D7 | Images served through a Rust disk cache on a custom protocol | Decided |
| D8 | Search with MiniSearch in a Web Worker | Decided |
| D9 | State: Zustand. Lists: TanStack Virtual. Motion: Motion (framer-motion). Styling: Tailwind CSS v4 + tokens. Icons: Hugeicons | Decided (revised 2026-10-11) |
| D10 | Fonts bundled locally (`@fontsource/*`), never loaded from Google at runtime | Decided |

## D1 · Tauri 2 + React

Small installers and low memory compared with Electron, a Rust side for native work (mpv, keychain, image cache), and iOS/Android targets for later. React because the team works in React and React Native daily.

## D2 · libmpv, embedding chosen in M1 (open)

**Why libmpv:** IPTV streams are often MPEG-TS with HEVC, AC3 or E-AC3, which browser engines can't play. libmpv plays anything VLC plays, with hardware decoding and good HLS handling.

**The risk:** embedding libmpv inside a Tauri window is not a solved problem. What exists as of Oct 2026:

- [`tauri-plugin-libmpv`](https://github.com/nini22P/tauri-plugin-libmpv) (npm `tauri-plugin-libmpv-api`, v0.3.x, single maintainer). mpv draws into the Tauri window and a **transparent webview sits on top**, so React overlays work. README status: Windows fully tested; macOS untested; Linux experimental with window embedding not working. Needs `"transparent": true` on the window and transparent `html, body`.
- Community approaches discussed in [tauri-apps discussion #6343](https://github.com/orgs/tauri-apps/discussions/6343): passing the window handle to mpv's `wid` option; a separate child window kept aligned to an HTML element; mpv over JSON IPC in its own window. Rust bindings for libmpv (`libmpv2`) are thinly maintained.

**M1 tries, in this order, on the primary OS, and stops at the first that passes the M1 checks:**

1. `tauri-plugin-libmpv` as documented (transparent window, video under the webview).
2. Own Rust bridge: create a native child view (NSView on macOS, HWND on Windows) inside the Tauri window via `raw-window-handle`, give its handle to mpv through `wid`, keep the webview above it for overlays. Use `libmpv2` crate or raw FFI to `libmpv`.
3. Own Rust bridge using the libmpv **render API** (OpenGL) into a native surface we control.
4. Last resort, needs user approval: mpv as a separate borderless window driven over JSON IPC, positioned under a transparent Tauri overlay window.

Write the outcome here (which option, which OS, measured first-frame and zap times, known issues) before M2 starts. If macOS fails options 1–3, tell the user: shipping Windows first is a reasonable call, but it is theirs to make.

### M1 outcome · 2026-10-11 · Windows 11 · option 1

**User decision (2026-10-11):** option 1 accepted. The live first-frame and zap targets are recorded as missed because of the provider (see below), and M2 goes ahead. M3 makes zapping *feel* instant instead: channel name and programme switch at once, and the last frame stays on screen until the new stream's first frame. Sound on AC3 5.1 (movie 1285272) confirmed by ear.

**Chosen: option 1, `tauri-plugin-libmpv` 0.3.2** (+ `tauri-plugin-libmpv-api`), libmpv `mpv-dev-lgpl-x86_64-20261011-git-d94d095814` (zhongfly build, non-v3) and `libmpv-wrapper` 0.1.1, both in `src-tauri/lib/` and bundled as resources. Options 2–4 were not tried: option 1 passed every embedding check, and the checks it misses are timing. That time is spent in the provider's stream and in FFmpeg, which options 2 and 3 would use unchanged.

**How it works.** mpv gets the main window's HWND as `wid` and draws under the WebView2 layer. The window is `transparent`, `html`/`body` are transparent, and screens paint their own background. `VideoSurface` marks the hole in the DOM and keeps mpv's `video-margin-ratio-*` matched to it, so the Live TV preview and the full-screen player are the same instance and the same stream (rule 5). Stream URLs are built in Rust and passed to mpv directly, so the password never enters the webview.

**Measured** on the user's subscription (`max_connections` 1, formats `ts`/`m3u8`, server timezone Europe/Paris). Times run from the load command to mpv's `playback-restart`, read from mpv events.

| Check | Result |
| --- | --- |
| Live `.ts`, stream 2626 (H.264 1080p, AAC 2.0, d3d11va), first frame | median 2562 ms, worst 2880 ms (n=5). Later runs: 2680 / 3138, 2688 / 2948, 2935 / 3161. Before tuning: median 2910, worst 3871. **Target 1.5 s: missed** |
| Zap 2626 → 2631, same instance | median 2585 ms, worst 2905 ms (n=6); final run median 2587, worst 7520. **Target 1 s: missed**. Channels nobody is watching start on demand at the provider: a first byte once took 16 s for 2630, and 0.97 s three seconds later |
| Live `.m3u8`, stream 2626 | Plays. Opening takes 13–27 s inside FFmpeg's HLS demuxer (n=4) |
| HEVC: live 2632 (HEVC 1920×1080 + AAC, d3d11va) | Plays; first frame 2367 ms |
| AC3: movie 1285272 (HEVC 3840×1604, AC3 5.1, d3d11va) | Plays, first frame 5993 ms. Audio fr/en switch, 5 subtitle tracks select and clear, seek, pause, volume, mute and end of file all pass. Sound confirmed by the user |
| E-AC3: movie 1292323 (HEVC 3840×1600, E-AC3 5.1, d3d11va) | Plays. Same track, control and end-of-file checks all pass |
| Alignment: preview, fill window, OS full screen, resize to 1100×700 / 1600×960 / 1440×900, 125 % DPI | Video box from mpv's `osd-width/height` and margins vs. the DOM rectangle: **0 px** off in every state |
| Same instance across layout changes | Live 2626 and the test pattern: no extra load through preview → fill → full screen → preview → three resizes |
| One connection at a time | Socket monitor during the full suite: never two established provider sockets, none left after stop |
| Reconnect | A real provider drop (`eof-reached` on live) recovered on its own. A simulated drop is back in 3.6 s. A dead stream gives up after 3 tries at 1 s / 2 s / 4 s and shows "The stream is not responding." |

**Why live start is slow (and not fixable in the player).**
- **Network, ~1.0–1.5 s to first byte.** Every stream URL answers with a `302` to a separate streaming host, so there are two connects before the first byte.
- **Stream start, ~1.15 s.** The streaming host sends one cached keyframe (SPS + IDR at the first byte), then nothing until the live feed catches up. The H.264 decoder holds that keyframe in its B-frame reorder buffer until the next frames arrive.
- Forcing `low_delay` output would break frame order on B-frame streams, so it was rejected.
- What the player could remove, it did: FFmpeg's stream-info probe cost ~1.5 s on live TS (`demuxer-lavf-probe-info=nostreams`). Smaller `analyzeduration`/`probesize`, `fflags=+nobuffer`, `vd-lavc-threads=1` and `hwdec=no` made no measurable difference and were dropped.
- Any player on this provider pays the network and stream-start costs. Ways to hide them are M3 work: show the channel logo and now-playing instantly, and keep the last frame during a zap.

**Settings that matter** (`apps/desktop/src/player/mpv.ts`):
- `demuxer-lavf-probe-info=nostreams`: −1.5 s on live TS.
- `http-header-fields=Connection: close`: FFmpeg keeps the first keep-alive socket of the `302` hop open, even after `stop`. The provider counts that socket against `max_connections`, so with 1 connection every zap would trip the limit. With `close`, a socket monitor showed at most one provider socket at any time.
- `network-timeout=10`, `keep-open=yes`.
- Tuning values are passed as strings: integer options reject JSON numbers.

**Rejected / not tried.**
- Options 2–4: not needed (see above).
- `.m3u8` as a primary format: slow to open, and every HLS open leaves a session the provider keeps counting for minutes (`active_cons` rose to 4 on a 1-connection account). Use `.ts` and fall back to HLS only when `allowed_output_formats` lacks `ts`.

**Known issues.**
- Timing targets missed for the provider-side reasons above.
- With `Connection: close`, each VOD seek reconnects through the `302` hop (~1 s).
- Installer size: NSIS **32.58 MiB** (2.4 MB in M0), MSI 43.19 MiB. `libmpv-2.dll` alone is 96.5 MB on disk. The NSIS installer is under the 40 MB target with little room left; trimming options (a smaller libmpv build) are M6 work.
- The player is not reachable in release builds yet (the debug screen is dev-only), so release playback is first exercised in M3.
- Any frame that paints nothing shows the desktop through the transparent window: every screen must paint its background, `Suspense` fallbacks included.
- Live resize was checked between sizes, not frame by frame during a drag; a one-frame lag of the margins during fast drags is possible.
- The plugin `trace!`-logs `loadfile` arguments (stream URLs). It is silent because no `log` backend is installed. If one is added later (e.g. `tauri-plugin-log`), filter out `tauri_plugin_libmpv` below `info`.
- The plugin is single-maintainer, and its JS package pins `@tauri-apps/api` (overridden in `pnpm-workspace.yaml`).

**Not an option:** HTML `<video>` + hls.js/mpegts.js as the main player. It fails on AC3/E-AC3/HEVC, which is the reason this project exists.

## D3 · Portable TypeScript core

`packages/core` holds the Xtream client, zod schemas, sync engine, storage and search interfaces. It imports nothing from React or Tauri. The desktop app passes in adapters:

```ts
interface HttpAdapter { getJson(url: string, opts?: { timeoutMs?: number; signal?: AbortSignal }): Promise<unknown> }
interface SqlAdapter  { execute(sql: string, params?: SqlValue[]): Promise<void>; select<T>(sql: string, params?: SqlValue[]): Promise<T[]>; transaction(fn: (tx: SqlTransaction) => Promise<void>): Promise<void> }
interface SqlTransaction { execute(sql: string, params?: SqlValue[]): void }  // queues writes; no reads inside
interface SecretStore { get(key: string): Promise<string | null>; set(key: string, value: string): Promise<void>; delete(key: string): Promise<void> }
```

A React Native build later provides its own adapters and keeps the core unchanged.

**Refined 2026-10-11 (M2, user approved the approach):** `transaction` hands its callback a write-only `tx` whose `execute` queues statements, so an adapter can send them as one batch. tauri-plugin-sql runs each JS call on any connection of its pool, so BEGIN/COMMIT sent as separate calls is not safe; the desktop adapter sends the batch to a Rust command (`db_batch`) that runs it in one sqlx transaction on the plugin's own pool. `sqlx` 0.8 was added as a direct dependency for this (user approved; the same crate the plugin already compiles). Placeholders are `?`.

## D4 · SQLite via tauri-plugin-sql

Official plugin, sqlx underneath. One database file per account (`account-<id>.db`) so removing an account removes its cache cleanly, plus `app.db` for accounts list and settings. Migrations live in `packages/core/src/storage/migrations` and run on startup.

## D5 · Keychain via `keyring`

There is no official Tauri keychain plugin. Expose three Rust commands (`secret_get`, `secret_set`, `secret_delete`) backed by the `keyring` crate (macOS Keychain, Windows Credential Manager). Service name: the app identifier. Key: `xtream:<accountId>`.

## D6 · HTTP via tauri-plugin-http

The webview can't call arbitrary `http://` providers (CORS, mixed content). `tauri-plugin-http` runs requests from Rust. Its URL scope must allow any `http://*` and `https://*` host, since providers are user-entered. Set a normal desktop User-Agent; some providers block unknown ones.

## D7 · Image cache on a custom protocol

Provider artwork is usually on plain `http://`. On Windows the webview origin is `https://tauri.localhost`, so loading those images directly is blocked as mixed content. Register a custom protocol (for example `img://`) in Rust that fetches, caches to disk (LRU, 500 MB default) and serves images. Components use `img://` URLs built by a helper. The same cache gives offline posters.

## D8 · Search

MiniSearch, built in a Web Worker after each sync from the SQLite rows (name, type, category, year). Accent folding and fuzzy matching (edit distance 1 for words ≥ 4 letters). Serialise the index to disk so a cold start doesn't rebuild it. SQLite FTS5 was considered; it handles prefixes but not typos.

## D9 · UI libraries

Zustand for app state, TanStack Virtual for every long list and grid, React Router for screens, Motion for transitions. No component library: the design is custom and small.

**Revised 2026-10-11 (user decision, before M0):** styling is **Tailwind CSS v4** (`@tailwindcss/vite`) instead of CSS Modules, and icons are **Hugeicons** (`@hugeicons/react` + `@hugeicons/core-free-icons`, stroke-rounded) instead of Lucide. `styles/tokens.css` keeps the DESIGN.md tokens as CSS custom properties on `:root` and maps them into Tailwind's `@theme`. Tailwind's default colours, font sizes and radii are reset to `initial`, so only design tokens exist as utilities (`bg-surface`, `text-heading`, `rounded-card`) and rule 9 (no hard-coded colours or sizes) is enforced by the build.

## D10 · Local fonts

Montserrat (700, 800), Inter (400, 500, 600) and Geist Mono (500) via `@fontsource` packages. The app must look right offline.
