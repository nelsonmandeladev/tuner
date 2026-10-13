# Changelog

All notable changes to Tuner are written here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Add each change under **Unreleased** as you make it. To release, rename that heading to the version and date (`## [0.2.0] - 2026-11-02`), start a new empty **Unreleased** above it, and tag. The release workflow uses the version's section as the release notes.

## [Unreleased]

## [0.1.0] - Unreleased

First public release, for Windows 10 and 11 (64-bit).

### Added

- Sign in to an Xtream Codes subscription with clear errors (wrong login, server unreachable, account expired, too many connections) and a first sync with progress; Live TV is usable before movies and series finish.
- Several subscriptions, each with its own lists, favourites and history, switched from the sidebar. Passwords are kept in Windows Credential Manager.
- **Live TV:** categories with counts, a virtualised channel list, now and next from the guide, a muted preview in the same player, zapping with arrow keys or channel numbers, and catch-up on channels that offer it.
- **Movies and series:** poster grids with sorting, detail pages, resume points, watched at 90 %, next-episode autoplay with cancel, and remembered audio and subtitle tracks.
- **Home:** Continue Watching, favourite and recently watched channels, recently added movies and series.
- **Search** across live, movies and series with Ctrl+K, forgiving of accents and typos.
- **Player** built on libmpv: MPEG-TS, HLS, MKV and MP4 with H.264, HEVC, AAC, AC3 and E-AC3, hardware decoding with software fallback, reconnect on stream drops, keyboard shortcuts.
- **Settings:** subscriptions (add, edit, refresh, remove), playback (languages, hardware decoding, buffer, deinterlacing), hidden categories, refresh interval, clear cache and history, dark and light themes, and About.
- Windows installer (NSIS, per user, no administrator rights) that includes the Visual C++ runtime the player needs.

[Unreleased]: https://github.com/nelsonmandeladev/tuner/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/nelsonmandeladev/tuner/releases/tag/v0.1.0
