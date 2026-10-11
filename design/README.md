# Screen mockups

Five approved screens, 1440×900 desktop. They are the visual reference for the build; tokens and rules extracted from them are in `docs/DESIGN.md`.

| File | Screen | Milestone |
| --- | --- | --- |
| `screens/Connect.dc.html` | Connect your subscription | M2 |
| `screens/LiveTV.dc.html` | Live TV: categories, channel list, preview | M3 |
| `screens/Player.dc.html` | Full-screen player, live overlay | M3 |
| `screens/Series.dc.html` | Series detail with season tabs and episodes | M4 |
| `screens/Main.dc.html` | Home | M5 |

## How to read the files

They come from a design canvas and use a small template format. The markup is plain HTML with inline styles; read styles and structure directly from it.

- `{{name}}` is filled from `renderVals()` in the `<script type="text/x-dc">` block at the bottom of each file. That block also holds the sample data (channels, programmes, episodes).
- `<sc-for list="{{items}}" as="item">…</sc-for>` repeats its content for each item; `<sc-if value="{{x}}">` shows its content when `x` is true.
- `<helmet>` holds page-level styles and the font link (in the app, fonts are bundled instead).
- `<script src="./support.js">` and `<x-dc>` belong to the canvas runtime. Ignore them.

## What is placeholder

- **"Tuner"** and the three-bar mark are a working name and logo.
- **Coloured tiles with circles** stand in for posters, backdrops and video. They are also the designed fallback for missing artwork (see DESIGN.md "Artwork").
- **Channel names, programmes, titles and counts** are sample data. Never ship them.

The user can export PNGs of each screen from the canvas and add them here as `screens/*.png` for side-by-side comparison.
