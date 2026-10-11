# IPTV Connector — v1 Feature Spec

Oct 11, 2026 · MEASDEV · Working name in code: Tuner

## Overview

v1 is a desktop app that signs in to any Xtream Codes IPTV subscription and makes live TV, movies and series fast to browse and reliable to play. It replaces IPTV Expert for daily use, built on Tauri + React + libmpv.

**Who it's for:** anyone who already pays for an IPTV subscription and wants a better player for it. The first user is us.

**What it is not:** a content provider. The app ships with no channels, playlists or sources. Every source is entered by the user.

**Product principles** (same direction as UGIII and ROLIII):

- **Instant.** Open the app and you are watching within 2 seconds. Cached data first, refresh in the background.
- **Plays everything.** If VLC can play a stream, we can. libmpv, never an HTML video tag.
- **Calm, premium UI.** Dark by default, content-first, few controls on screen, smooth motion.
- **Keyboard and remote friendly.** Every main action reachable without a mouse.
- **Built to travel.** UI and data logic shaped so the same codebase can ship on mobile later.

## Scope of v1

v1 covers Xtream Codes sources on desktop (macOS and Windows first, Linux if it comes free). Everything else waits until v1 is solid in daily use.

| In v1 | Later |
| --- | --- |
| Xtream Codes login (server, username, password) | M3U / M3U8 playlists + XMLTV EPG |
| Several Xtream accounts, switch between them | Stalker / MAC portal |
| Live TV with categories and short EPG | Full multi-day EPG grid |
| Movies (VOD) with posters, details, resume | Recording to disk |
| Series with seasons, episodes, resume | Multi-view (2 to 4 streams at once) |
| Global search across live, movies, series | Chromecast / AirPlay |
| Favorites and Continue Watching | Parental PIN and profiles per person |
| libmpv player with audio and subtitle tracks | Mobile and TV builds |
| Catch-up playback where the provider supports it | Cloud sync of favorites |
| Light settings: playback, cache, accounts | Themes beyond dark and light |

## Features

The app has five destinations in a left sidebar: Home, Live TV, Movies, Series, Search. Settings and the account switcher sit at the bottom of the sidebar.

### 1. Onboarding and accounts

- One screen: server URL, username, password, optional display name. A "Connect" button and nothing else.
- On connect, call `player_api.php` without an action to validate. Show the account status, expiry date and max connections the server returns.
- Clear error messages: wrong credentials, server unreachable, account expired, too many connections.
- First sync runs with a progress view (categories, then live, movies, series). The user can start watching live TV before movies and series finish.
- Several accounts supported. Each has its own cache. Switching is one click from the sidebar.

### 2. Home

- **Continue Watching** row: movies and episodes in progress, with a progress bar.
- **Favorite channels** row: tiles with logo and what's on now.
- **Recently watched channels** row.
- **Recently added** movies and series (by the `added` timestamp from the API).
- A large hero for the most recent item in Continue Watching, with a Resume button.

### 3. Live TV

- Three panes: categories, channel list, preview with now/next.
- Channel rows show logo, number, name, current programme and a thin progress bar.
- Selecting a channel starts a muted-by-default preview; Enter or double-click opens full screen. (Open question: preview on or off by default.)
- Hide categories the user doesn't want (for example, foreign languages). Hidden categories disappear everywhere.
- Fast zapping in the player: up and down change channel inside the current category, number keys jump to a channel number.
- Catch-up badge on channels where `tv_archive` is on; opens past programmes from the EPG.

### 4. EPG (v1 = now and next)

- Per channel: current and next programme from `get_short_epg`, loaded when the channel is visible.
- Channel detail shows the rest of today when available.
- Full grid guide is out of v1.

### 5. Movies

- Category rail plus a poster grid. Sort by recently added, name, rating.
- Detail page from `get_vod_info`: backdrop, poster, year, duration, genre, rating, plot, cast, Play / Resume, favorite.
- Resume from the last position. Mark as watched after 90%.

### 6. Series

- Same grid as movies.
- Detail page from `get_series_info`: season tabs, episode list with thumbnail, title, duration and watched state.
- Play next episode automatically, with a 10-second countdown and a cancel button.

### 7. Search

- One search field (Cmd/Ctrl + K from anywhere) across channels, movies and series.
- Results grouped by type, as you type, from the local cache. Target under 100 ms.
- Tolerates accents and small typos.

### 8. Favorites and history

- Heart any channel, movie or series. Favorites are a category in Live TV and a filter in Movies and Series.
- Watch history kept locally per account; can be cleared in Settings.

### 9. Settings

- **Accounts:** add, edit, remove, refresh now.
- **Playback:** preferred audio and subtitle language, hardware decoding on/off, buffer size, deinterlacing.
- **Content:** hidden categories, auto-play next episode.
- **Data:** refresh interval, clear cache, clear history.
- **Appearance:** dark (default) or light.

## Player

Playback is libmpv, rendered natively and controlled from React through Tauri commands. It must play MPEG-TS, HLS, MKV and MP4, with H.264, HEVC, AAC, AC3 and E-AC3, without the user changing anything.

**Behaviour**

- Live streams reconnect on their own after a drop (up to 3 tries), with a quiet "Reconnecting…" toast instead of an error screen.
- Hardware decoding on by default, automatic fallback to software if a stream fails.
- Remember audio and subtitle choice per channel and per series.
- Controls fade after 3 seconds of no movement; the cursor hides with them.
- Live overlay: channel logo, name, current programme with progress, next programme.
- VOD overlay: title, scrub bar with time, audio/subtitle menu, next episode for series.
- Optional stats panel (codec, resolution, bitrate, dropped frames) for diagnosing bad streams.

