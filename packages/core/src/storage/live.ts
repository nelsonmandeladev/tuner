/**
 * Live TV reads and personal data (ROADMAP M3): the channel index, category
 * memberships, favorites, hidden categories, the EPG cache and per-channel
 * preferences. Personal rows are keyed by id, so they survive every sync.
 */

import type { SqlAdapter } from "../adapters";
import type { Programme } from "../epg/schedule";
import type { ContentKind } from "../xtream/client";
import { getSetting, setSetting } from "./accounts";

export interface LiveChannel {
  id: number;
  num: number | null;
  name: string;
  icon: string | null;
  epgChannelId: string | null;
  tvArchive: boolean;
  tvArchiveDays: number;
}

/** Every live channel in provider order. ~20,000 rows: keep the columns few. */
export async function readLiveChannels(db: SqlAdapter): Promise<LiveChannel[]> {
  const rows = await db.select<{
    id: number;
    num: number | null;
    name: string;
    icon: string | null;
    epg: string | null;
    archive: number;
    days: number;
  }>(
    `SELECT id, num, name, icon, epg_channel_id AS epg, tv_archive AS archive, tv_archive_days AS days
     FROM live ORDER BY position`,
  );
  return rows.map((r) => ({
    id: Number(r.id),
    num: r.num === null ? null : Number(r.num),
    name: r.name,
    icon: r.icon,
    epgChannelId: r.epg,
    tvArchive: Number(r.archive) === 1,
    tvArchiveDays: Number(r.days),
  }));
}

/** Channel ids per category, in the provider's order within each category. */
export async function readMemberships(
  db: SqlAdapter,
  kind: ContentKind,
): Promise<Map<string, number[]>> {
  const rows = await db.select<{ c: string; i: number }>(
    "SELECT category_id AS c, item_id AS i FROM category_items WHERE kind = ? ORDER BY category_id, position",
    [kind],
  );
  const byCategory = new Map<string, number[]>();
  for (const { c, i } of rows) {
    const key = String(c);
    let ids = byCategory.get(key);
    if (!ids) byCategory.set(key, (ids = []));
    ids.push(Number(i));
  }
  return byCategory;
}

/** Favorite ids of one kind, oldest first (the order they were added). */
export async function readFavorites(db: SqlAdapter, kind: ContentKind): Promise<number[]> {
  const rows = await db.select<{ id: number }>(
    "SELECT id FROM favorites WHERE kind = ? ORDER BY added_at, id",
    [kind],
  );
  return rows.map((r) => Number(r.id));
}

export async function setFavorite(
  db: SqlAdapter,
  kind: ContentKind,
  id: number,
  favorite: boolean,
  at: number,
): Promise<void> {
  if (favorite) {
    await db.execute("INSERT OR IGNORE INTO favorites (kind, id, added_at) VALUES (?, ?, ?)", [
      kind,
      id,
      at,
    ]);
  } else {
    await db.execute("DELETE FROM favorites WHERE kind = ? AND id = ?", [kind, id]);
  }
}

/** Hidden categories disappear everywhere (SPEC §3), until unhidden. */
export async function setCategoryHidden(
  db: SqlAdapter,
  kind: ContentKind,
  id: string,
  hidden: boolean,
): Promise<void> {
  if (hidden) {
    await db.execute("INSERT OR IGNORE INTO hidden_categories (kind, id) VALUES (?, ?)", [
      kind,
      id,
    ]);
  } else {
    await db.execute("DELETE FROM hidden_categories WHERE kind = ? AND id = ?", [kind, id]);
  }
}

/** Cached schedules fetched at or after `freshAfter`, by stream id. */
export async function readEpgCache(
  db: SqlAdapter,
  streamIds: readonly number[],
  freshAfter: number,
): Promise<Map<number, Programme[]>> {
  const found = new Map<number, Programme[]>();
  if (streamIds.length === 0) return found;
  const rows = await db.select<{ stream_id: number; json: string }>(
    `SELECT stream_id, json FROM epg_cache
     WHERE fetched_at >= ? AND stream_id IN (${streamIds.map(() => "?").join(", ")})`,
    [freshAfter, ...streamIds],
  );
  for (const row of rows) {
    try {
      const parsed: unknown = JSON.parse(row.json);
      if (Array.isArray(parsed)) found.set(Number(row.stream_id), parsed as Programme[]);
    } catch {
      // A damaged row is a cache miss.
    }
  }
  return found;
}

export async function writeEpgCache(
  db: SqlAdapter,
  streamId: number,
  programmes: readonly Programme[],
  at: number,
): Promise<void> {
  await db.execute(
    "INSERT OR REPLACE INTO epg_cache (stream_id, json, fetched_at) VALUES (?, ?, ?)",
    [streamId, JSON.stringify(programmes), at],
  );
}

/**
 * Per-account preferences in the account database's `settings` table, as
 * JSON. Returns `fallback` for a missing or damaged value.
 */
export async function readAccountPref<T>(db: SqlAdapter, key: string, fallback: T): Promise<T> {
  const value = await getSetting(db, key);
  if (value === null) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function writeAccountPref(db: SqlAdapter, key: string, value: unknown): Promise<void> {
  return setSetting(db, key, JSON.stringify(value));
}
