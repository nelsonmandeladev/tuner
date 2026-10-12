/**
 * Movie and series detail pages (SPEC §5–6). Everything a page shows comes
 * from here: the synced row, `get_vod_info` / `get_series_info` through the
 * core's caches (7 days / 1 day), resume points and the favorite flag.
 */

import {
  loadSeriesInfo,
  loadVodInfo,
  readAccountPref,
  readFavorites,
  readResume,
  readSeriesItem,
  readVodItem,
  setFavorite,
  writeAccountPref,
  type ResumePoint,
  type SeriesInfo,
  type SeriesItem,
  type VodInfo,
  type VodItem,
} from "@tuner/core";
import { activeClient, activeLibrary } from "./session";

export interface MovieDetail {
  item: VodItem;
  /** Null when the provider could not be reached and nothing is cached. */
  info: VodInfo | null;
  resume: ResumePoint | null;
  favorite: boolean;
}

export interface SeriesDetail {
  item: SeriesItem;
  info: SeriesInfo | null;
  /** By episode id. */
  resume: Map<number, ResumePoint>;
  favorite: boolean;
}

export async function loadMovie(id: number): Promise<MovieDetail | null> {
  const db = activeLibrary();
  if (!db) return null;
  const item = await readVodItem(db, id);
  if (!item) return null;
  const client = await activeClient();
  const [info, resume, favorites] = await Promise.all([
    client
      ? loadVodInfo(client, db, id)
          .then((r) => r.value)
          .catch(() => null)
      : null,
    readResume(db, "vod", [id]),
    readFavorites(db, "vod"),
  ]);
  return { item, info, resume: resume.get(id) ?? null, favorite: favorites.includes(id) };
}

export async function loadSeries(id: number): Promise<SeriesDetail | null> {
  const db = activeLibrary();
  if (!db) return null;
  const item = await readSeriesItem(db, id);
  if (!item) return null;
  const client = await activeClient();
  const [info, favorites] = await Promise.all([
    client
      ? loadSeriesInfo(client, db, id)
          .then((r) => r.value)
          .catch(() => null)
      : null,
    readFavorites(db, "series"),
  ]);
  const ids = info?.episodes.map((e) => e.id) ?? [];
  return {
    item,
    info,
    resume: await readResume(db, "episode", ids),
    favorite: favorites.includes(id),
  };
}

export async function setItemFavorite(kind: "vod" | "series", id: number, on: boolean) {
  const db = activeLibrary();
  if (db) await setFavorite(db, kind, id, on, Date.now());
}

const PREF_AUTOPLAY = "series.autoplayNext";

/** "Play next episode automatically" (SPEC §9 Content), on by default. */
export async function readAutoplayNext(): Promise<boolean> {
  const db = activeLibrary();
  return db ? readAccountPref(db, PREF_AUTOPLAY, true) : true;
}

export async function writeAutoplayNext(on: boolean) {
  const db = activeLibrary();
  if (db) await writeAccountPref(db, PREF_AUTOPLAY, on);
}
