import { describe, expect, it } from "vitest";
import { HttpError } from "../../src/adapters";
import { readCategories, readCounts, readSyncState } from "../../src/storage/library";
import { migrate } from "../../src/storage/migrate";
import { accountMigrations } from "../../src/storage/migrations";
import { syncLibrary, type SyncEvent } from "../../src/sync/syncLibrary";
import { XtreamClient } from "../../src/xtream/client";
import { creds, fakeHttp, fixture } from "../helpers";
import { memoryDb } from "../sqlite";

const recorded = {
  get_live_categories: fixture("live-categories.json"),
  get_vod_categories: fixture("vod-categories.json"),
  get_series_categories: fixture("series-categories.json"),
  get_live_streams: fixture("live-streams.json"),
  get_vod_streams: fixture("vod-streams.json"),
  get_series: fixture("series.json"),
};

async function setup(responses: Record<string, unknown> = recorded) {
  const db = memoryDb();
  await migrate(db, accountMigrations);
  const { http, urls } = fakeHttp(responses);
  return { db, urls, client: new XtreamClient(http, creds) };
}

describe("syncLibrary", () => {
  it("syncs categories, live, movies and series in order, with progress", async () => {
    const { db, client } = await setup();
    const events: SyncEvent[] = [];
    const result = await syncLibrary(client, db, {
      onProgress: (e) => events.push(e),
      now: () => 1000,
    });

    expect(result.counts).toEqual({
      categories: 60,
      live: (recorded.get_live_streams as unknown[]).length,
      vod: (recorded.get_vod_streams as unknown[]).length,
      series: (recorded.get_series as unknown[]).length,
    });
    expect(await readCounts(db)).toEqual({
      live: result.counts.live,
      vod: result.counts.vod,
      series: result.counts.series,
    });
    expect((await readCategories(db, "vod")).length).toBe(20);
    expect(events.filter((e) => e.phase === "done").map((e) => e.step)).toEqual([
      "categories",
      "live",
      "vod",
      "series",
    ]);
    expect(events.map((e) => `${e.step}:${e.phase}`).slice(0, 3)).toEqual([
      "categories:fetching",
      "categories:saving",
      "categories:done",
    ]);
    expect(await readSyncState(db)).toContainEqual({
      list: "live",
      syncedAt: 1000,
      count: result.counts.live,
      skipped: 0,
    });
  });

  it("counts skipped items and keeps the good ones", async () => {
    const { db, client } = await setup({
      ...recorded,
      get_live_streams: [{ stream_id: 1, name: "ok" }, { name: "no id" }],
    });
    const result = await syncLibrary(client, db);
    expect(result.counts.live).toBe(1);
    expect(result.skipped.live).toBe(1);
  });

  it("keeps finished steps and the old lists when a later step fails", async () => {
    const { db, client } = await setup();
    await syncLibrary(client, db);
    const before = await readCounts(db);

    // Same database, a provider whose movie list fails this time.
    const { http } = fakeHttp({
      ...recorded,
      get_live_streams: [{ stream_id: 1 }],
      get_vod_streams: () => {
        throw new HttpError("network", "connection reset");
      },
    });
    const client2 = new XtreamClient(http, creds);
    await expect(syncLibrary(client2, db)).rejects.toMatchObject({ kind: "unreachable" });
    // Live was replaced (its step finished); movies and series are still the old lists.
    expect(await readCounts(db)).toEqual({ live: 1, vod: before.vod, series: before.series });
  });

  it("stops between steps when cancelled", async () => {
    const { db, client } = await setup();
    const controller = new AbortController();
    const done: string[] = [];
    await expect(
      syncLibrary(client, db, {
        signal: controller.signal,
        onProgress: (e) => {
          if (e.phase === "done") done.push(e.step);
          if (e.step === "live" && e.phase === "done") controller.abort();
        },
      }),
    ).rejects.toMatchObject({ kind: "aborted" });
    expect(done).toEqual(["categories", "live"]);
  });
});
