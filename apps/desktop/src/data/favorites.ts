/**
 * Favorites for the active account (SPEC §8): channels, movies and series,
 * read once and kept here so every heart, the Favorites categories and Home
 * agree. Toggling writes the account database and updates every screen.
 */

import { readFavorites, setFavorite, type ContentKind } from "@tuner/core";
import { create } from "zustand";
import { activeLibrary, useSession } from "./session";

export interface FavoritesState {
  accountId: string | null;
  /** Ids per kind, in the order they were added. */
  live: number[];
  vod: number[];
  series: number[];
}

export const useFavorites = create<FavoritesState>(() => ({
  accountId: null,
  live: [],
  vod: [],
  series: [],
}));

let loading: Promise<void> | null = null;

/** Loads the active account's favorites, once per account. */
export function loadFavorites(): Promise<void> {
  const { active } = useSession.getState();
  const db = activeLibrary();
  if (!active || !db) return Promise.resolve();
  if (useFavorites.getState().accountId === active.id) return Promise.resolve();
  loading ??= Promise.all([
    readFavorites(db, "live"),
    readFavorites(db, "vod"),
    readFavorites(db, "series"),
  ])
    .then(([live, vod, series]) =>
      useFavorites.setState({ accountId: active.id, live, vod, series }),
    )
    .finally(() => {
      loading = null;
    });
  return loading;
}

// Another account: its favorites load on the next read; none of these apply.
useSession.subscribe((state, prev) => {
  if (state.active?.id !== prev.active?.id && useFavorites.getState().accountId !== null) {
    useFavorites.setState({ accountId: null, live: [], vod: [], series: [] });
  }
});

export function isFavorite(kind: ContentKind, id: number): boolean {
  return useFavorites.getState()[kind].includes(id);
}

/** Whether `id` is a favorite, for a heart that re-renders when it changes. */
export function useIsFavorite(kind: ContentKind, id: number): boolean {
  return useFavorites((s) => s[kind].includes(id));
}

/** Adds or removes a favorite; the screens update at once, the database right after. */
export async function setFavoriteOf(kind: ContentKind, id: number, on: boolean): Promise<void> {
  const db = activeLibrary();
  if (!db || isFavorite(kind, id) === on) return;
  useFavorites.setState((s) => ({
    [kind]: on ? [...s[kind], id] : s[kind].filter((f) => f !== id),
  }));
  await setFavorite(db, kind, id, on, Date.now());
}

export function toggleFavorite(kind: ContentKind, id: number): Promise<void> {
  return setFavoriteOf(kind, id, !isFavorite(kind, id));
}
