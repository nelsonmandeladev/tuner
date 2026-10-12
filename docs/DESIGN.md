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
| `--accent-ink` | `#F2A93B` (light: `#8F5300`) | Accent as text or a stroke icon: ticks, "See all", "11 min left", step icons (M6). The accent itself in dark |
| `--on-accent` | `#1A1204` | Text and icons on accent fills |
| `--live` | `#F0503C` | LIVE dot only |
| `--overlay` | `rgba(5,6,6,0.6)` | Chips on video |
| `--overlay-strong` | `rgba(5,6,6,0.82)` | Selected chip on video |
| `--ghost` | `rgba(241,243,242,0.10)` | Ghost buttons on video and heroes |
| `--track` | `#23272B` | Progress track on dark (`rgba(241,243,242,0.18)` on art/video) |
| `--art-panel` | `#101418` | Connect screen art panel (from `Connect.dc.html`, added in M2) |
| `--art-shape-1` / `--art-shape-2` | `#17222B` / `#1D2C37` | The panel's two large circles |
| `--text-soft` | `#B4BAB7` | Intro copy on the art panel |
| `--text-faint` | `#8A908D` | Small print: "includes no channels", the keychain note, "(optional)"; category heading, list progress fill, preview times (M3) |
| `--line-outline` | `#2E3338` | Selected channel row ring, Catch-up badge (from `LiveTV.dc.html`, added in M3) |
| `--overlay-preview` | `rgba(10,11,12,0.7)` | LIVE and "Preview · muted" chips on the preview |
| `--ghost-strong` | `rgba(241,243,242,0.12)` | Back button on video |
| `--line-on-media` | `rgba(241,243,242,0.3)` | Key hints on video |
| `--art-glow` / `--art-shade` | `rgba(241,243,242,0.08)` / `rgba(10,11,12,0.25)` | The two circles of generated art |
| `--scrim-player` | gradient, `Player.dc.html` | Top and bottom scrim of the player overlay |
| `--art-0…7-tint/shape` | the hash palette below | Generated art and monogram tiles |

