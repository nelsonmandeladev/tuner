# Design

The approved mockups are in `design/screens/` (see `design/README.md`). This file turns them into tokens and rules. When the two disagree, the mockup wins for look and this file wins for behaviour; tell the user about the mismatch.

**Direction:** the same family as UGIII. Dark ink grounds, content first, tight Montserrat headlines, Inter for the interface, monospace for numbers and times, generous radii, and **one** warm accent spent sparingly (primary action, the one thing in focus, progress). Calm and premium; nothing decorative.

## Tokens

Put these in `apps/desktop/src/styles/tokens.css` as CSS custom properties. Components use tokens only.

### Color (dark, the default theme)

| Token | Value | Use |
| --- | --- | --- |
| `--bg` | `#0A0B0C` | App background |
| `--bg-sidebar` | `#0D0F11` | Sidebar |
| `--surface` | `#121417` | Cards, inputs, segmented controls, account button |
| `--surface-selected` | `#171A1E` | Selected channel row, current episode |
| `--surface-active` | `#1A1D21` | Active nav item, active category |
| `--surface-raised` | `#22262B` | Active segment in a segmented control |
| `--line` | `#1C1F23` | Dividers, card borders |
| `--line-strong` | `#2A2E33` | Input borders, kbd outlines, ghost buttons |
| `--text` | `#F1F3F2` | Primary text |
| `--text-2` | `#C6CBC8` | Secondary text on dark and on video |
| `--text-muted` | `#9AA09D` | Inactive nav, metadata |
| `--text-dim` | `#7C827F` | Channel numbers, counts, hints |
| `--text-placeholder` | `#6E7471` | Input placeholders only |
| `--accent` | `#F2A93B` | Primary buttons, progress fill, eyebrow labels, links |
| `--accent-hover` | `#FFD08A` | Link hover |
| `--on-accent` | `#1A1204` | Text and icons on accent fills |
| `--live` | `#F0503C` | LIVE dot only |
| `--overlay` | `rgba(5,6,6,0.6)` | Chips on video |
| `--overlay-strong` | `rgba(5,6,6,0.82)` | Selected chip on video |
| `--ghost` | `rgba(241,243,242,0.10)` | Ghost buttons on video and heroes |
| `--track` | `#23272B` | Progress track on dark (`rgba(241,243,242,0.18)` on art/video) |
| `--art-panel` | `#101418` | Connect screen art panel (from `Connect.dc.html`, added in M2) |
| `--art-shape-1` / `--art-shape-2` | `#17222B` / `#1D2C37` | The panel's two large circles |
| `--text-soft` | `#B4BAB7` | Intro copy on the art panel |
| `--text-faint` | `#8A908D` | Small print: "includes no channels", the keychain note, "(optional)" |

Light theme: not designed yet. In M6, derive light tokens with the same roles, keep the accent, darken it for text if contrast fails, and ask the user to review.

### Type

Fonts: **Montserrat** 700/800 (display), **Inter** 400/500/600 (UI), **Geist Mono** 500 (numbers, times, channel numbers, counts, keyboard hints). Bundle with `@fontsource`.

| Token | Font | Size / line-height | Weight | Tracking | Use |
| --- | --- | --- | --- | --- | --- |
| `--type-display-xl` | Montserrat | 72 / 0.96 | 800 | -0.05em | Series/movie detail title |
| `--type-display-l` | Montserrat | 60–64 / 0.98 | 800 | -0.045em | Home hero, Connect headline |
| `--type-display-m` | Montserrat | 44 / 1.0 | 800 | -0.04em | Player programme title |
| `--type-title` | Inter | 26 / 1.2 | 600 | -0.02em | Preview title, form title |
| `--type-heading` | Inter | 20 / 1.3 | 600 | -0.01em | Row headings ("Favorite channels") |
| `--type-body-l` | Inter | 16–17 / 1.55 | 400 | 0 | Plots, intro copy |
| `--type-body` | Inter | 15 / 1.45 | 500 | 0 | Nav items, buttons, inputs |
| `--type-small` | Inter | 14 / 1.4 | 500–600 | 0 | Rows, labels, categories |
| `--type-caption` | Inter | 13 / 1.4 | 400–500 | 0 | Now playing, hints |
| `--type-eyebrow` | Inter | 12–13 | 600 | 0.08em, uppercase | "Continue watching", "Up next", "Categories" |
| `--type-mono` | Geist Mono | 12–13 | 500 | 0 | Times, numbers, counts, ⌘K |

Monospace is for anything that is a number the eye compares: channel numbers, times, durations, counts, years, ratings.

### Radius

`6` kbd hints · `8` chips on video, LIVE pill · `10` small buttons, active category, segments · `12` inputs, icon buttons, nav items, channel logos · `14` primary buttons, channel rows, account button · `16` posters, episode rows · `18` channel cards, preview player · `24` hero.

### Spacing and sizes

4-px base: 4, 8, 12, 16, 20, 24, 28, 32, 40, 48.
Sidebar 248 wide · nav item 44 high · primary button 48 (52 on Connect) · icon button 44 (48 next to a 48 button) · input 48 · channel logo 40 (44 in player) · content padding 32–40 · gaps between rows 40 · grid gaps 14.

