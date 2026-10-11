#!/usr/bin/env node
/**
 * Records Xtream API fixtures for packages/core tests from the dev account in
 * .env.local (ROADMAP M2). Run from the repo root:
 *
 *   node scripts/record-fixtures.mjs
 *
 * What it writes is safe to commit:
 * - credentials and the provider host never appear (they are also checked
 *   before anything is written);
 * - channel, movie, series, category and programme names, plots, people and
 *   artwork URLs are replaced with synthetic text (CLAUDE.md rule 4: no bundled
 *   content). Everything else is kept as the provider sent it: field order,
 *   strings-vs-numbers, nulls, empty arrays where objects belong. Those quirks
 *   are what the schemas must survive.
 * - lists are trimmed to about 20 items.
 *
 * It prints counts and file names only, never URLs.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT = join(import.meta.dirname, "..", "packages", "core", "test", "fixtures");
const KEEP = 20;
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

const env = Object.fromEntries(
  readFileSync(join(import.meta.dirname, "..", ".env.local"), "utf8")
    .split(/\r?\n/)
    .filter((line) => /^\w+=/.test(line))
    .map((line) => {
      const i = line.indexOf("=");
      return [
        line.slice(0, i),
        line
          .slice(i + 1)
          .trim()
          .replace(/^["']|["']$/g, ""),
      ];
    }),
);
const server = env.XTREAM_SERVER.replace(/\/+$/, "");
const { XTREAM_USERNAME: username, XTREAM_PASSWORD: password } = env;
const host = new URL(server).hostname;
const secrets = [
  server,
  host,
  username,
  password,
  encodeURIComponent(username),
  encodeURIComponent(password),
];

const scrub = (text) => secrets.reduce((acc, s) => acc.split(s).join("***"), String(text));

async function api(params = {}) {
  const query = new URLSearchParams({ username, password, ...params });
  const res = await fetch(`${server}/player_api.php?${query}`, { headers: { "User-Agent": UA } });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`non-JSON response (${res.status}) for ${params.action ?? "account info"}`);
  }
}

// --- anonymisation --------------------------------------------------------

const TEXT_KEYS = new Set([
  "name",
  "title",
  "o_name",
  "plot",
  "description",
  "cast",
  "actors",
  "director",
  "genre",
  "category_name",
  "episode_name",
  "kinopoisk_url",
  "youtube_trailer",
  "country",
  "message",
]);
const IMAGE_KEYS = new Set([
  "stream_icon",
  "cover",
  "cover_big",
  "movie_image",
  "backdrop_path",
  "cover_tmdb",
  "screenshot_uri",
]);
const BASE64_KEYS = new Set(["title", "description"]);
let counter = 0;

function synthetic(key, value) {
  counter += 1;
  if (typeof value !== "string" || value === "") return value;
  // Keep one accented, one non-Latin and one emoji-like sample so decoding is exercised.
  const flavour = ["", " é", " ★", " ◉ FHD"][counter % 4];
  return `${key.replace(/_/g, " ")} ${counter}${flavour}`;
}

function anonymise(value, key = "", inEpg = false) {
  if (Array.isArray(value)) {
    if (IMAGE_KEYS.has(key))
      return value.map((v, i) =>
        typeof v === "string" && v ? `http://img.example.invalid/${key}/${i}.jpg` : v,
      );
    return value.map((v) => anonymise(v, key, inEpg));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, anonymise(v, k, inEpg || k === "epg_listings")]),
    );
  }
  if (key === "username") return typeof value === "string" ? "user" : value;
  if (key === "password") return typeof value === "string" ? "pass" : value;
  if (key === "url" && typeof value === "string") return "provider.example.invalid";
  if ((key === "channel_id" || key === "epg_channel_id") && typeof value === "string" && value) {
    return `channel-${(counter += 1)}.example`;
  }
  if (IMAGE_KEYS.has(key))
    return typeof value === "string" && value ? `http://img.example.invalid/${key}.jpg` : value;
  if (inEpg && BASE64_KEYS.has(key) && typeof value === "string") {
    return Buffer.from(synthetic(`programme ${key}`, "x"), "utf8").toString("base64");
  }
  if (TEXT_KEYS.has(key)) return synthetic(key, value);
  if (typeof value === "string")
    return scrub(value).replace(
      new RegExp(host.replace(/\./g, "\\."), "g"),
      "provider.example.invalid",
    );
  return value;
}

function save(file, data) {
  const json = JSON.stringify(anonymise(data), null, 2) + "\n";
  for (const secret of secrets) {
    if (secret && json.includes(secret))
      throw new Error(`refusing to write ${file}: it still contains a secret`);
  }
  writeFileSync(join(OUT, file), json);
  console.log(`wrote ${file} (${Array.isArray(data) ? `${data.length} items` : "object"})`);
}

// --- recording ------------------------------------------------------------

/** First KEEP items, plus any item matching `extra` so rarer shapes are covered. */
function pick(list, extra = () => false) {
  const items = Array.isArray(list) ? list : Object.values(list ?? {});
  const head = items.slice(0, KEEP);
  const more = items.slice(KEEP).filter(extra).slice(0, 3);
  return [...head, ...more];
}

mkdirSync(OUT, { recursive: true });

save("account-info.json", await api());
save("live-categories.json", pick(await api({ action: "get_live_categories" })));
save("vod-categories.json", pick(await api({ action: "get_vod_categories" })));
save("series-categories.json", pick(await api({ action: "get_series_categories" })));

const live = await api({ action: "get_live_streams" });
save(
  "live-streams.json",
  pick(live, (s) => Number(s.tv_archive) === 1),
);

const vod = await api({ action: "get_vod_streams" });
save(
  "vod-streams.json",
  pick(vod, (v) => v.container_extension !== "mkv"),
);

const series = await api({ action: "get_series" });
save("series.json", pick(series));

const vodWithCodec = vod.find((v) => /\[4K\]/.test(v.name)) ?? vod[0];
save(
  "vod-info.json",
  await api({ action: "get_vod_info", vod_id: String(vodWithCodec.stream_id) }),
);

for (const s of series.slice(0, 20)) {
  const info = await api({ action: "get_series_info", series_id: String(s.series_id) });
  const episodes = info?.episodes;
  if (episodes && Object.keys(episodes).length > 0) {
    // Keep two seasons and a few episodes each.
    const kept = Array.isArray(episodes)
      ? episodes.slice(0, 2).map((season) => (Array.isArray(season) ? season.slice(0, 4) : season))
      : Object.fromEntries(
          Object.entries(episodes)
            .slice(0, 2)
            .map(([k, v]) => [k, Array.isArray(v) ? v.slice(0, 4) : v]),
        );
    save("series-info.json", { ...info, episodes: kept });
    break;
  }
}

const archived = live.find((s) => Number(s.tv_archive) === 1) ?? live[0];
const withEpg = live.find((s) => s.epg_channel_id) ?? live[0];
const epg = await api({
  action: "get_short_epg",
  stream_id: String(withEpg.stream_id),
  limit: "4",
});
save("short-epg.json", epg);
const table = await api({ action: "get_simple_data_table", stream_id: String(archived.stream_id) });
save("simple-data-table.json", {
  ...table,
  epg_listings: Array.isArray(table?.epg_listings)
    ? table.epg_listings.slice(0, KEEP)
    : table?.epg_listings,
});

console.log("done");
