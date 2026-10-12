# Xtream Codes API reference

The Xtream Codes "player API" is not formally documented, and every provider's panel behaves a little differently. Treat this as the common shape and **confirm each response against the user's real provider in M2** (record fixtures, then trust the fixtures over this page).

All calls are `GET {server}/player_api.php?username={u}&password={p}[&action=…]`. `{server}` is what the user typed (scheme + host + port, no trailing slash). URL-encode username and password.

## Calls

### Account info (no action)

```
GET /player_api.php?username=U&password=P
```

```jsonc
{
  "user_info": {
    "username": "U", "password": "P", "message": "",
    "auth": 1,                       // 0 = bad credentials
    "status": "Active",              // Active | Expired | Banned | Disabled
    "exp_date": "1803945600",        // unix seconds as string, or null = no expiry
    "is_trial": "0",
    "active_cons": "0",
    "max_connections": "1",
    "created_at": "1760000000",
    "allowed_output_formats": ["m3u8", "ts", "rtmp"]
  },
  "server_info": {
    "url": "host", "port": "8080", "https_port": "8443", "server_protocol": "http",
    "timezone": "Europe/Paris", "timestamp_now": 1791720000, "time_now": "2026-10-11 14:40:00"
  }
}
```

Map to errors: `auth == 0` → wrong credentials; `status != "Active"` → account expired / disabled (show the status); network error or non-JSON body → server unreachable; `active_cons >= max_connections` when starting a stream → too many connections.

### Categories

`action=get_live_categories` · `get_vod_categories` · `get_series_categories`

```jsonc
[{ "category_id": "12", "category_name": "Sport", "parent_id": 0 }]
```

### Live streams

`action=get_live_streams` (optional `&category_id=12`)

```jsonc
[{
  "num": 301, "name": "Sport 1 HD", "stream_type": "live", "stream_id": 4521,
  "stream_icon": "http://…/logo.png", "epg_channel_id": "sport1.fr",
  "added": "1700000000", "category_id": "12", "custom_sid": "",
  "tv_archive": 1, "tv_archive_duration": "3", "direct_source": ""
}]
```

### Movies

`action=get_vod_streams` (optional `&category_id=`)

```jsonc
[{
  "num": 1, "name": "Movie title", "stream_type": "movie", "stream_id": 99001,
  "stream_icon": "http://…/poster.jpg", "rating": "7.1", "rating_5based": 3.6,
  "added": "1760000000", "category_id": "40", "container_extension": "mkv"
}]
```

`action=get_vod_info&vod_id=99001`

```jsonc
{
  "info": {
    "movie_image": "…", "backdrop_path": ["…"], "tmdb_id": "…", "genre": "Drama",
    "plot": "…", "cast": "…", "director": "…", "rating": "7.1",
    "releasedate": "2025-03-14", "duration_secs": 6240, "duration": "01:44:00",
    "video": { /* codec info, may be [] */ }, "audio": { /* may be [] */ }
  },
  "movie_data": { "stream_id": 99001, "name": "…", "added": "…", "category_id": "40", "container_extension": "mkv" }
}
```

### Series

`action=get_series` (optional `&category_id=`)

```jsonc
[{
  "num": 1, "name": "Series title", "series_id": 7001, "cover": "…",
  "plot": "…", "cast": "…", "genre": "…", "releaseDate": "2025-01-10",
  "last_modified": "1760000000", "rating": "7.8", "rating_5based": 3.9,
  "backdrop_path": ["…"], "episode_run_time": "50", "category_id": "60"
}]
```

`action=get_series_info&series_id=7001`

```jsonc
{
  "seasons": [{ "season_number": 1, "name": "Season 1", "episode_count": 8, "cover": "…", "air_date": "…" }],
  "info": { /* same fields as the list item */ },
  "episodes": {
    "1": [{
      "id": "120001", "episode_num": 1, "title": "…", "container_extension": "mkv", "season": 1,
      "info": { "duration_secs": 2880, "duration": "00:48:00", "movie_image": "…", "plot": "…", "rating": "…" }
    }]
  }
}
```

`episodes` is an **object keyed by season number**, sometimes an array. `seasons` can be empty even when `episodes` has data: derive seasons from `episodes` keys.

### EPG

`action=get_short_epg&stream_id=4521&limit=4` → now and next few programmes.
`action=get_simple_data_table&stream_id=4521` → the full available day(s), with `has_archive` and `now_playing` flags (for catch-up).

```jsonc
{ "epg_listings": [{
  "id": "…", "epg_id": "…", "channel_id": "sport1.fr", "lang": "en",
  "title": "UHJlbWllciBMZWFndWU=",        // BASE64 — decode as UTF-8
  "description": "…",                      // BASE64
  "start": "2026-10-11 17:30:00", "end": "2026-10-11 19:30:00",
  "start_timestamp": "1791739800", "stop_timestamp": "1791747000",
  "has_archive": 1, "now_playing": 0       // get_simple_data_table only
}]}
```

