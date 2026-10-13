<div align="center">

<img src="apps/desktop/app-icon.svg" width="96" height="96" alt="Tuner icon">

# Tuner

**A fast, clean IPTV player for your own Xtream Codes subscription.**

[![CI](https://github.com/nelsonmandeladev/tuner/actions/workflows/ci.yml/badge.svg)](https://github.com/nelsonmandeladev/tuner/actions/workflows/ci.yml)
[![Latest release](https://img.shields.io/github/v/release/nelsonmandeladev/tuner)](https://github.com/nelsonmandeladev/tuner/releases/latest)
[![MIT licence](https://img.shields.io/badge/licence-MIT-blue)](LICENSE)

[Download for Windows](https://github.com/nelsonmandeladev/tuner/releases/latest) · [Report a problem](https://github.com/nelsonmandeladev/tuner/issues/new/choose) · [Contribute](CONTRIBUTING.md)

</div>

Tuner signs in to the IPTV subscription you already pay for and makes live TV, movies and series quick to browse and reliable to play. It is free, open source and collects nothing.

> **Tuner is a player, not a provider.** It comes with no channels, playlists or servers and never suggests any. You need your own subscription from a provider that supports the Xtream Codes API (a server address, username and password).

## Features

- **Live TV**: categories with counts, a fast channel list (tens of thousands of channels), now and next from the guide, a muted preview, and zapping by arrow keys or channel number.
- **Catch-up**: replays past programmes on channels where your provider offers it.
- **Movies and series**: poster grids, detail pages, resume where you stopped, next-episode autoplay, and the audio and subtitle tracks you picked are remembered.
- **Search everything** with Ctrl+K: live, movies and series at once, forgiving of accents and typos.
- **Home**: Continue Watching, favourites and recently watched channels.
- **Several subscriptions**, switched in one click. Each keeps its own lists, history and favourites.
- **Plays almost anything** through [mpv](https://mpv.io): MPEG-TS, HLS, MKV and MP4, with H.264, HEVC, AAC, AC3 and E-AC3, using hardware decoding when your PC has it.
- **Keyboard first**: Space, F, M, arrows, A/S for audio and subtitle tracks.
- Dark and light themes.

## Install

1. Download `Tuner_<version>_x64-setup.exe` from the [latest release](https://github.com/nelsonmandeladev/tuner/releases/latest).
2. Run it. It installs for your user only and needs no administrator rights.
3. Windows may show **"Windows protected your PC"** because the installer is not code-signed yet. Choose **More info → Run anyway**. Each release lists the installer's SHA-256 so you can check the file (`Get-FileHash .\Tuner_*-setup.exe` in PowerShell).
4. Open Tuner and enter your provider's server address, username and password.

Requires Windows 10 or 11 (64-bit). macOS is planned.

**Uninstalling:** use Settings → Apps in Windows. Remove your subscriptions in Tuner's **Settings** first: that also deletes their saved passwords from Windows Credential Manager, which an uninstall does not touch.

## Privacy

Tuner talks only to your provider's server (and the artwork addresses it lists). There is no account, analytics or tracking. Your password is kept in Windows Credential Manager, and everything else stays on your PC. See [PRIVACY.md](PRIVACY.md).

## Build from source

You need Windows 10 or 11, [Node.js LTS](https://nodejs.org), [pnpm](https://pnpm.io) and the [Tauri 2 prerequisites](https://v2.tauri.app/start/prerequisites/) (Rust, Microsoft C++ Build Tools with the "Desktop development with C++" workload, WebView2).

```bash
pnpm install
pnpm fetch:libmpv     # libmpv, its wrapper and the VC++ runtime into apps/desktop/src-tauri/lib/
pnpm dev              # run the app
pnpm tauri build      # installers in apps/desktop/src-tauri/target/release/bundle/
```

`pnpm fetch:libmpv` downloads pinned releases of [libmpv](https://github.com/zhongfly/mpv-winbuild) (LGPL build) and [libmpv-wrapper](https://github.com/nini22P/libmpv-wrapper), checks their SHA-256, and copies Microsoft's `vcruntime140.dll` from your Visual Studio install.

`pnpm test` and `pnpm lint` check the code. [CLAUDE.md](CLAUDE.md) is the full developer guide, and [docs/RELEASE.md](docs/RELEASE.md) covers packaging (NSIS, MSI, MSIX).

## How it is built

[Tauri 2](https://v2.tauri.app) with a React and TypeScript interface, and video by libmpv rendered natively under the UI. The Xtream client, sync engine, storage and search live in [`packages/core`](packages/core), plain TypeScript with no UI code, so other front ends can reuse them. Lists are kept in SQLite, and search runs on [MiniSearch](https://github.com/lucaong/minisearch) in a Web Worker.

| | |
| --- | --- |
| [`apps/desktop`](apps/desktop) | The Tauri app: React UI in `src/`, Rust (mpv bridge, keychain, image cache) in `src-tauri/` |
| [`packages/core`](packages/core) | Xtream client, schemas, sync, storage and search |
| [`docs/`](docs) | [Spec](docs/SPEC.md), [roadmap](docs/ROADMAP.md), [design system](docs/DESIGN.md), [Xtream API notes](docs/XTREAM_API.md), [decisions](docs/DECISIONS.md), [release steps](docs/RELEASE.md) |
| [`design/`](design) | The approved screen mockups |

## Contributing

Bug reports, fixes and ideas are welcome: read [CONTRIBUTING.md](CONTRIBUTING.md) first. Report security problems privately, as [SECURITY.md](SECURITY.md) explains. Everyone taking part follows the [Code of Conduct](CODE_OF_CONDUCT.md).

## Licence

Tuner is released under the [MIT licence](LICENSE), © 2026 Sonfack Nelson Mandela. It ships mpv and FFmpeg under the LGPL; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for these and the other open-source parts.

Tuner is not affiliated with any IPTV provider. You are responsible for using it only with subscriptions you are entitled to.
