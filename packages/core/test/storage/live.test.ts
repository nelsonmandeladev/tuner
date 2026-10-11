import { describe, expect, it } from "vitest";
import { readCategories, replaceCategories, replaceLive } from "../../src/storage/library";
import {
  readAccountPref,
  readEpgCache,
  readFavorites,
  readLiveChannels,
  readMemberships,
  setCategoryHidden,
  setFavorite,
  writeAccountPref,
  writeEpgCache,
} from "../../src/storage/live";
import { migrate } from "../../src/storage/migrate";
import { accountMigrations } from "../../src/storage/migrations";
import type { LiveStream } from "../../src/xtream/schemas";
import { memoryDb } from "../sqlite";

function stream(id: number, categoryId: string, extra: Partial<LiveStream> = {}): LiveStream {
  return {
    id,
    num: id * 10,
    name: `Channel ${id}`,
    icon: null,
    epgChannelId: null,
    addedAt: null,
    categoryId,
    tvArchive: false,
    tvArchiveDays: 0,
    ...extra,
  };
}

async function library() {
  const db = memoryDb();
  await migrate(db, accountMigrations);
  await db.transaction(async (tx) => {
    replaceCategories(tx, "live", [
      { id: "a", name: "A", parentId: null },
      { id: "b", name: "B", parentId: null },
    ]);
    replaceLive(tx, [
      stream(3, "a", { tvArchive: true, tvArchiveDays: 3, epgChannelId: "three.example" }),
      stream(1, "a"),
      stream(2, "b"),
      stream(3, "b"),
    ]);
  });
  return db;
}

describe("live storage", () => {
  it("reads channels once each, in provider order", async () => {
    const db = await library();
    const channels = await readLiveChannels(db);
    expect(channels.map((c) => c.id)).toEqual([3, 1, 2]);
    expect(channels[0]).toEqual({
      id: 3,
      num: 30,
      name: "Channel 3",
      icon: null,
      epgChannelId: "three.example",
      tvArchive: true,
      tvArchiveDays: 3,
    });
  });

  it("reads memberships per category in order", async () => {
    const db = await library();
    const byCategory = await readMemberships(db, "live");
    expect(byCategory.get("a")).toEqual([3, 1]);
    expect(byCategory.get("b")).toEqual([2, 3]);
  });

  it("keeps favorites in the order they were added and removes them", async () => {
    const db = await library();
    await setFavorite(db, "live", 2, true, 200);
    await setFavorite(db, "live", 3, true, 100);
    await setFavorite(db, "live", 3, true, 300);
    expect(await readFavorites(db, "live")).toEqual([3, 2]);
    await setFavorite(db, "live", 3, false, 400);
    expect(await readFavorites(db, "live")).toEqual([2]);
    expect(await readFavorites(db, "vod")).toEqual([]);
  });

  it("hides and unhides categories", async () => {
    const db = await library();
    await setCategoryHidden(db, "live", "b", true);
    await setCategoryHidden(db, "live", "b", true);
    expect((await readCategories(db, "live")).map((c) => [c.id, c.hidden])).toEqual([
      ["a", false],
      ["b", true],
    ]);
    await setCategoryHidden(db, "live", "b", false);
    expect((await readCategories(db, "live")).every((c) => !c.hidden)).toBe(true);
  });

  it("caches schedules and serves only fresh ones", async () => {
    const db = await library();
    const programmes = [{ title: "News", start: 1, end: 2, hasArchive: false }];
    await writeEpgCache(db, 3, programmes, 1000);
    await writeEpgCache(db, 1, [], 500);
    const fresh = await readEpgCache(db, [1, 3, 9], 800);
    expect([...fresh.keys()]).toEqual([3]);
    expect(fresh.get(3)).toEqual(programmes);
    expect((await readEpgCache(db, [], 0)).size).toBe(0);
  });

  it("stores per-account preferences as JSON", async () => {
    const db = await library();
    expect(await readAccountPref(db, "epg.source", "short")).toBe("short");
    await writeAccountPref(db, "epg.source", "table");
    expect(await readAccountPref(db, "epg.source", "short")).toBe("table");
    await db.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('bad', '{')");
    expect(await readAccountPref(db, "bad", 1)).toBe(1);
  });
});