Light theme (M6, Settings → Appearance; awaiting the user's review): see "Light theme" below.

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

**Fully rounded (user review, 2026-10-12):** every button (primary, ghost, icon, the heart, Back, player menus, small icon buttons, the account button), text inputs (Connect fields, the channel filter; 20 px sides), sidebar nav items and their active/hover background, category items, segmented controls and tabs, track and segments both. The mockups' square-ish buttons and nav items are superseded.

Other radii: `6` kbd hints · `8` chips on video, LIVE pill · `12` channel logos · `14` channel rows, search results · `16` posters, episode rows · `18` channel cards, preview player, panels · `24` hero.

### Spacing and sizes

4-px base: 4, 8, 12, 16, 20, 24, 28, 32, 40, 48.
Sidebar 248 wide · nav item 44 high · primary button 48 (52 on Connect) · icon button 44 (48 next to a 48 button) · input 48 · channel logo 40 (44 in player) · content padding 32–40 · gaps between rows 40 · grid gaps 14.

## Components

| Component | Where | Notes |
| --- | --- | --- |
| `TitleBar` | All screens but full screen | The window's own bar (the OS frame is off, M5 review): 40 high, no background or rule of its own: over the sidebar it takes `--bg-sidebar` and the sidebar's right border runs up through it (one line top to bottom, like Claude's window), over the content it is `--bg`; the left panel slides away with the sidebar. On sidebar screens it floats over the content: pages, rails and panes start under its 40 px with no top padding of their own, while movie and series pages run their artwork up under it (a `--scrim-titlebar` shade keeps the buttons readable) and the bar takes `--bg` once the page scrolls (M5 review). On the player and Connect it sits above the screen. Left: sidebar toggle, Back, Forward (round 28-px icon buttons; not on the player or Connect), then the logo mark and wordmark at small size. The rest drags the window; double-click maximizes. Right: minimize, maximize/restore, close as flush 46 × 40 caption buttons (Windows' shape, not pills), close turning `--window-close` red on hover |
| `Sidebar` | All screens | Nav, ⌘K hint, Settings, account button (avatar letter on dark amber `#2A2418`). No logo since the M5 review (it moved to the title bar). Can be hidden completely (title bar toggle or Ctrl/⌘ + B): it slides to zero width (200 ms in, 150 ms out) and the choice is remembered |
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
| `Switch` | Settings | On/off: a fully rounded 44 × 26 track. On: `--accent` with an `--on-accent` knob. Off: `--surface-raised`, `--line-strong` border, `--text-muted` knob. `role="switch"`, named by its row (M6) |
| `Select` | Settings | A fully rounded 40-px button (`--surface`, `--line-strong`) with the value and a chevron; the listbox opens under it on `--surface-raised` (radius 12, `--line-strong`), ticks the chosen option in `--accent-ink`. Arrows, Home/End, Enter/Space, Esc (M6) |
| `Button` `sm` | Settings rows | 40 high, 18 px sides, 14 px text; fully rounded like every button (M6) |

Icons: Hugeicons free stroke-rounded set (D9), 20 px, stroke 1.8, through the `Icon` component. No emoji.

## Artwork

Provider artwork is often missing or broken. Never show a broken image or an empty grey box.

- **Posters and backdrops:** real `stream_icon` / `cover` / `backdrop_path` through the image cache. If missing or failing, show **generated art**: a dark tint and one or two large soft circles, positioned and coloured from a hash of the title, with the title set in Montserrat 800 at the bottom-left. This is exactly what the mockups show, so the fallback is already designed.
- **Channel logos:** real logo on a `--surface` tile with 6 px inner padding, `object-fit: contain`. Fallback: monogram (up to 3 letters from the name) in Montserrat 800 on a tint from the same hash palette.
- Hash palette (tint, shape): `#1F3B57/#2E5578`, `#4A2A2A/#6B3B3B`, `#2A3550/#3D4C72`, `#1E4234/#2C5E4A`, `#3A2C4E/#54406F`, `#33230F/#7A5420`, `#18282A/#2E5552`, `#1E2414/#3E5126`.

### Live TV and player: what the mockups do not show (M3)

Built in the mockups' language; review these:

- **Hide a category:** an eye button appears over the count on hover or focus. Hidden categories collect under a "Hidden (n)" disclosure at the end of the list, with a button to show each again.
- **Catch-up:** channels with an archive get "Up next | Catch-up" tabs in the preview; Catch-up lists recordings by day. The player shows a "Catch-up" chip instead of LIVE, a seekable bar (position / programme length), ±10 s buttons and "Back to live" instead of Guide.
- **Guide (G):** a panel on the right with the zap list and what is on; replaces the switcher while open.
- **Stream info (I):** a mono panel top-left (codec, size, decoder, bitrates, dropped frames, buffer).
- **Number entry:** a "Channel 12_" chip top-right while digits are typed.
- **Errors:** a card over the last frame (player) or a bar on the preview, with "Try again"; a specific message when every connection of the subscription is in use.
- **Categories pane:** 264 px wide instead of the mockup's 232 (user review, 2026-10-11): provider category names are long.
- **Mismatches:** the mockup's filter field is 44 high (DESIGN says inputs are 48): built at 44. Scrollbars are thin and in `--line-strong` (the mockup shows none). Channel numbers on the test provider run to 7 digits, so the number column sizes to the longest number in the list instead of 32 px.

### Movies and Series: what the mockups do not show (M4)

- **Grid:** Main.dc.html's poster card in a virtualised grid (columns from the width, min 168 px, gaps 14). Movies have no genre in the list API, so the caption shows the rating where the mockup shows the genre; series show their genre. A thin accent bar on the poster's bottom edge shows resume progress. Sort is a SegmentedControl (Recently added · Name · Rating) beside the category title and count.
- **Movie detail:** Series.dc.html's hero (backdrop or generated hero art, scrims, Back) with year · genre · duration · rating · quality tags, plot, a resume bar, Play/Resume, "Start over" (ghost) and the heart; Director and Cast below. The poster sits on the right when there is no backdrop.
- **History:** leaving the player (Esc, Back) steps back to the page that opened it, so the player never sits in the history behind a detail page; reaching `/watch` by Back or Forward goes to the item's page instead (M5 review). A search result chosen in the player replaces the player in the history.
- **Below the movie hero (M5 review):** "Cast and crew": the director (labelled) then up to 20 cast members as 72-px fully rounded avatars with the name under them, in a row that scrolls sideways. Providers send names only (`get_vod_info` has no photos), so each avatar is the person's initials on a tint from the artwork palette. Then "More like this": a poster carousel (six to a page, arrows beside the heading) of movies sharing the most categories with this one, best rated first, one poster per title, hidden categories left out. Each section is left out when empty.
- **Person sheet (M5 review):** a cast or crew avatar opens a 440-px sheet from the right (`--surface`, `--line-strong` left border, over the `--overlay` scrim; 200 ms in, 150 ms out; Esc, the scrim or Close shut it). Header: the avatar, the name, the role and the count of other titles. Rows grouped Movies / Series (eyebrow, count): a 40 × 60 poster, the title, Director or Cast, the year (mono); a click opens the title. Empty: "No other titles with … in your library yet." A footnote says movies are listed once their page has been opened: the movie list has no cast, so movies come from fetched details, while every series carries its cast.
- **Movie/episode player:** Player.dc.html's layout without the channel parts: back, title and the stream info chip on top; eyebrow (year or "S2 · E5"), title, a seekable bar with elapsed and remaining time, ±10 s, mute, audio and subtitle menus, "Next episode", full screen.
- **Up next:** a card bottom-right (eyebrow "Next episode", code, title, "Playing in 7 s" with a bar, Play now / Cancel), at 10 s left.
- New tokens: `--ghost-soft`, `--scrim-hero`, `--scrim-hero-bottom`, `--text-poster`.

### Resizable panes (M5 review)

Live TV's categories and preview, and the category rail in Movies and Series, can be resized by dragging their edge (an 8-px grab area on the line; the line shows `--line-strong` on hover and `--accent` while dragging or focused). Arrow keys move a focused edge 16 px; a double-click restores the default. Defaults and minimums: categories 264 (200–440), preview 460 (320–760); the channel list and poster grid take the rest and never drop below 320 while dragging. Widths are remembered in app.db; on a narrow window panes shrink toward their minimum. The sidebar is not resizable.

### Home, search and favorites: what the mockups do not show (M5)

Main.dc.html shows the hero, Favorite channels and Recently added movies. The rest is built in its language; review these:

- **Hero:** 520 px high (the mockup says 380; made taller in the M5 review). The latest movie or episode in progress (one entry per series). Episode: "Season 2 · Episode 5 · Title", Resume and "All episodes". Movie: "2023 · Genre", Resume and "Details". The series' backdrop, or the movie's from its cached details, else generated hero art. Time left reads "30m left" (the app's existing format) where the mockup says "11 min left". Resume plays from the saved point; Back from that player returns to Home.
- **Rows, in order:** Favorite channels (a one-row carousel of all favorites, up to 100, five cards to a page; round previous/next buttons sit right of the title and only appear when the row overflows; "Open Live TV" opens Live TV on Favorites; the guide is fetched for the cards in view and the next page), Continue watching (the other items in progress, as posters with the resume bar and "S2 · E5" / "Movie" and time left; a click resumes), Recently watched channels (five, same cards), Recently added movies, Recently added series (six posters each, "See all" opens the grid on All, sorted by Recently added). A channel card plays full screen; zapping then walks the favorites. On the cards the programme takes its own height (two lines at most, the mockup reserves both) with the bar 10 px under it, kept to the bottom so cards in a row stay level (M5 review). The favorite cards' bar uses `--text-muted` as in the mockup (Live TV rows use `--text-faint`).
- **Empty sections are left out (user review, 2026-10-12):** no hero without something in progress, no Favorite channels without favorites, and so on for every row; a fresh account sees the recently added rows only. An empty library still shows one line for the whole page.
- **Loading:** a hero-sized block and five card shapes on `--surface`. On a cold start Home's reads run before the window is shown, so it normally appears with data.
- **Search overlay (⌘K / Ctrl K, sidebar "Search"):** a 720-px panel on `--surface` with a `--line-strong` border and radius 18, 112 px from the top over a `--overlay` scrim, above every screen including the player. A 64-px field row (search icon, 16 px text, Esc hint), then results as you type, grouped Channels / Movies / Series under eyebrow headings with the total count (mono), six per group; rows are 52 px with the channel logo or a 27 × 40 poster thumb, the title and the channel number or year (mono). The active row uses the selected channel row's look (`--surface-selected` and a `--line-outline` hairline). A footer lists ↑ ↓ Move · Enter Open · Esc Close. Before typing: one line ("Type a channel, a movie or a series. Accents and small typos are fine."); no match: "Nothing matches “…”."; index not ready: three skeleton rows; failure: one line and Try again. Choosing a channel plays it (in the player if open, else in Live TV's preview), a movie or series opens its page. A lone first letter matches whole words only (as a prefix it would match a third of the library); "fr" style language prefixes are not matched.
- **Favorites:** one heart component everywhere (Live TV preview: on a panel with a `--line-strong` border; detail pages: `--ghost` on artwork); off is an outline, on is a filled accent heart. Movies and Series get a "Favorites" category above "All", as Live TV has; empty: "No favorite movies yet. Press the heart on any movie."
- **Mismatches:** buttons had 20 px sides; both mockups say 22 px, now built at 22 (and fully rounded, see "Radius"). Sidebar and category items have 16 px sides instead of 12 so text clears the round ends. Home's main area shows the thin scrollbar (10 px) when it is taller than the window, so at 1440 × 900 the content is 1102 px wide instead of the mockup's 1112 (cards 209 instead of 211, posters 172 instead of 174).
- New token: `--scrim-home` (Main.dc.html's hero gradient, slightly lighter than `--scrim-hero`).

### Settings and accounts: what the mockups do not show (M6)

- **Settings page:** the page title, then one column (max 800 px) of five sections: Accounts, Playback, Content, Data, Appearance. Each is an eyebrow heading (`--text-faint`, 12 px) over a `--surface` panel (radius 18, `--line` border) of rows split by `--line`. A row: label (14/600) and one line of explanation (`--text-muted`, 13 px, max 520 px) on the left, the control on the right (Switch, Select, SegmentedControl or a `sm` ghost Button), 18 px vertical padding, 24 px sides.
- **Accounts:** a row per subscription, the one in use first with an "In use" outline pill: 40-px avatar letter on `--avatar`, name, host (mono, `--text-dim`), then status · expiry · connections · "lists updated 3 h ago". Actions: Refresh now (in use) or Switch to this, Edit, Remove. Remove asks inline in a `--line-strong` box ("Remove …? Its lists, favorites, history and saved password are deleted from this computer. Your subscription itself is not affected." Cancel / Remove). "Add a subscription" (dashed circle with a plus) opens Connect with Cancel. Edit is the 440-px right sheet: Name, Server URL, Username, Password ("Leave empty to keep the saved one"), a note that a new login is checked with the provider, Save / Cancel.
- **Content:** "Play the next episode automatically" (per subscription), then the hidden categories of every kind in one list (kind eyebrow, name, count in mono, Show), on `--bg` pills; empty: "Nothing is hidden."
- **Data:** Refresh lists (Every 6 / 12 / 24 hours, Only when I ask) with "Last updated 3 h ago"; Cache with its size ("436 MB of artwork, 152 saved pages and guide entries") and Clear cache; Watch history with an inline confirmation. A one-line note answers each action ("Cache cleared.").
- **Account switcher:** the sidebar account button opens a menu above it (`--surface-raised`, radius 18, `--line-strong`; 200 ms in, 150 ms out): each subscription (avatar, name, a tick on the one in use), a rule, "Add a subscription", "Manage subscriptions". Arrow keys move, Esc closes. Choosing another subscription goes to its Home.
- **Pane widths stay app-wide** (they are about the window); the Live TV category, last channel, catalog category and sort, hidden categories, favorites, history, resume points and the search index are per subscription.

### Light theme (M6, for review)

Same roles on light grounds; the amber fill and the dark text on it stay. Text contrast on `--bg` (#F3F4F3): text 16.7, text-2 11.4, muted 5.9, dim 5.3 (4.7 on `--surface-active`), faint 5.0, accent ink 5.6. The suite measures every text element of Settings, Home, a movie, a series and Live TV: none under 4.5:1.

| Token | Light value |
| --- | --- |
| `--bg` / `--bg-sidebar` | `#F3F4F3` / `#EBEDEC` |
| `--surface` / `-selected` / `-active` / `-raised` | `#FFFFFF` / `#ECEEED` / `#E4E8E6` / `#E7EAE8` |
| `--line` / `--line-strong` / `--line-outline` | `#E1E4E2` / `#C9CFCC` / `#BFC6C2` |
| `--text` / `-2` / `-muted` / `-dim` / `-placeholder` | `#121514` / `#2F3532` / `#59605D` / `#606764` / `#737A77` |
| `--text-soft` / `--text-faint` | `#3C4441` / `#646B68` |
| `--accent-ink` / `--accent-hover` | `#8F5300` / `#6E4000` |
| `--track` / `--avatar` | `#DADFDC` / `#F7E6C4` |
| `--ghost` / `-strong` / `-soft` | ink at 6 % / 10 % / 5 % |
| `--art-panel` / `--art-shape-1` / `-2` | `#E8EDF0` / `#DAE3E9` / `#C9D7E0` |

**Stays dark in light** (wrapped in `data-theme="dark"`, which brings the dark tokens back): the player, every hero (Home, movie, series), the Live TV preview's video and its chips, toasts, the number entry, channel logo tiles (provider logos are drawn for dark grounds), generated art, cast initials, episode thumbnails, and the title bar's buttons while they float over a detail page's artwork. Scrims and overlays keep their dark values. A theme scope sets its own text colour. To review: the hard edge where a dark hero meets the light page, and dark logo tiles on white cards.

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