Use the `*_timestamp` fields; the `start`/`end` strings are in the server's timezone.

Full XMLTV (`/xmltv.php?username=&password=`) is out of v1.

## Stream URLs

| Kind | URL |
| --- | --- |
| Live | `{server}/live/{u}/{p}/{stream_id}.ts` (or `.m3u8` if `allowed_output_formats` lacks `ts`) |
| Movie | `{server}/movie/{u}/{p}/{stream_id}.{container_extension}` |
| Episode | `{server}/series/{u}/{p}/{episode id}.{container_extension}` |
| Catch-up | `{server}/timeshift/{u}/{p}/{duration_minutes}/{YYYY-MM-DD:HH-MM}/{stream_id}.ts` |

Catch-up start time is in the **server timezone** (`server_info.timezone`). Some panels use `/streaming/timeshift.php?username=&password=&stream=&start=&duration=` instead; try the path form first, fall back, and remember which one works per account.

## Quirks to handle

- **Types drift.** Numbers arrive as strings or numbers; booleans as `0`/`1`/`"0"`/`"1"`; empty objects as `[]`. Coerce everything in zod.
- **Missing fields and nulls** are normal. Default them; skip an item only if it has no id.
- **Huge payloads.** `get_live_streams` / `get_vod_streams` without a category can be tens of MB. Parse in chunks or per category, off the UI thread.
- **HTML instead of JSON** on errors or rate limits. Treat a non-JSON body as an error with a clear message.
- **User-Agent filtering.** Some providers reject unknown agents. Send a common desktop agent; make it a hidden setting.
- **Connection limit.** `max_connections` is often 1. Never open two streams at once (CLAUDE.md rule 5), and close the old stream before opening a new one when zapping.
- **Icons** are often `http://`, sometimes dead. Always go through the image cache (DECISIONS D7) with a fallback.
- **Duplicate names** across categories are common; key everything by id.
- **One item, several categories.** The same `stream_id` / `series_id` appears once per category it belongs to, never twice in one (seen 2026-10-11: 138 channels, 1,361 movies with up to 4 categories, 35 series). Store the item once and the memberships separately.
- **Wrong password → HTTP 429 with an empty body** on the test provider; other panels answer `200` with an empty body or `[]`, or `auth: 0`. Treat 429 as "check the login, then wait" (it is also a rate limit after repeated failures, which can block the IP).
- **Every stream URL redirects** (`302`) to a separate streaming host. FFmpeg keeps the first keep-alive socket open after the stream stops and the provider counts it as a connection: send `Connection: close` (DECISIONS D2).
- **`get_short_epg` skips the current programme on the test provider** (seen in M3): it returns nothing that started before about now + 1 h 46 min, on every channel. The panel seems to compare "ends after now" against its own wall clock (Europe/Paris, UTC+2) read as UTC. `get_simple_data_table` is right (its `now_playing` entry covers now) but is ~90 KB per channel against ~15 KB. The core's `fetchSchedule` detects the case (short EPG has programmes, none on now, the table has one) and switches the account to the table, remembered in the account's settings.
- **Channels without `epg_channel_id` have no guide**: both EPG calls return `[]` (15,147 of 21,653 channels on the test provider), so they are never requested.
- **Catch-up** (checked in M3): the path form answers with a `302` to the streaming host's `timeshift.php`, then `200 video/mp2t` with a `Content-Length`. The start is read on the server clock (`server_info.timezone`): a start 30 min in the future gives `404`. The file keeps the broadcast's timestamps (`start_time` ~3,000–4,000 s) and its duration estimate is wrong (93,713 s for a 60-minute request), so players must measure position from the first frame and use the programme's length.
- **`active_cons` lags**: a stream closed by a zap keeps counting for roughly 15–30 s (samples of 2 and 3 on a 1-connection account while a socket monitor saw one stream socket at a time). New streams still open. Poll it before opening the first stream, not as proof of what is open now.
- **Titles carry packaging** (seen in M4): movie names are "FR ★ Title - 2023 [4K]" (98% end in a year; the list API has no year field), series "FR ★ Title", episode titles "FR ★ Series - S01E01 - Pilot". The core's `splitTitleYear` and `episodeTitle` separate the prefix, year and tags ("4K", "VF", "Multi Audio").
- **VOD opens slowly**: 6–10 s to a first frame for 4K HEVC MKV and AVI episodes (provider side: the 302 hop and the file start). With `Connection: close`, each seek reconnects (~2 s for AVI).
- **Idle channels start on demand**: the first byte of a channel nobody is watching can take ~16 s; a retry seconds later answers in under 1 s.
