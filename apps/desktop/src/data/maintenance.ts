/**
 * Settings → Content and Data (SPEC §9) for the active account: hidden
 * categories in one list, the cache and the watch history.
 */

import { invoke } from "@tauri-apps/api/core";
import {
  clearDetailCaches,
  clearHistory,
  countDetailCaches,
  readCategories,
  type ContentKind,
} from "@tuner/core";
import { movies, series } from "./catalog";
import { loadHome } from "./home";
import { setHidden as setLiveHidden } from "./live";
import { activeLibrary } from "./session";

export interface HiddenCategory {
  kind: ContentKind;
  id: string;
  name: string;
  count: number;
}

/** Every hidden category of the active account: Live TV, then Movies, then Series. */
export async function readHidden(): Promise<HiddenCategory[]> {
  const db = activeLibrary();
  if (!db) return [];
  const kinds: ContentKind[] = ["live", "vod", "series"];
  const lists = await Promise.all(kinds.map((kind) => readCategories(db, kind)));
  return lists.flatMap((categories, i) =>
    categories
      .filter((c) => c.hidden)
      .map((c) => ({ kind: kinds[i]!, id: c.id, name: c.name, count: c.count })),
  );
}

/** Shows a hidden category again, through the store of its screen so that screen follows. */
export async function unhide(kind: ContentKind, id: string): Promise<void> {
  if (kind === "live") await setLiveHidden(id, false);
  else await (kind === "vod" ? movies : series).setHidden(id, false);
}

export interface CacheSize {
  /** Bytes of artwork in the image cache (shared by all accounts). */
  imageBytes: number;
  /** Movie and series pages and guide entries cached for the active account. */
  entries: number;
}

export async function readCacheSize(): Promise<CacheSize> {
  const db = activeLibrary();
  const [imageBytes, entries] = await Promise.all([
    invoke<number>("image_cache_size"),
    db ? countDetailCaches(db) : 0,
  ]);
  return { imageBytes, entries };
}

/**
 * Empties the image cache and the active account's downloaded details and
 * guide data. Lists, favorites, history and resume points stay; what was
 * cleared is fetched again when a screen needs it.
 */
export async function clearCache(): Promise<void> {
  const db = activeLibrary();
  await Promise.all([invoke("image_cache_clear"), db ? clearDetailCaches(db) : null]);
}

/** Clears what the active account watched (favorites and resume points stay). */
export async function clearWatchHistory(): Promise<void> {
  const db = activeLibrary();
  if (!db) return;
  await clearHistory(db);
  await loadHome();
}
