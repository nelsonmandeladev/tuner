/**
 * Live TV data for the screen and the player (ROADMAP M3): every channel,
 * categories with counts, favorites and hidden categories, read once from the
 * account's library into memory. Category switches, filtering and zapping then
 * run on arrays in memory (a few ms on 20,000 channels), never on the provider
 * (CLAUDE.md rule 6).
 */

import {
  foldText,
  readAccountPref,
  readCategories,
  readLiveChannels,
  readMemberships,
  setCategoryHidden,
  writeAccountPref,
  type CategoryWithCount,
  type LiveChannel,
} from "@tuner/core";
import { create } from "zustand";
import type { CategoryView } from "./categoryView";
import { loadFavorites, toggleFavorite as toggleFavoriteOf, useFavorites } from "./favorites";
import { activeLibrary, useSession } from "./session";

/** Built-in categories above the provider's own (LiveTV.dc.html). */
export const FAVORITES = "fav";
export const ALL_CHANNELS = "all";

export type { CategoryView } from "./categoryView";

export interface LiveState {
  status: "idle" | "loading" | "ready" | "error";
  /** Which account the data belongs to. */
  accountId: string | null;
  /** The session's `libraryVersion` the data was read at (a sync replaces lists). */
  version: number;
  /** How long the last load took (dev measurements). */
  loadMs: number | null;
  channels: Map<number, LiveChannel>;
  /** Built-in and visible provider categories, in display order. */
  categories: CategoryView[];
  hiddenCategories: CategoryView[];
  favorites: number[];
  categoryId: string;
  filter: string;
  /** The channels of the current category after the filter: what the list shows and zapping walks. */
  list: number[];
  selectedId: number | null;
  /** A channel chosen elsewhere (search) for Live TV to tune when it opens. */
  reveal: number | null;
}

interface Index {
  order: number[];
  memberships: Map<string, number[]>;
  /** Category ids each channel is listed in. */
  categoriesOf: Map<number, string[]>;
  folded: Map<number, string>;
  providerCategories: CategoryWithCount[];
  hidden: Set<string>;
}

const empty: Index = {
  order: [],
  memberships: new Map(),
  categoriesOf: new Map(),
  folded: new Map(),
  providerCategories: [],
  hidden: new Set(),
};
let index: Index = empty;

export const useLive = create<LiveState>(() => ({
  status: "idle",
  accountId: null,
  version: -1,
  loadMs: null,
  channels: new Map(),
  categories: [],
  hiddenCategories: [],
  favorites: [],
  categoryId: ALL_CHANNELS,
  filter: "",
  list: [],
  selectedId: null,
  reveal: null,
}));

const set = useLive.setState;
const get = useLive.getState;
const PREF_CATEGORY = "live.category";
const PREF_CHANNEL = "live.channel";

/** Visible channels: those listed in at least one category that is not hidden. */
function allVisible(): number[] {
  if (index.hidden.size === 0) return index.order;
  return index.order.filter((id) =>
    (index.categoriesOf.get(id) ?? []).some((c) => !index.hidden.has(c)),
  );
}

function idsOf(categoryId: string): number[] {
  if (categoryId === FAVORITES) return get().favorites.filter((id) => get().channels.has(id));
  if (categoryId === ALL_CHANNELS) return allVisible();
  return index.memberships.get(categoryId) ?? [];
}

function applyFilter(ids: number[], filter: string): number[] {
  const query = foldText(filter);
  if (query === "") return ids;
  const digits = /^\d+$/.test(query);
  const channels = get().channels;
  return ids.filter(
    (id) =>
      (index.folded.get(id) ?? "").includes(query) ||
      (digits && String(channels.get(id)?.num ?? "").startsWith(query)),
  );
}

function categoryViews() {
  const { favorites } = get();
  const builtIn: CategoryView[] = [
    { id: FAVORITES, name: "Favorites", count: favorites.length, hidden: false, builtIn: true },
    {
      id: ALL_CHANNELS,
      name: "All channels",
      count: allVisible().length,
      hidden: false,
      builtIn: true,
    },
  ];
  const provider = index.providerCategories
    .filter((c) => c.count > 0)
    .map((c) => ({ ...c, hidden: index.hidden.has(c.id), builtIn: false }));
  return {
    categories: [...builtIn, ...provider.filter((c) => !c.hidden)],
    hiddenCategories: provider.filter((c) => c.hidden),
  };
}

/** Recomputes the shown list (and keeps the category valid). */
function refreshList(patch: Partial<LiveState> = {}) {
  set(patch);
  const state = get();
  const views = categoryViews();
  const categoryId = [...views.categories].some((c) => c.id === state.categoryId)
    ? state.categoryId
    : ALL_CHANNELS;
  set({ ...views, categoryId, list: applyFilter(idsOf(categoryId), state.filter) });
}

let loading: Promise<void> | null = null;

/**
 * Loads the active account's live data: once per account, and again after a
 * sync replaced the list. A reload for the same account keeps the list on
 * screen, the category, the filter and the selection while it reads.
 */
