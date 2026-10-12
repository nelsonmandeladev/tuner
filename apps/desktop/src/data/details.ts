/**
 * Movie and series detail pages (SPEC §5–6). Everything a page shows comes
 * from here: the synced row, `get_vod_info` / `get_series_info` through the
 * core's caches (7 days / 1 day) and resume points. Hearts read the shared
 * favorites store (data/favorites.ts).
 */

import {
  loadSeriesInfo,
  loadVodInfo,
  foldText,
  readAccountPref,
  readRelatedVod,
  readResume,
  readSeriesItem,
  readVodItem,
  writeAccountPref,
  type ResumePoint,
  type SeriesInfo,
  type SeriesItem,
  type VodInfo,
  type VodItem,
} from "@tuner/core";
import { posterFromVod, type PosterItem } from "./catalog";
import { loadFavorites } from "./favorites";
import { activeClient, activeLibrary } from "./session";

export interface MovieDetail {
  item: VodItem;
  /** Null when the provider could not be reached and nothing is cached. */
  info: VodInfo | null;
  resume: ResumePoint | null;
}

export interface SeriesDetail {
  item: SeriesItem;
  info: SeriesInfo | null;
  /** By episode id. */
  resume: Map<number, ResumePoint>;
}

export async function loadMovie(id: number): Promise<MovieDetail | null> {
  const db = activeLibrary();
  if (!db) return null;
  const item = await readVodItem(db, id);
  if (!item) return null;
  const client = await activeClient();
  const [info, resume] = await Promise.all([
    client
      ? loadVodInfo(client, db, id)
          .then((r) => r.value)
          .catch(() => null)
      : null,
    readResume(db, "vod", [id]),
    loadFavorites(),
  ]);
  return { item, info, resume: resume.get(id) ?? null };
}

export async function loadSeries(id: number): Promise<SeriesDetail | null> {
  const db = activeLibrary();
  if (!db) return null;
  const item = await readSeriesItem(db, id);
  if (!item) return null;
  const client = await activeClient();
  const [info] = await Promise.all([
    client
      ? loadSeriesInfo(client, db, id)
          .then((r) => r.value)
          .catch(() => null)
      : null,
    loadFavorites(),
  ]);
  const ids = info?.episodes.map((e) => e.id) ?? [];
  return {
    item,
    info,
    resume: await readResume(db, "episode", ids),
  };
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

/** Posters in a movie's "More like this" row. */
export const RELATED_MOVIES = 18;

/**
 * Movies like this one (shared categories, best rated first), one poster per
 * title: providers list the same film again in other qualities or languages.
 */
export async function loadRelatedMovies(id: number, title: string): Promise<PosterItem[]> {
  const db = activeLibrary();
  if (!db) return [];
  const seen = new Set([foldText(title)]);
  const related: PosterItem[] = [];
  for (const movie of await readRelatedVod(db, id, RELATED_MOVIES * 3)) {
    const poster = posterFromVod(movie);
    const key = foldText(poster.title);
    if (seen.has(key)) continue;
    seen.add(key);
    related.push(poster);
    if (related.length === RELATED_MOVIES) break;
  }
  return related;
}
