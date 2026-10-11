/**
 * Library sync (ROADMAP M2, SPEC "Data and sync"): categories, then live,
 * then movies, then series. Each step downloads its list, parses it in slices
 * (one bad item never fails the list) and replaces the stored list in a single
 * transaction, so screens see either the old list or the new one. Live TV is
 * usable as soon as the live step is done, while movies and series continue.
 */

import type { SqlAdapter } from "../adapters";
import {
  recordSync,
  replaceCategories,
  replaceLive,
  replaceSeries,
  replaceVod,
} from "../storage/library";
import type { XtreamClient } from "../xtream/client";
import { XtreamError } from "../xtream/errors";

export type SyncStep = "categories" | "live" | "vod" | "series";
export const SYNC_STEPS: readonly SyncStep[] = ["categories", "live", "vod", "series"];

export type SyncEvent =
  | { step: SyncStep; phase: "fetching" }
  | { step: SyncStep; phase: "saving"; count: number }
  | { step: SyncStep; phase: "done"; count: number; skipped: number };

export interface SyncOptions {
  onProgress?: (event: SyncEvent) => void;
  signal?: AbortSignal;
  now?: () => number;
}

export interface SyncResult {
  counts: Record<SyncStep, number>;
  skipped: Record<SyncStep, number>;
  finishedAt: number;
}

export async function syncLibrary(
  client: XtreamClient,
  db: SqlAdapter,
  { onProgress, signal, now = Date.now }: SyncOptions = {},
): Promise<SyncResult> {
  const counts: Record<SyncStep, number> = { categories: 0, live: 0, vod: 0, series: 0 };
  const skipped: Record<SyncStep, number> = { categories: 0, live: 0, vod: 0, series: 0 };
  const checkAborted = () => {
    if (signal?.aborted) throw new XtreamError("aborted", "Sync cancelled");
  };

  async function step<T>(
    name: SyncStep,
    fetch: () => Promise<{ items: T[]; skipped: number }>,
    save: (tx: Parameters<Parameters<SqlAdapter["transaction"]>[0]>[0], items: T[]) => void,
  ) {
    checkAborted();
    onProgress?.({ step: name, phase: "fetching" });
    const list = await fetch();
    checkAborted();
    onProgress?.({ step: name, phase: "saving", count: list.items.length });
    const at = now();
    await db.transaction(async (tx) => {
      save(tx, list.items);
      recordSync(tx, name, list.items.length, list.skipped, at);
    });
    counts[name] = list.items.length;
    skipped[name] = list.skipped;
    onProgress?.({ step: name, phase: "done", count: list.items.length, skipped: list.skipped });
  }

  await step(
    "categories",
    async () => {
      const [live, vod, series] = await Promise.all([
        client.categories("live", signal),
        client.categories("vod", signal),
        client.categories("series", signal),
      ]);
      return {
        items: [
          ...live.items.map((c) => ({ kind: "live" as const, c })),
          ...vod.items.map((c) => ({ kind: "vod" as const, c })),
          ...series.items.map((c) => ({ kind: "series" as const, c })),
        ],
        skipped: live.skipped + vod.skipped + series.skipped,
      };
    },
    (tx, items) => {
      for (const kind of ["live", "vod", "series"] as const) {
        replaceCategories(
          tx,
          kind,
          items.filter((i) => i.kind === kind).map((i) => i.c),
        );
      }
    },
  );
  await step("live", () => client.liveStreams(signal), replaceLive);
  await step("vod", () => client.vodStreams(signal), replaceVod);
  await step("series", () => client.series(signal), replaceSeries);

  return { counts, skipped, finishedAt: now() };
}
