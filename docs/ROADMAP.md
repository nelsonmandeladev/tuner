# Roadmap

Work top to bottom. Each milestone ends with its acceptance checks passing and a short report to the user (what works, what doesn't, measured numbers, open issues). **Stop after each milestone and wait for review.**

Test against the user's real subscription using `.env.local`:

```
XTREAM_SERVER=http://example.host:8080
XTREAM_USERNAME=...
XTREAM_PASSWORD=...
```

Never commit this file, never print its values.

---

## M0 · Repo and app shell

**Goal:** an empty app that already looks like the design.

- [ ] pnpm workspace: `apps/desktop` (Tauri 2 + Vite + React + TS strict), `packages/core` (TS library, Vitest).
- [ ] ESLint + Prettier, `pnpm lint`, `pnpm test`, `pnpm dev`, `pnpm tauri build`. Write the commands into `CLAUDE.md`.
- [ ] `.gitignore` covers `.env.local`, build output, `*.db`.
- [ ] `styles/tokens.css` from `docs/DESIGN.md`. Fonts bundled via `@fontsource`.
- [ ] App shell: sidebar (logo, Home, Live TV, Movies, Series, Search with ⌘K hint, Settings, account button) and empty routed screens. Match `design/screens/Main.dc.html`.
- [ ] Window: min size 1100×700, dark background set before first paint (no white flash).

**Accept when:** `pnpm dev` opens a window whose sidebar matches the mockup; lint and tests pass; a clean `pnpm tauri build` produces an installer.

## M1 · Playback spike (go / no-go gate)

**Goal:** prove libmpv playback inside the Tauri window on the primary OS. See `docs/DECISIONS.md` D2 for the options and their order.

- [ ] Ask the user which OS is primary if not already answered.
- [ ] Try the D2 options in order; keep notes on each attempt.
- [ ] A debug screen that takes a stream URL built from `.env.local` and plays it.
- [ ] React overlay above the video (play/pause button, a text label) proves UI can sit on top.
- [ ] Commands: load, play, pause, stop, seek, volume, mute, list/select audio and subtitle tracks.
- [ ] Events to React: time position, duration, paused, buffering, end of file, error.
- [ ] Reconnect on stream drop: up to 3 tries with backoff; shows a "Reconnecting…" state.
- [ ] Hardware decoding on (`hwdec=auto-safe`), software fallback on failure.
- [ ] Switch stream in the same mpv instance (no second instance, no second connection).

**Accept when, on the primary OS:**

- A live `.ts` stream and the same channel as `.m3u8` both play.
- A VOD file with AC3 or E-AC3 audio plays with sound. An HEVC stream plays if the subscription has one.
- First frame under 1.5 s on a good live stream; switching channel under 1 s. Report measured numbers.
- Window resize and full screen keep video and overlay aligned.
- Outcome written into `docs/DECISIONS.md` D2.

**If no option passes:** stop and report. Do not continue to M2.

## M2 · Xtream core and Connect

**Goal:** sign in, sync everything into SQLite, keep the password in the keychain.

- [ ] `packages/core/src/xtream`: client for every call in `docs/XTREAM_API.md`, zod schemas that coerce strings/numbers and default missing fields. Base64-decode EPG text.
- [ ] Fixtures: record real responses once, **strip credentials and server host**, trim to ~20 items, save under `packages/core/test/fixtures`. Tests cover each schema, including malformed items.
- [ ] `redact()` helper that hides username/password in any URL; used by every log call.
- [ ] Storage: migrations, tables for accounts, categories, live, vod, series, episodes, epg_cache, favorites, history, resume, settings. Indexes on category and name.
- [ ] Sync engine: categories → live → vod → series, each in one transaction, with progress events. Live usable as soon as its step is done. Stream-parse or chunk large lists.
- [ ] Keychain commands in Rust (D5) and the `SecretStore` adapter.
- [ ] Image cache protocol (D7).
- [ ] Connect screen exactly as `design/screens/Connect.dc.html`, with every error state from SPEC §1 and a sync progress view.
- [ ] Record whether the provider has `tv_archive` channels; tell the user (open question).

**Accept when:** connecting with real credentials syncs all lists; relaunching shows cached data in under 2 s with no network; the password is in the OS keychain and nowhere on disk (grep the app data folder); a wrong password and an unreachable server each show the right message; core tests pass.

## M3 · Live TV and player overlay

**Goal:** the version the user watches every day.

- [ ] Live TV screen as `design/screens/LiveTV.dc.html`: categories with counts, virtualised channel list, filter field, preview pane.
- [ ] Now/next via `get_short_epg` for visible rows only, cached 15 min.
- [ ] Preview plays muted in the shared mpv instance (rule 5 in CLAUDE.md). Enter / double-click → full screen.
- [ ] Player overlay as `design/screens/Player.dc.html`: channel, LIVE, stream info chip, now/next with progress, controls, channel switcher, auto-hide after 3 s with cursor.
- [ ] Zapping: up/down within category, number entry with a short on-screen buffer, under 1 s.
- [ ] All shortcuts from SPEC Player table that apply to live.
- [ ] Favorites (heart) and the Favorites category; hide/unhide categories.
- [ ] Catch-up if the provider supports it (else skip and note).
- [ ] Remember audio/subtitle choice per channel.

**Accept when:** 20,000-channel list scrolls at 60 fps (use a synthetic fixture if the real list is smaller); click to first frame under 1.5 s; zap under 1 s; overlay matches the mockup.

On the user's provider the stream itself takes ~2.5 s to deliver a first frame (DECISIONS D2, accepted 2026-10-11). Measure what the app adds on top of that, and make a zap *feel* instant: channel name and now/next update within 100 ms of the key press, and the last frame stays up until the new one is ready.

## M4 · Movies and Series

- [ ] Movies: category rail, virtualised poster grid, sort (recent, name, rating), detail page from `get_vod_info`.
- [ ] Series: same grid; detail page as `design/screens/Series.dc.html` with season tabs and episode rows.
- [ ] VOD overlay: title, scrub bar, ±10 s, audio/subtitle menu, next episode.
- [ ] Resume points saved every 10 s and on close; watched at 90%.
- [ ] Next-episode countdown (10 s, cancel button), respects the setting.
- [ ] Generated artwork fallback when a poster is missing (DESIGN.md "Artwork").

**Accept when:** a 50,000-item grid scrolls at 60 fps; resume works across app restarts; next episode plays automatically.

## M5 · Home, Search, Favorites

- [ ] Home as `design/screens/Main.dc.html`: hero for latest in-progress item, favorite channels with now playing, continue watching, recently watched channels, recently added.
- [ ] Search overlay on ⌘K / Ctrl+K from anywhere: MiniSearch worker (D8), grouped results, keyboard navigation, under 100 ms per keystroke on the full library.
- [ ] Favorites filters in Movies and Series; history per account.
- [ ] Empty states for a fresh account (no history, no favorites).

**Accept when:** search returns in under 100 ms with a typo and missing accents ("telefoot" finds "Téléfoot"); Home renders from cache in under 2 s.

## M6 · Settings, accounts, packaging

- [ ] Settings sections from SPEC §9. Light theme tokens (derive from DESIGN.md; ask the user to review).
- [ ] Multiple accounts: add, edit, remove (removes its database and keychain entry), switch from the sidebar.
- [ ] Background refresh on launch when lists are older than the setting (default 12 h).
- [ ] App icon and name (ask the user if still open).
- [ ] Installers for the target OS(es). Code signing: ask the user for certificates; document the steps in `docs/RELEASE.md`.
- [ ] Updater only if the user decided for it.

**Accept when:** a fresh install on a clean machine goes from Connect to watching in under a minute; removing an account leaves nothing behind; installer size reported. The SPEC target is under 40 MB, but libmpv builds can be large on their own: if libmpv alone breaks the target, report the numbers and the trimming options (a smaller libmpv build, compression) instead of forcing it.
