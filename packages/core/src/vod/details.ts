/**
 * Detail pages (SPEC "Data and sync"): `get_vod_info` cached 7 days,
 * `get_series_info` cached 1 day. A fresh cache answers without the network;
 * a stale one is refreshed, and still answers if the provider can't be reached.
 */

import type { SqlAdapter } from "../adapters";
import { readDetail, replaceEpisodes, writeDetail } from "../storage/vod";
import type { SeriesInfo, XtreamClient } from "../xtream/client";
import type { VodInfo } from "../xtream/schemas";

export const VOD_INFO_FRESH_MS = 7 * 86_400_000;
export const SERIES_INFO_FRESH_MS = 86_400_000;

export interface DetailResult<T> {
  value: T;
  fetchedAt: number;
  /** "cache": fresh from the cache. "network": just fetched. "stale": old cache, the fetch failed. */
  source: "cache" | "network" | "stale";
}

async function cached<T>(
  db: SqlAdapter,
  kind: "vod" | "series",
  id: number,
  freshMs: number,
  now: number,
  fetch: () => Promise<T>,
  saved?: (value: T) => Promise<void>,
): Promise<DetailResult<T>> {
  const hit = await readDetail<T>(db, kind, id);
  if (hit && now - hit.fetchedAt < freshMs) return { ...hit, source: "cache" };
  try {
    const value = await fetch();
    await writeDetail(db, kind, id, value, now);
    await saved?.(value);
    return { value, fetchedAt: now, source: "network" };
  } catch (error) {
    if (hit) return { ...hit, source: "stale" };
    throw error;
  }
}

export function loadVodInfo(
  client: XtreamClient,
  db: SqlAdapter,
  id: number,
  now = Date.now(),
): Promise<DetailResult<VodInfo>> {
  return cached(db, "vod", id, VOD_INFO_FRESH_MS, now, () => client.vodInfo(id));
}

/** Seasons and episodes; the episodes are also written to the `episodes` table. */
export function loadSeriesInfo(
  client: XtreamClient,
  db: SqlAdapter,
  id: number,
  now = Date.now(),
): Promise<DetailResult<SeriesInfo>> {
  return cached(
    db,
    "series",
    id,
    SERIES_INFO_FRESH_MS,
    now,
    () => client.seriesInfo(id),
    (info) => replaceEpisodes(db, id, info.episodes),
  );
}
