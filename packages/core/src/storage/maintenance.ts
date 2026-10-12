/**
 * Settings → Data (SPEC §9): when the lists need a refresh, and the two
 * "clear" actions. Each works on one account's database.
 *
 * Clearing never touches favorites, resume points, hidden categories or the
 * account's preferences (SPEC §8: history can be cleared on its own).
 */

import type { SqlAdapter } from "../adapters";
import type { ListSyncState, LibraryList } from "./library";

const LISTS: readonly LibraryList[] = ["categories", "live", "vod", "series"];

/** SPEC "Refresh strategy": lists older than this are refreshed in the background on launch. */
export const DEFAULT_REFRESH_HOURS = 12;

/**
 * Whether the library should be refreshed: a list was never synced, or the
 * oldest one is older than `maxAgeHours`. `0` means "only by hand": never stale.
 */
export function libraryIsStale(
  syncState: readonly ListSyncState[],
  maxAgeHours: number,
  now: number,
): boolean {
  if (!(maxAgeHours > 0)) return false;
  const synced = new Map(syncState.map((s) => [s.list, s.syncedAt]));
  if (LISTS.some((list) => !synced.has(list))) return true;
  const oldest = Math.min(...LISTS.map((list) => synced.get(list)!));
  return now - oldest >= maxAgeHours * 3_600_000;
}

/** The time of the oldest list sync, or null if a list never synced. */
export function oldestSync(syncState: readonly ListSyncState[]): number | null {
  const synced = new Map(syncState.map((s) => [s.list, s.syncedAt]));
  if (LISTS.some((list) => !synced.has(list))) return null;
  return Math.min(...LISTS.map((list) => synced.get(list)!));
}

/**
 * Forgets what was watched: Home's recently watched channels and the order of
 * Continue watching. Resume points stay, so in-progress items keep their place.
 */
export async function clearHistory(db: SqlAdapter): Promise<void> {
  await db.execute("DELETE FROM history");
}

/**
 * Drops downloaded details (movie and series pages) and guide data; both are
 * fetched again when needed. Episodes stay: resume points and Home refer to them.
 */
export async function clearDetailCaches(db: SqlAdapter): Promise<void> {
  await db.transaction(async (tx) => {
    tx.execute("DELETE FROM details_cache");
    tx.execute("DELETE FROM epg_cache");
  });
}

/** Rows in the detail and guide caches (Settings shows them with the image cache's size). */
export async function countDetailCaches(db: SqlAdapter): Promise<number> {
  const [row] = await db.select<{ n: number }>(
    "SELECT (SELECT COUNT(*) FROM details_cache) + (SELECT COUNT(*) FROM epg_cache) AS n",
  );
  return Number(row?.n ?? 0);
}
