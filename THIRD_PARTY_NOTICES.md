# Third-party notices

Tuner is MIT-licensed (see [LICENSE](LICENSE)). It is built on the open-source software below, whose licences still apply to those parts. Thank you to everyone who works on them.

## Shipped beside `tuner.exe`

The installers ship these three DLLs as separate files. Tuner loads them at run time, so you can replace any of them with your own build of the same version.

| File | Project | Licence | Source |
| --- | --- | --- | --- |
| `lib/libmpv-2.dll` | [mpv](https://mpv.io) with [FFmpeg](https://ffmpeg.org) and their libraries, built by [zhongfly/mpv-winbuild](https://github.com/zhongfly/mpv-winbuild) (LGPL build) | LGPL-2.1-or-later | mpv commit [`d94d095814`](https://github.com/mpv-player/mpv/commit/d94d095814), build release [`2026-10-11-d94d095814`](https://github.com/zhongfly/mpv-winbuild/releases/tag/2026-10-11-d94d095814) (`mpv-dev-lgpl-x86_64-20261011-git-d94d095814.7z`). The build scripts list each library and its version |
| `lib/libmpv-wrapper.dll` | [libmpv-wrapper](https://github.com/nini22P/libmpv-wrapper) | LGPL-2.1 | [v0.1.1](https://github.com/nini22P/libmpv-wrapper/releases/tag/v0.1.1) |
| `vcruntime140.dll` | Microsoft Visual C++ runtime | Microsoft Visual Studio licence terms (redistributable code) | Not open source; redistributed as allowed by those terms |

The GNU Lesser General Public License 2.1 is at <https://www.gnu.org/licenses/old-licenses/lgpl-2.1.html>. mpv's licensing is described in its [Copyright file](https://github.com/mpv-player/mpv/blob/master/Copyright) and FFmpeg's on its [legal page](https://ffmpeg.org/legal.html). Tuner does not change any of these libraries.

## Compiled into the app

**Rust crates** (Tauri 2 and its plugins, `keyring`, and their dependencies): MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC, Zlib, Unicode-3.0, CDLA-Permissive-2.0, CC0-1.0, Unlicense or BSL-1.0 (most offer a choice between MIT and Apache-2.0), and MPL-2.0 for [`tauri-plugin-libmpv`](https://github.com/nini22P/tauri-plugin-libmpv). List them all with `cargo metadata` in `apps/desktop/src-tauri`, or with a tool such as `cargo about`.

**npm packages:**

| Package | Licence |
| --- | --- |
| React, React DOM, React Router, Zustand, TanStack Virtual, Motion | MIT |
| `@tauri-apps/api`, `@tauri-apps/plugin-http`, `@tauri-apps/plugin-opener`, `@tauri-apps/plugin-sql` | MIT or Apache-2.0 |
| `tauri-plugin-libmpv-api` | MPL-2.0 |
| [Hugeicons](https://hugeicons.com) free icons (`@hugeicons/react`, `@hugeicons/core-free-icons`) | MIT |
| [MiniSearch](https://github.com/lucaong/minisearch) (in `@tuner/core`) | MIT |
| [zod](https://zod.dev) (in `@tuner/core`) | MIT |

**Fonts** (through Fontsource): [Inter](https://rsms.me/inter/), [Geist Mono](https://vercel.com/font) and [Montserrat](https://github.com/JulietaUla/Montserrat), all under the SIL Open Font License 1.1.

The MPL-2.0 parts are used without changes. Their source is at the links above.
