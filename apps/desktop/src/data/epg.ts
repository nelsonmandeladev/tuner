/**
 * Now/next schedules for the channels on screen (SPEC §4, ROADMAP M3).
 *
 * Screens say which channels they show (`wantEpg`); only those are fetched,
 * fresh ones (15 min) come from the epg_cache table, and channels without a
 * guide id never cost a request. Requests run a few at a time, newest wish
 * first, and a channel that scrolled away before its turn is dropped.
 */

import {
  EPG_FRESH_MS,
  fetchSchedule,
  readAccountPref,
  readEpgCache,
  writeAccountPref,
  writeEpgCache,
  type EpgSource,
  type LiveChannel,
  type Programme,
} from "@tuner/core";
import { useEffect, useState } from "react";
import { create } from "zustand";
import { useLive } from "./live";
import { activeClient, activeLibrary, useSession } from "./session";

interface EpgState {
  /** Schedules by stream id: [] for a channel with no guide data. */
  schedules: Map<number, Programme[]>;
  /** Requests made to the provider in this run (dev measurements). */
  fetches: number;
  source: EpgSource | null;
}

export const useEpg = create<EpgState>(() => ({ schedules: new Map(), fetches: 0, source: null }));

const CONCURRENCY = 3;
const PREF_SOURCE = "epg.source";

/** Each caller (the list, the preview, the player) owns one set of wanted ids. */
const wanted = new Map<string, Set<number>>();
const fetchedAt = new Map<number, number>();
const queue: number[] = [];
const inFlight = new Set<number>();
let running = 0;
let sourcePromise: Promise<EpgSource> | null = null;
let sourceAccount: string | null = null;
/** Guide ids of channels read without the whole Live TV list (Home's cards). */
const knownGuides = new Map<number, string | null>();

/** Tells the EPG about channels a screen read itself, so it knows which have a guide. */
export function knowChannels(channels: readonly LiveChannel[]) {
  for (const channel of channels) knownGuides.set(channel.id, channel.epgChannelId);
}

function guideOf(id: number): string | null {
  return useLive.getState().channels.get(id)?.epgChannelId ?? knownGuides.get(id) ?? null;
}

function isWanted(id: number) {
  for (const ids of wanted.values()) if (ids.has(id)) return true;
  return false;
}

function source(): Promise<EpgSource> {
  const account = useSession.getState().active?.id ?? null;
  if (account !== sourceAccount || !sourcePromise) {
    sourceAccount = account;
    const db = activeLibrary();
    sourcePromise = db
      ? readAccountPref<EpgSource>(db, PREF_SOURCE, "short")
      : Promise.resolve("short");
  }
  return sourcePromise;
}

function store(entries: Map<number, Programme[]>, at: number) {
  if (entries.size === 0) return;
  for (const id of entries.keys()) fetchedAt.set(id, at);
  useEpg.setState((s) => {
    const schedules = new Map(s.schedules);
    for (const [id, programmes] of entries) schedules.set(id, programmes);
    return { schedules };
  });
}

/**
 * Declares the channels `owner` shows. Missing or stale schedules are read
 * from the cache, then fetched. Pass [] to withdraw.
 */
export function wantEpg(owner: string, ids: readonly number[]) {
  wanted.set(owner, new Set(ids));
  void request(ids);
}

async function request(ids: readonly number[]) {
  const now = Date.now();
  const stale = ids.filter(
    (id) => !inFlight.has(id) && now - (fetchedAt.get(id) ?? 0) > EPG_FRESH_MS,
  );
  if (stale.length === 0) return;

  // No guide id: the provider has nothing for it (checked in M3: both calls return []).
  const noGuide = new Map<number, Programme[]>();
  const candidates: number[] = [];
  for (const id of stale) {
    if (guideOf(id)) candidates.push(id);
    else noGuide.set(id, []);
  }
  store(noGuide, now);

  const db = activeLibrary();
  if (db && candidates.length > 0) {
    const cached = await readEpgCache(db, candidates, now - EPG_FRESH_MS);
    store(cached, now);
    for (const id of candidates) if (!cached.has(id) && !queue.includes(id)) queue.unshift(id);
  }
  pump();
}

function pump() {
  while (running < CONCURRENCY && queue.length > 0) {
    const id = queue.shift()!;
    if (!isWanted(id) || inFlight.has(id)) continue;
    running++;
    inFlight.add(id);
    void fetchOne(id).finally(() => {
      running--;
      inFlight.delete(id);
      pump();
    });
  }
}

async function fetchOne(id: number) {
  const client = await activeClient();
  const db = activeLibrary();
  if (!client || !db) return;
  const now = Date.now();
  try {
    const current = await source();
    const result = await fetchSchedule(client, id, current, now);
    useEpg.setState((s) => ({ fetches: s.fetches + 1, source: result.source }));
    if (result.source !== current) {
      sourcePromise = Promise.resolve(result.source);
      void writeAccountPref(db, PREF_SOURCE, result.source);
    }
    store(new Map([[id, result.programmes]]), now);
    await writeEpgCache(db, id, result.programmes, now);
  } catch {
    // Offline or a provider hiccup: the row shows no programme and is asked again next time.
  }
}

/** One channel's schedule, or undefined while it loads. */
export function useSchedule(id: number | null | undefined): Programme[] | undefined {
  return useEpg((s) => (id === null || id === undefined ? undefined : s.schedules.get(id)));
}

/** The current time, updated every `intervalMs` (progress bars, "38m left"). */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

/** Forgets in-memory schedules (e.g. after switching accounts). */
export function resetEpg() {
  wanted.clear();
  fetchedAt.clear();
  knownGuides.clear();
  queue.length = 0;
  sourcePromise = null;
  useEpg.setState({ schedules: new Map(), source: null });
}
