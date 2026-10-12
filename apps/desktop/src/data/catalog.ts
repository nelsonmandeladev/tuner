/**
 * Movies and Series grids (ROADMAP M4): every item of a kind, its categories
 * with counts, hidden categories, favorites (M5), the sort, and resume progress, read once
 * from the account's library. Category and sort changes then run on arrays
 * in memory (CLAUDE.md rule 6: screens never fetch).
 */

import {
  readAccountPref,
  readCategories,
  readMemberships,
  readResume,
  readSeriesItems,
  readVodItems,
  resumeProgress,
  setCategoryHidden,
  sortIds,
  splitTitleYear,
  writeAccountPref,
  yearOf,
  type CategoryWithCount,
  type GridSort,
} from "@tuner/core";
import { create, type StoreApi, type UseBoundStore } from "zustand";
import type { CategoryView } from "./categoryView";
import { loadFavorites, useFavorites } from "./favorites";
import { activeLibrary, useSession } from "./session";

export type CatalogKind = "vod" | "series";

/** One poster in a grid, the same shape for movies and series. */
export interface PosterItem {
  id: number;
  /** The provider's full name. */
  name: string;
  /** The name without a trailing year ("Title - 2023" → "Title"). */
  title: string;
  year: number | null;
  image: string | null;
  rating: number | null;
  addedAt: number | null;
  genre: string | null;
  /** Movies: container extension for the stream URL. */
  ext: string | null;
}

export const ALL = "all";
/** Built-in category above "All" (SPEC §8: favorites are a filter in Movies and Series). */
export const FAVORITES = "fav";

export interface CatalogState {
  status: "idle" | "loading" | "ready" | "error";
  accountId: string | null;
  /** The session's `libraryVersion` the grid was read at (a sync replaces lists). */
  version: number;
  loadMs: number | null;
  items: Map<number, PosterItem>;
  categories: CategoryView[];
  hiddenCategories: CategoryView[];
  categoryId: string;
  sort: GridSort;
  /** The ids the grid shows, in order. */
  list: number[];
  /** 0–1 per movie with a resume point (posters show it). */
  progress: Map<number, number>;
}

interface Index {
  order: number[];
  memberships: Map<string, number[]>;
  categoriesOf: Map<number, string[]>;
  providerCategories: CategoryWithCount[];
  hidden: Set<string>;
}

export interface Catalog {
  kind: CatalogKind;
  use: UseBoundStore<StoreApi<CatalogState>>;
  load: () => Promise<void>;
  selectCategory: (id: string) => void;
  setSort: (sort: GridSort) => void;
  setHidden: (id: string, hidden: boolean) => Promise<void>;
  refreshProgress: () => Promise<void>;
  /** Shows a category with a sort (Home's "See all"), now or as soon as the grid loads. */
  openWith: (view: { categoryId: string; sort: GridSort }) => void;
  /** Dev measurements only: replaces the list with `count` generated items. */
  injectSynthetic: (count: number) => void;
}