**Keyboard shortcuts**

| Key | Action |
| --- | --- |
| Space | Play / pause |
| F | Full screen |
| Esc | Leave full screen / close player |
| Up / Down | Previous / next channel (live) |
| 0–9 | Jump to channel number (live) |
| Left / Right | Seek 10 s (VOD, catch-up) |
| M | Mute |
| A / S | Cycle audio / subtitle track |
| G | Channel guide overlay (live) |
| I | Stream info |
| Cmd/Ctrl + K | Search |

## Data and sync

The app reads the Xtream API once, stores everything in a local SQLite database, and serves every screen from that cache. The network is only for refreshes, EPG, detail pages and the streams themselves.

**Xtream calls used in v1** (all on `player_api.php` with username and password; full detail in `XTREAM_API.md`)

| Action | Used for | When |
| --- | --- | --- |
| (none) | Validate login, account status, expiry, max connections | Connect, app start |
| `get_live_categories`, `get_live_streams` | Live TV | First sync, refresh |
| `get_vod_categories`, `get_vod_streams` | Movies grid | First sync, refresh |
| `get_series_categories`, `get_series` | Series grid | First sync, refresh |
| `get_vod_info` | Movie detail | Open detail, cached 7 days |
| `get_series_info` | Seasons and episodes | Open detail, cached 1 day |
| `get_short_epg` | Now and next | Channel visible, cached 15 min |
| `get_simple_data_table` | Catch-up programmes | Open catch-up |

Stream URLs are built locally: `/live/{user}/{pass}/{id}.{ext}`, `/movie/…`, `/series/…`, and `/timeshift/…` for catch-up.

**Refresh strategy**

- On launch, show cached data immediately, then refresh lists in the background if older than 12 hours (configurable).
- Refresh replaces lists in one transaction so the UI never sees half a list.
- Favorites, history and resume points are keyed by stream id and survive refreshes.
- Posters and logos go through a disk image cache with a size limit (default 500 MB).

## Architecture

One Tauri 2 app in three layers: a React UI, a TypeScript core that holds all the data logic, and a thin Rust layer for libmpv, SQLite and the keychain. Screens read the local cache; only API calls and streams reach the provider.

```
┌─────────────────────────── Desktop app (Tauri 2) ───────────────────────────┐
│  React UI ──────────────────────────────▶  TypeScript core (packages/core)   │
│  screens, sidebar, player overlay          Xtream client, models, sync,      │
│        │ play, seek, tracks                search — reused on mobile later   │
│        ▼                                        │ read/write        │ API    │
│  mpv bridge (Rust)              SQLite cache ◀──┘       Keychain + HTTP ◀────┘
│  libmpv, native video           lists, EPG, favorites,  passwords, calls     │
│        │                        history, resume points        │              │
└────────┼──────────────────────────────────────────────────────┼──────────────┘
         │ video stream                                           │ API calls
         └────────────────────▶  Your Xtream provider  ◀──────────┘
```

- **TypeScript core** (`packages/core`): Xtream client, data models, sync and search index. It reaches Rust through Tauri plugins (`tauri-plugin-http`, `tauri-plugin-sql`) behind small interfaces, so a React Native build can swap them.
- **React UI** (`apps/desktop`): screens and components. State in Zustand, long lists virtualised with TanStack Virtual.
- **mpv bridge** (Rust): embeds libmpv, exposes play, pause, seek, track and stats commands, and emits time, buffering and error events.
- **Going mobile:** Tauri 2 builds for iOS and Android, so the core and most of the UI carry over. The player layer is the part to rebuild, because libmpv on mobile needs its own integration.

## Quality bar

The UI must feel instant on a library of 20,000 channels and 50,000 movies, which is common for large subscriptions.

| Measure | Target |
| --- | --- |
| Cold start to Home with cache | under 2 s |
| Channel click to first frame (live) | under 1.5 s on a good stream |
| Channel zap in full screen | under 1 s |
| Search results as you type | under 100 ms |
| Scrolling long lists and grids | 60 fps (virtualised lists) |
| Idle memory, UI only | under 300 MB |
| Installer size | under 40 MB |

**Security and privacy**

- Passwords stored in the OS keychain (macOS Keychain, Windows Credential Manager), never in SQLite or config files.
- Stream URLs contain credentials, so they are never written to logs.
- No analytics or tracking in v1. Nothing leaves the machine except calls to the user's own provider.

**Legal**

- The app ships with no sources, channels or playlists, and never suggests any.
- Copy describes it as a player for the user's own subscription, like VLC or TiviMate.

## Milestones and open questions

Build order follows the risk: prove playback first, then data, then the screens. Each milestone ends with something usable. Tasks and acceptance checks are in `ROADMAP.md`.

1. **Playback spike.** Tauri shell with libmpv playing one hard-coded stream from our subscription, full screen, with reconnect. This is the riskiest part.
2. **Xtream core.** Typed client, login, first sync into SQLite, keychain storage.
3. **Live TV.** Categories, channel list, now/next, zapping. First version we use daily.
4. **Movies and Series.** Grids, detail pages, resume, next episode.
5. **Home, Search, Favorites.** The polish layer that makes it feel finished.
6. **Settings, accounts, packaging.** Signed installers for macOS and Windows.

**Open questions**

- [ ] App name and icon.
- [ ] Live preview in the Live TV screen: auto-play muted, or only on click?
- [ ] macOS and Windows both in v1, or one first? Which do we watch on most?
- [ ] Does our provider support catch-up (`tv_archive`)? If not, catch-up moves to later.
- [ ] Auto-update from day one (Tauri updater) or manual installs for v1?
