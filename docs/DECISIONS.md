# Decisions

Each entry is settled unless its status says otherwise. To change one, ask the user first, then update the entry with the date and the reason.

| # | Decision | Status |
| --- | --- | --- |
| D1 | Tauri 2 + React + TypeScript for the desktop app | Decided |
| D2 | libmpv for playback; embedding method chosen in M1 | **Open until M1** |
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

**Not an option:** HTML `<video>` + hls.js/mpegts.js as the main player. It fails on AC3/E-AC3/HEVC, which is the reason this project exists.

## D3 · Portable TypeScript core

`packages/core` holds the Xtream client, zod schemas, sync engine, storage and search interfaces. It imports nothing from React or Tauri. The desktop app passes in adapters:

```ts
interface HttpAdapter { getJson(url: string, opts?: { timeoutMs?: number; signal?: AbortSignal }): Promise<unknown> }
interface SqlAdapter  { execute(sql: string, params?: unknown[]): Promise<void>; select<T>(sql: string, params?: unknown[]): Promise<T[]>; transaction(fn: () => Promise<void>): Promise<void> }
interface SecretStore { get(key: string): Promise<string | null>; set(key: string, value: string): Promise<void>; delete(key: string): Promise<void> }
```

A React Native build later provides its own adapters and keeps the core unchanged.

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
