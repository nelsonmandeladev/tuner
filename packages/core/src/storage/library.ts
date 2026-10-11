/**
 * The per-account library: categories, live channels, movies and series, as
 * last synced. Writers take a transaction (a list is always replaced whole, so
 * no screen ever sees half of one); readers take the database.
 */

import type { SqlAdapter, SqlTransaction, SqlValue } from "../adapters";
import type { ContentKind } from "../xtream/client";
import type { Category, LiveStream, Series, VodStream } from "../xtream/schemas";
import { insertRows } from "./insert";

export type LibraryList = "categories" | ContentKind;

export function replaceCategories(tx: SqlTransaction, kind: ContentKind, categories: Category[]) {
  tx.execute("DELETE FROM categories WHERE kind = ?", [kind]);
  insertRows(
    tx,
    "categories",
    ["kind", "id", "name", "parent_id", "position"],
    categories.map((c, i) => [kind, c.id, c.name, c.parentId, i]),
    // A provider can list the same category id twice; keep the last.
    { orReplace: true },
  );
}

/**
 * Replaces one content list and its category memberships. Providers list the
 * same item in several categories (never twice in one): the item is stored
 * once, at its first position, and every listing becomes a membership row.
 * Returns the number of distinct items stored.
 */
function replaceItems<T extends { id: number; categoryId: string | null }>(
  tx: SqlTransaction,
  kind: ContentKind,
  columns: readonly string[],
  items: T[],
  toRow: (item: T, position: number) => SqlValue[],
): number {
  const table = TABLE[kind];
  const rows: SqlValue[][] = [];
  const memberships: SqlValue[][] = [];
  const seen = new Set<number>();
  const positionInCategory = new Map<string, number>();
  for (const item of items) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      rows.push(toRow(item, rows.length));
    }
    if (item.categoryId !== null) {
      const position = positionInCategory.get(item.categoryId) ?? 0;
      positionInCategory.set(item.categoryId, position + 1);
      memberships.push([kind, item.categoryId, item.id, position]);
    }
  }
  tx.execute(`DELETE FROM ${table}`);
  tx.execute("DELETE FROM category_items WHERE kind = ?", [kind]);
  insertRows(tx, table, columns, rows);
  // OR IGNORE: one listing per (category, item) even if a provider repeats one.
  insertRows(tx, "category_items", ["kind", "category_id", "item_id", "position"], memberships, {
    orIgnore: true,
  });
  return rows.length;
}

const TABLE: Record<ContentKind, string> = { live: "live", vod: "vod", series: "series" };

export function replaceLive(tx: SqlTransaction, streams: LiveStream[]): number {
  return replaceItems(
    tx,
    "live",
    [
      "id",
      "num",
      "name",
      "icon",
      "epg_channel_id",
      "added_at",
      "tv_archive",
      "tv_archive_days",
      "position",
    ],
    streams,
    (s, i) => [
      s.id,
      s.num,
      s.name,
      s.icon,
      s.epgChannelId,
      s.addedAt,
      s.tvArchive,
      s.tvArchiveDays,
      i,
    ],
  );
}

export function replaceVod(tx: SqlTransaction, movies: VodStream[]): number {
  return replaceItems(
    tx,
    "vod",
    ["id", "num", "name", "icon", "rating", "added_at", "ext", "position"],
    movies,
    (m, i) => [m.id, m.num, m.name, m.icon, m.rating, m.addedAt, m.ext, i],
  );
}

export function replaceSeries(tx: SqlTransaction, series: Series[]): number {
  return replaceItems(
    tx,
    "series",
    [
      "id",
      "num",
      "name",
      "cover",
      "plot",
      "cast_names",
      "director",
      "genre",
      "release_date",
      "last_modified_at",
      "rating",
      "backdrop",
      "episode_run_time",
      "position",
    ],
    series,
    (s, i) => [
      s.id,
      s.num,
      s.name,
      s.cover,
      s.plot,
      s.cast,
      s.director,
      s.genre,
      s.releaseDate,
      s.lastModifiedAt,
      s.rating,
      s.backdrop,
      s.episodeRunTime,
      i,
    ],
  );
}

export function recordSync(
  tx: SqlTransaction,
  list: LibraryList,
  count: number,
  skipped: number,
  at: number,
) {
  tx.execute(
    "INSERT OR REPLACE INTO sync_state (list, synced_at, count, skipped) VALUES (?, ?, ?, ?)",
    [list, at, count, skipped],
  );
}

export interface ListSyncState {
  list: LibraryList;
  syncedAt: number;
  count: number;
  skipped: number;
}

/** When each list was last synced. Empty for an account that never synced. */
export async function readSyncState(db: SqlAdapter): Promise<ListSyncState[]> {
  const rows = await db.select<{
    list: LibraryList;
    synced_at: number;
    count: number;
    skipped: number;
  }>("SELECT list, synced_at, count, skipped FROM sync_state");
  return rows.map((r) => ({
    list: r.list,
    syncedAt: Number(r.synced_at),
    count: Number(r.count),
    skipped: Number(r.skipped),
  }));
}

export interface LibraryCounts {
  live: number;
  vod: number;
  series: number;
}

export async function readCounts(db: SqlAdapter): Promise<LibraryCounts> {
  const [row] = await db.select<LibraryCounts>(
    "SELECT (SELECT COUNT(*) FROM live) AS live, (SELECT COUNT(*) FROM vod) AS vod, (SELECT COUNT(*) FROM series) AS series",
  );
  return {
    live: Number(row?.live ?? 0),
    vod: Number(row?.vod ?? 0),
    series: Number(row?.series ?? 0),
  };
}

export interface CategoryWithCount {
  id: string;
  name: string;
  count: number;
  hidden: boolean;
}

/** Categories of one kind in provider order, with item counts and the hidden flag. */
export async function readCategories(
  db: SqlAdapter,
  kind: ContentKind,
): Promise<CategoryWithCount[]> {
  const rows = await db.select<{ id: string; name: string; count: number; hidden: number }>(
    `SELECT c.id, c.name,
       (SELECT COUNT(*) FROM category_items m WHERE m.kind = c.kind AND m.category_id = c.id) AS count,
       EXISTS (SELECT 1 FROM hidden_categories h WHERE h.kind = c.kind AND h.id = c.id) AS hidden
     FROM categories c WHERE c.kind = ? ORDER BY c.position`,
    [kind],
  );
  return rows.map((r) => ({
    id: String(r.id),
    name: r.name,
    count: Number(r.count),
    hidden: Number(r.hidden) === 1,
  }));
}