export function loadLive(): Promise<void> {
  const { active, libraryVersion } = useSession.getState();
  const db = activeLibrary();
  if (!active || !db) return Promise.resolve();
  const sameAccount = get().accountId === active.id && get().status === "ready";
  if (sameAccount && get().version === libraryVersion) return Promise.resolve();
  loading ??= (async () => {
    const t0 = performance.now();
    if (!sameAccount) set({ status: "loading" });
    try {
      const [channelRows, memberships, categories, , categoryId, channelId] = await Promise.all([
        readLiveChannels(db),
        readMemberships(db, "live"),
        readCategories(db, "live"),
        loadFavorites(),
        readAccountPref<string>(db, PREF_CATEGORY, ALL_CHANNELS),
        readAccountPref<number | null>(db, PREF_CHANNEL, null),
      ]);
      const favorites = useFavorites.getState().live;
      const channels = new Map(channelRows.map((c) => [c.id, c]));
      const categoriesOf = new Map<number, string[]>();
      for (const [category, ids] of memberships) {
        for (const id of ids) {
          const list = categoriesOf.get(id);
          if (list) list.push(category);
          else categoriesOf.set(id, [category]);
        }
      }
      index = {
        order: channelRows.map((c) => c.id),
        memberships,
        categoriesOf,
        folded: new Map(channelRows.map((c) => [c.id, foldText(c.name)])),
        providerCategories: categories,
        hidden: new Set(categories.filter((c) => c.hidden).map((c) => c.id)),
      };
      const keep = sameAccount ? get() : null;
      const selected = keep ? keep.selectedId : channelId;
      refreshList({
        accountId: active.id,
        version: libraryVersion,
        channels,
        favorites,
        categoryId: keep ? keep.categoryId : categoryId,
        filter: keep ? keep.filter : "",
        selectedId: selected !== null && channels.has(selected) ? selected : null,
      });
      const { list, selectedId } = get();
      set({
        status: "ready",
        selectedId: selectedId ?? list[0] ?? null,
        loadMs: Math.round(performance.now() - t0),
      });
    } catch {
      set({ status: "error" });
    }
  })().finally(() => {
    loading = null;
  });
  return loading;
}

export function selectCategory(categoryId: string) {
  if (categoryId === get().categoryId) return;
  refreshList({ categoryId, filter: "" });
  const db = activeLibrary();
  if (db) void writeAccountPref(db, PREF_CATEGORY, categoryId);
}

export function setFilter(filter: string) {
  refreshList({ filter });
}

/** Selects a channel in the list (the preview follows it, see LiveTV). */
export function selectChannel(id: number) {
  set({ selectedId: id });
}

/**
 * Selects a channel chosen outside Live TV (search): keeps the category if it
 * lists the channel, else switches to All channels, and asks Live TV to tune
 * it (`reveal`). Returns the list it is in, for zapping.
 */
export function revealChannel(id: number): number[] {
  if (!get().channels.has(id)) return [];
  if (!get().list.includes(id)) refreshList({ categoryId: ALL_CHANNELS, filter: "" });
  if (!get().list.includes(id)) refreshList({ filter: "" });
  set({ selectedId: id, reveal: id });
  return get().list;
}

/** Live TV took the revealed channel. */
export function clearReveal() {
  set({ reveal: null });
}

/** Remembers the last channel watched, for the next visit. */
export function rememberChannel(id: number) {
  const db = activeLibrary();
  if (db) void writeAccountPref(db, PREF_CHANNEL, id);
}

export function toggleFavorite(id: number) {
  return toggleFavoriteOf("live", id);
}

// A heart pressed anywhere (Live TV, Home, search) updates the Favorites category.
useFavorites.subscribe((state, prev) => {
  if (state.live !== prev.live && get().status === "ready") refreshList({ favorites: state.live });
});

export async function setHidden(categoryId: string, hidden: boolean) {
  const db = activeLibrary();
  if (!db || categoryId === FAVORITES || categoryId === ALL_CHANNELS) return;
  await setCategoryHidden(db, "live", categoryId, hidden);
  const next = new Set(index.hidden);
  if (hidden) next.add(categoryId);
  else next.delete(categoryId);
  index = { ...index, hidden: next };
  refreshList();
}

/** The visible categories a channel is listed in, in display order. */
export function categoriesOfChannel(id: number): string[] {
  const of = new Set(index.categoriesOf.get(id) ?? []);
  return get()
    .categories.filter((c) => of.has(c.id))
    .map((c) => c.id);
}

/** Finds a channel by its provider number (number entry). */
export function channelByNumber(num: number): LiveChannel | null {
  for (const channel of get().channels.values()) if (channel.num === num) return channel;
  return null;
}

/** Drops loaded data, e.g. after the active account changes. */
export function resetLive() {
  index = empty;
  set({
    status: "idle",
    accountId: null,
    version: -1,
    channels: new Map(),
    categories: [],
    hiddenCategories: [],
    favorites: [],
    list: [],
    selectedId: null,
    reveal: null,
  });
}

// Another account: drop this one's channels at once, so nothing (a zap, a
// search result) reaches a channel of the old account.
useSession.subscribe((state, prev) => {
  if (state.active?.id !== prev.active?.id && get().accountId !== state.active?.id) resetLive();
});