## Components

| Component | Where | Notes |
| --- | --- | --- |
| `Sidebar` | All screens | Logo mark (three bars, last one accent and tallest), nav, ⌘K hint, Settings, account button (avatar letter on dark amber `#2A2418`) |
| `NavItem` | Sidebar | Icon 20 stroke 1.8 + label. Active: `--surface-active`, text `--text`, weight 600 |
| `Button` | Everywhere | `primary` (accent fill, `--on-accent`), `ghost` (`--ghost`), `icon` (square, `aria-label` required) |
| `SegmentedControl` | Connect, Series seasons | Track `--surface` + `--line` border, active segment `--surface-raised` |
| `TextField` | Connect, filters | 48 high, `--surface`, `--line-strong` border, focus ring 2px accent. Label above, 13/600 `--text-2` |
| `ChannelLogo` | Channel cards, rows, player | Provider logo through the image cache; fallback = monogram on a tint (see Artwork) |
| `ChannelCard` | Home | Logo + name + number, now playing (2 lines max), thin progress |
| `ChannelRow` | Live TV | Number (mono), logo, name + Catch-up badge, now playing, progress, time left (mono). Selected: `--surface-selected` + `--line-strong` hairline |
| `CategoryItem` | Live TV, Movies, Series | Name + count (mono, dim). Active: `--surface-active` |
| `PosterCard` | Movies, Home | 2:3, radius 16, title overlaid bottom-left when artwork is generated, genre + year below |
| `EpisodeRow` | Series | 16:9 thumbnail 168 wide with progress along its bottom, "n. Title", plot, duration (mono), state ("Watched", "11 min left" in accent) |
| `Hero` | Home, detail pages | Backdrop art, left-to-right scrim for legibility, eyebrow, display title, meta, progress, actions |
| `ProgressBar` | Rows, hero, player | 3–4 px, `--track`, fill `--text-muted` in lists, `--accent` for the focused item and the player |
| `Badge` | Rows, player | `LIVE` (red dot + text on `--overlay`), `Catch-up` (outline), stream info chip (mono) |
| `PlayerOverlay` | Player | Top: back, logo, name, number; LIVE + stream info. Right: channel switcher (prev/current/next). Bottom: eyebrow "Now", title, next, progress with times, controls |
| `Kbd` | Sidebar, player | Mono 12, 1px `--line-strong`, radius 6 |

Icons: Hugeicons free stroke-rounded set (D9), 20 px, stroke 1.8, through the `Icon` component. No emoji.

## Artwork

Provider artwork is often missing or broken. Never show a broken image or an empty grey box.

- **Posters and backdrops:** real `stream_icon` / `cover` / `backdrop_path` through the image cache. If missing or failing, show **generated art**: a dark tint and one or two large soft circles, positioned and coloured from a hash of the title, with the title set in Montserrat 800 at the bottom-left. This is exactly what the mockups show, so the fallback is already designed.
- **Channel logos:** real logo on a `--surface` tile with 6 px inner padding, `object-fit: contain`. Fallback: monogram (up to 3 letters from the name) in Montserrat 800 on a tint from the same hash palette.
- Hash palette (tint, shape): `#1F3B57/#2E5578`, `#4A2A2A/#6B3B3B`, `#2A3550/#3D4C72`, `#1E4234/#2C5E4A`, `#3A2C4E/#54406F`, `#33230F/#7A5420`, `#18282A/#2E5552`, `#1E2414/#3E5126`.

## Motion

Fluid, quick, never showy. Respect `prefers-reduced-motion` (fall back to opacity only, or none).

| What | Duration | Easing |
| --- | --- | --- |
| Hover / press states | 120 ms | ease-out |
| Panel, overlay, menu in | 200 ms | `cubic-bezier(.2,.8,.2,1)` |
| Out | 150 ms | ease-in |
| Player controls fade | 250 ms, after 3 s idle | ease-out |
| Screen change | 180 ms crossfade + 8 px rise | `cubic-bezier(.2,.8,.2,1)` |
| Poster hover | scale 1.02, 160 ms | ease-out |
| Channel zap | crossfade overlay text 150 ms; video itself switches hard | — |

## States

Every list and screen has these, in the same visual language:

- **Loading:** skeletons with the final shapes (rows, posters, cards) on `--surface`, a slow shimmer (disabled under reduced motion). No spinners except inside buttons.
- **Empty:** one line saying what will appear and one action (e.g. "No favorites yet. Press the heart on any channel.").
- **Error:** what went wrong and what to do, plus a retry button. No apologies, no codes unless in the stats panel.
- **Offline:** cached data stays usable; a small toast says the provider is unreachable.
- **Reconnecting (player):** small toast top-centre, "Reconnecting…", video area keeps the last frame.

## Accessibility and input

- Every interactive thing is a real `button` or `a`; icon-only buttons have `aria-label`.
- Visible focus ring (2 px accent, 2 px offset) on everything focusable; arrow-key navigation in lists and grids, Enter to open, Esc to go back.
- Text contrast 4.5:1 minimum; `--text-dim` only at 12–13 px for numbers and hints on `--bg`/`--surface`.
- The player is fully usable from the keyboard (SPEC shortcut table).
