/**
 * Now and next for live channels (SPEC §4), and the archive list for
 * catch-up.
 *
 * `get_short_epg` is the cheap call (a few programmes, ~15 KB). Some panels
 * get it wrong: the test provider compares "ends after now" against its own
 * wall clock read as UTC, so with a server two hours ahead of UTC the current
 * programme and the next ones are missing (docs/XTREAM_API.md "Quirks").
 * `get_simple_data_table` lists whole days and is right, but is ~90 KB. So:
 * ask for the short EPG; if it has programmes but none is on now while the
 * table has one, the account's source becomes "table" and the caller keeps
 * using it.
 */

import type { XtreamClient } from "../xtream/client";
import type { EpgEntry } from "../xtream/schemas";

export type EpgSource = "short" | "table";

export interface Programme {
  title: string;
  /** Unix ms. */
  start: number;
  end: number;
  /** The provider keeps a recording (catch-up). */
  hasArchive: boolean;
}

/** How long a channel's schedule stays fresh (SPEC "Data and sync"). */
export const EPG_FRESH_MS = 15 * 60_000;
/** Programmes kept per channel: now, next, and enough "Up next" for the preview. */
export const SCHEDULE_KEEP = 8;
const SHORT_EPG_LIMIT = 6;

const covers = (now: number) => (p: { start: number; end: number }) =>
  p.start <= now && now < p.end;

function toProgramme(e: EpgEntry): Programme {
  return { title: e.title, start: e.start, end: e.end, hasArchive: e.hasArchive };
}

/**
 * Programmes that have not ended, in start order, without exact duplicates,
 * at most `SCHEDULE_KEEP`.
 */
export function tidySchedule(entries: readonly EpgEntry[], now: number): Programme[] {
  const seen = new Set<string>();
  return entries
    .filter((e) => e.end > now && e.end > e.start)
    .sort((a, b) => a.start - b.start || a.end - b.end)
    .filter((e) => {
      const key = `${e.start}|${e.title}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, SCHEDULE_KEEP)
    .map(toProgramme);
}

export interface NowNext {
  now: Programme | null;
  next: Programme | null;
  /** Everything after `now`, `next` included. */
  upcoming: Programme[];
}

/** What is on at `time`, and what follows. */
export function nowNext(programmes: readonly Programme[], time: number): NowNext {
  let current: Programme | null = null;
  for (const p of programmes) if (covers(time)(p)) current = p;
  const upcoming = programmes.filter((p) => p.start > time && p !== current);
  return { now: current, next: upcoming[0] ?? null, upcoming };
}

/** 0–1 through a programme. */
export function progressOf(p: Programme, time: number): number {
  return Math.min(1, Math.max(0, (time - p.start) / (p.end - p.start)));
}

export interface ScheduleResult {
  programmes: Programme[];
  /** The source to use for this account from now on. */
  source: EpgSource;
}

/** One channel's schedule from the provider, falling back to the data table (see above). */
export async function fetchSchedule(
  client: XtreamClient,
  streamId: number,
  source: EpgSource,
  now: number,
  signal?: AbortSignal,
): Promise<ScheduleResult> {
  if (source === "table") {
    const table = await client.simpleDataTable(streamId, signal);
    return { programmes: tidySchedule(table, now), source };
  }
  const short = await client.shortEpg(streamId, SHORT_EPG_LIMIT, signal);
  const startsLater = short.length > 0 && short.every((e) => e.start > now);
  if (!startsLater) return { programmes: tidySchedule(short, now), source };
  const table = await client.simpleDataTable(streamId, signal);
  return table.some(covers(now))
    ? { programmes: tidySchedule(table, now), source: "table" }
    : { programmes: tidySchedule(short, now), source };
}

/**
 * Past programmes the provider recorded, newest first, within the channel's
 * archive window (`tv_archive_duration` days).
 */
export function archivedProgrammes(
  entries: readonly EpgEntry[],
  now: number,
  archiveDays: number,
): Programme[] {
  const oldest = now - Math.max(1, archiveDays) * 86_400_000;
  const seen = new Set<number>();
  return entries
    .filter((e) => e.hasArchive && e.end <= now && e.start >= oldest)
    .sort((a, b) => b.start - a.start)
    .filter((e) => !seen.has(e.start) && (seen.add(e.start), true))
    .map(toProgramme);
}