function createCatalog(kind: CatalogKind): Catalog {
  const use = create<CatalogState>(() => ({
    status: "idle",
    accountId: null,
    version: -1,
    loadMs: null,
    items: new Map(),
    categories: [],
    hiddenCategories: [],
    categoryId: ALL,
    sort: "recent",
    list: [],
    progress: new Map(),
  }));
  const set = use.setState;
  const get = use.getState;
  let index: Index = {
    order: [],
    memberships: new Map(),
    categoriesOf: new Map(),
    providerCategories: [],
    hidden: new Set(),
  };
  const PREF_CATEGORY = `grid.${kind}.category`;
  const PREF_SORT = `grid.${kind}.sort`;

  const allVisible = () =>
    index.hidden.size === 0
      ? index.order
      : index.order.filter((id) =>
          (index.categoriesOf.get(id) ?? []).some((c) => !index.hidden.has(c)),
        );

  function refresh(patch: Partial<CatalogState> = {}) {
    set(patch);
    const provider = index.providerCategories
      .filter((c) => c.count > 0)
      .map((c) => ({ ...c, hidden: index.hidden.has(c.id), builtIn: false }));
    const all = allVisible();
    const items = get().items;
    const favorites = useFavorites.getState()[kind].filter((id) => items.has(id));
    const categories: CategoryView[] = [
      {
        id: FAVORITES,
        name: "Favorites",
        count: favorites.length,
        hidden: false,
        builtIn: true,
      },
      {
        id: ALL,
        name: kind === "vod" ? "All movies" : "All series",
        count: all.length,
        hidden: false,
        builtIn: true,
      },
      ...provider.filter((c) => !c.hidden),
    ];
    const state = get();
    const categoryId = categories.some((c) => c.id === state.categoryId) ? state.categoryId : ALL;
    const ids =
      categoryId === ALL
        ? all
        : categoryId === FAVORITES
          ? favorites
          : (index.memberships.get(categoryId) ?? []);
    set({
      categories,
      hiddenCategories: provider.filter((c) => c.hidden),
      categoryId,
      list: sortIds(ids, state.items, state.sort),
    });
  }

  let loading: Promise<void> | null = null;
  /** A view asked for before the grid loaded; it wins over the remembered one. */
  let pending: { categoryId: string; sort: GridSort } | null = null;

  async function load() {
    const { active, libraryVersion } = useSession.getState();
    const db = activeLibrary();
    if (!active || !db) return;
    // Read again after a sync, keeping the grid, category and sort on screen meanwhile.
    const sameAccount = get().accountId === active.id && get().status === "ready";
    if (sameAccount && get().version === libraryVersion) return;
    loading ??= (async () => {
      const t0 = performance.now();
      if (!sameAccount) set({ status: "loading" });
      try {
        const [rows, memberships, categories, categoryId, sort] = await Promise.all([
          kind === "vod"
            ? readVodItems(db).then((r) => r.map(posterFromVod))
            : readSeriesItems(db).then((r) => r.map(posterFromSeries)),
          readMemberships(db, kind),
          readCategories(db, kind),
          readAccountPref<string>(db, PREF_CATEGORY, ALL),
          readAccountPref<GridSort>(db, PREF_SORT, "recent"),
          loadFavorites(),
        ]);
        const categoriesOf = new Map<number, string[]>();
        for (const [category, ids] of memberships) {
          for (const id of ids) {
            const list = categoriesOf.get(id);
            if (list) list.push(category);
            else categoriesOf.set(id, [category]);
          }
        }
        index = {
          order: rows.map((r) => r.id),
          memberships,
          categoriesOf,
          providerCategories: categories,
          hidden: new Set(categories.filter((c) => c.hidden).map((c) => c.id)),
        };
        const keep = sameAccount ? get() : null;
        refresh({
          accountId: active.id,
          version: libraryVersion,
          items: new Map(rows.map((r) => [r.id, r])),
          categoryId: pending?.categoryId ?? keep?.categoryId ?? categoryId,
          sort: pending?.sort ?? keep?.sort ?? sort,
        });
        pending = null;
        set({ status: "ready", loadMs: Math.round(performance.now() - t0) });
        void refreshProgress();
      } catch {
        set({ status: "error" });
      }
    })().finally(() => {
      loading = null;
    });
    return loading;
  }

  async function refreshProgress() {
    const db = activeLibrary();
    if (!db || kind !== "vod") return;
    const points = await readResume(db, "vod");
    set({ progress: new Map([...points].map(([id, p]) => [id, resumeProgress(p)])) });
  }

  // A heart pressed on a detail page, Home or search updates the Favorites category.
  useFavorites.subscribe((state, prev) => {
    if (state[kind] !== prev[kind] && get().status === "ready") refresh();
  });

  return {
    kind,
    use,
    load,
    refreshProgress,
    selectCategory(id) {
      if (id === get().categoryId) return;
      refresh({ categoryId: id });
      const db = activeLibrary();
      if (db) void writeAccountPref(db, PREF_CATEGORY, id);
    },
    setSort(sort) {
      if (sort === get().sort) return;
      refresh({ sort });
      const db = activeLibrary();
      if (db) void writeAccountPref(db, PREF_SORT, sort);
    },
    async setHidden(id, hidden) {
      const db = activeLibrary();
      if (!db || id === ALL || id === FAVORITES) return;
      await setCategoryHidden(db, kind, id, hidden);
      const next = new Set(index.hidden);
      if (hidden) next.add(id);
      else next.delete(id);
      index = { ...index, hidden: next };
      refresh();
    },
    openWith(view) {
      if (get().status !== "ready") {
        pending = view;
        return;
      }
      this.selectCategory(view.categoryId);
      this.setSort(view.sort);
    },
    injectSynthetic(count) {
      const items = new Map<number, PosterItem>();
      for (let i = 1; i <= count; i++) {
        items.set(i, {
          id: i,
          name: `Synthetic ${i}`,
          title: `Synthetic ${i}`,
          year: 2000 + (i % 26),
          image: null,
          rating: (i % 100) / 10,
          addedAt: i,
          genre: null,
          ext: "mp4",
        });
      }
      index = { ...index, order: [...items.keys()], hidden: new Set() };
      refresh({ items, categoryId: ALL, accountId: null, status: "ready" });
    },
  };
}

export function posterFromVod(v: {
  id: number;
  name: string;
  icon: string | null;
  rating: number | null;
  addedAt: number | null;
  ext: string;
}): PosterItem {
  const { title, year } = splitTitleYear(v.name);
  return {
    id: v.id,
    name: v.name,
    title,
    year,
    image: v.icon,
    rating: v.rating,
    addedAt: v.addedAt,
    genre: null,
    ext: v.ext,
  };
}

export function posterFromSeries(s: {
  id: number;
  name: string;
  cover: string | null;
  genre: string | null;
  releaseDate: string | null;
  rating: number | null;
  addedAt: number | null;
}): PosterItem {
  const { title, year } = splitTitleYear(s.name);
  return {
    id: s.id,
    name: s.name,
    title,
    year: yearOf(s.releaseDate) ?? year,
    image: s.cover,
    rating: s.rating,
    addedAt: s.addedAt,
    genre: s.genre,
    ext: null,
  };
}

export const movies = createCatalog("vod");
export const series = createCatalog("series");
