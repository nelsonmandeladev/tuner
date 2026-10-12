/**
 * Home (SPEC §2, design/screens/Main.dc.html): what is in progress (the hero
 * and Continue watching), favorite and recently watched channels, and what was
 * added recently. A few small reads from the account's library, run on every
 * visit so Home follows what was just watched; the previous answer stays on
 * screen while they run.
 */

import {
  readDetail,
  readEpisodes,
  readInProgress,
  readLiveChannelsByIds,
  readRecentChannels,
  readRecentSeries,
  readRecentVod,
  resumeFrom,
  sortEpisodes,
  splitTitleYear,
  type InProgress,
  type LiveChannel,
  type VodInfo,
} from "@tuner/core";
import { create } from "zustand";
import type { PlayVodOptions, VodMedia } from "../player/tuner";
import { episodeMedia } from "../player/vodSession";
import { posterFromSeries, posterFromVod, type PosterItem } from "./catalog";
import { knowChannels } from "./epg";
import { loadFavorites, useFavorites } from "./favorites";
import { activeLibrary, useSession } from "./session";

/** Cards per row in the mockup: five channels, six posters. */
export const CHANNELS_PER_ROW = 5;
export const POSTERS_PER_ROW = 6;
/** Favorite channels in Home's carousel: rows over ~100 items would need virtualising (CLAUDE.md rule 10). */
const FAVORITES_ON_HOME = 100;

export interface HomeHero {
  item: InProgress;
  /** Backdrop: the series' own, or the movie's from its cached details. */
  backdrop: string | null;
  /** A movie's year or genre line from its cached details, when known. */
  genre: string | null;
}

export interface HomeState {
  status: "idle" | "loading" | "ready" | "error";
  accountId: string | null;
  hero: HomeHero | null;
  /** In progress after the hero, newest first. */
  continueWatching: InProgress[];
  favoriteChannels: LiveChannel[];
  recentChannels: LiveChannel[];
  recentMovies: PosterItem[];
  recentSeries: PosterItem[];
  /** Dev measurements: how long the last load took, and when Home first painted with data. */
  loadMs: number | null;
  paintedAt: number | null;
}

export const useHome = create<HomeState>(() => ({
  status: "idle",
  accountId: null,
  hero: null,
  continueWatching: [],
  favoriteChannels: [],
  recentChannels: [],
  recentMovies: [],
  recentSeries: [],
  loadMs: null,
  paintedAt: null,
}));

const set = useHome.setState;
let loading: Promise<void> | null = null;

/** Reads (or re-reads) everything Home shows for the active account. */
export function loadHome(): Promise<void> {
  loading ??= read().finally(() => {
    loading = null;
  });
  return loading;
}

async function read() {
  const { active } = useSession.getState();
  const db = activeLibrary();
  if (!active || !db) return;
  const t0 = performance.now();
  if (useHome.getState().accountId !== active.id) set({ status: "loading" });
  try {
    await loadFavorites();
    const favoriteIds = useFavorites.getState().live.slice(0, FAVORITES_ON_HOME);
    const [inProgress, favoriteChannels, recentChannels, recentVod, recentSeries] =
      await Promise.all([
        readInProgress(db, POSTERS_PER_ROW + 1),
        readLiveChannelsByIds(db, favoriteIds),
        readRecentChannels(db, CHANNELS_PER_ROW),
        readRecentVod(db, POSTERS_PER_ROW),
        readRecentSeries(db, POSTERS_PER_ROW),
      ]);
    const first = inProgress[0];
    let hero: HomeHero | null = null;
    if (first?.kind === "episode") {
      hero = { item: first, backdrop: first.series.backdrop, genre: null };
    } else if (first) {
      const info = (await readDetail<VodInfo>(db, "vod", first.id))?.value ?? null;
      hero = { item: first, backdrop: info?.backdrop ?? null, genre: info?.genre ?? null };
    }
    knowChannels([...favoriteChannels, ...recentChannels]);
    set({
      status: "ready",
      accountId: active.id,
      hero,
      continueWatching: inProgress.slice(1),
      favoriteChannels,
      recentChannels,
      recentMovies: recentVod.map(posterFromVod),
      recentSeries: recentSeries.map(posterFromSeries),
      loadMs: Math.round(performance.now() - t0),
    });
  } catch {
    set({ status: "error" });
  }
}

/** Favorites change from any screen: Home's row follows without a full reload. */
useFavorites.subscribe((state, prev) => {
  if (state.live !== prev.live && useHome.getState().status === "ready") void loadHome();
});

/**
 * What Resume plays for an item in progress: the movie, or the episode with
 * its series' stored episodes (for the next-episode countdown), from where
 * it was left. Back from the player returns to Home.
 */
export async function resumeTarget(
  item: InProgress,
): Promise<{ media: VodMedia; options: PlayVodOptions }> {
  const options = { start: resumeFrom(item.point), returnTo: "/" };
  if (item.kind === "vod") {
    const { title, year } = splitTitleYear(item.movie.name);
    return {
      media: {
        kind: "vod",
        id: item.id,
        ext: item.movie.ext,
        title,
        detail: year ? String(year) : "",
        series: null,
      },
      options,
    };
  }
  const db = activeLibrary();
  const episodes = db ? sortEpisodes(await readEpisodes(db, item.series.id)) : [item.episode];
  const series = {
    id: item.series.id,
    name: splitTitleYear(item.series.name).title,
    episodes: episodes.length > 0 ? episodes : [item.episode],
  };
  return { media: episodeMedia(series, item.episode), options };
}

/** Records the first paint with data (cold start → Home, a SPEC "Quality bar" target). */
export function markHomePainted() {
  if (useHome.getState().paintedAt === null) set({ paintedAt: performance.now() });
}

/** Dev measurements only: shows Home as a fresh account sees it (nothing watched or liked). */
export function injectFreshAccount() {
  set({ hero: null, continueWatching: [], favoriteChannels: [], recentChannels: [] });
}
