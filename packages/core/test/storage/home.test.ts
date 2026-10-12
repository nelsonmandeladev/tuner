import { describe, expect, it } from "vitest";
import {
  replaceCategories,
  replaceLive,
  replaceSeries,
  replaceVod,
} from "../../src/storage/library";
import {
  readHiddenCategories,
  readLiveChannelsByIds,
  readRecentChannels,
  setCategoryHidden,
} from "../../src/storage/live";
import { migrate } from "../../src/storage/migrate";
import { accountMigrations } from "../../src/storage/migrations";
import {
  readEpisodes,
  readInProgress,
  readRecentSeries,
  readRecentVod,
  recordHistory,
  replaceEpisodes,
  writeResume,
} from "../../src/storage/vod";
import type { Episode, LiveStream, Series, VodStream } from "../../src/xtream/schemas";
import { memoryDb } from "../sqlite";

const channel = (id: number): LiveStream => ({
  id,
  num: id,
  name: `Channel ${id}`,
  icon: null,
  epgChannelId: null,
  addedAt: null,
  categoryId: "c",
  tvArchive: false,
  tvArchiveDays: 0,
});
const movie = (id: number, addedAt: number | null, categoryId = "m1"): VodStream => ({
  id,
  num: id,
  name: `Movie ${id}`,
  icon: null,
  rating: null,
  addedAt,
  categoryId,
  ext: "mkv",
});
const show = (id: number, lastModifiedAt: number): Series => ({
  id,
  num: id,
  name: `Show ${id}`,
  cover: `http://img.example/${id}.jpg`,
  plot: null,
  cast: null,
  director: null,
  genre: null,
  releaseDate: null,
  lastModifiedAt,
  rating: null,
  backdrop: null,
  episodeRunTime: null,
  categoryId: "s1",
});
const episode = (id: number, season: number, episodeNum: number): Episode => ({
  id,
  season,
  episodeNum,
  title: `Episode ${id}`,
  ext: "mp4",
  durationSecs: 2400,
  image: null,
  plot: null,
  rating: null,
  releaseDate: null,
});
const point = (positionSecs: number, updatedAt: number, watched = false) => ({
  positionSecs,
  durationSecs: 3000,
  watched,
  updatedAt,
});

async function library() {
  const db = memoryDb();
  await migrate(db, accountMigrations);
  await db.transaction(async (tx) => {
    replaceCategories(tx, "vod", [
      { id: "m1", name: "Drama", parentId: null },
      { id: "m2", name: "Other", parentId: null },
    ]);
    replaceLive(tx, [channel(1), channel(2), channel(3)]);
    replaceVod(tx, [movie(10, 100), movie(11, 300, "m2"), movie(12, 200), movie(13, null)]);
    replaceSeries(tx, [show(20, 50), show(21, 70)]);
  });
  return db;
}

describe("home reads", () => {
  it("reads channels by id in the order given, skipping unknown ids", async () => {
    const db = await library();
    const channels = await readLiveChannelsByIds(db, [3, 99, 1]);
    expect(channels.map((c) => c.id)).toEqual([3, 1]);
    expect(await readLiveChannelsByIds(db, [])).toEqual([]);
  });

  it("lists recently watched channels, newest first", async () => {
    const db = await library();
    await recordHistory(db, "live", 1, 10);
    await recordHistory(db, "live", 2, 30);
    await recordHistory(db, "live", 99, 40); // no longer in the library
    await recordHistory(db, "vod", 10, 50);
    await recordHistory(db, "live", 1, 60); // watched again
    expect((await readRecentChannels(db, 5)).map((c) => c.id)).toEqual([1, 2]);
    expect((await readRecentChannels(db, 1)).map((c) => c.id)).toEqual([1]);
  });

  it("lists recently added movies and series outside hidden categories", async () => {
    const db = await library();
    expect((await readRecentVod(db, 10)).map((m) => m.id)).toEqual([11, 12, 10]);
    expect((await readRecentVod(db, 2)).map((m) => m.id)).toEqual([11, 12]);
    await setCategoryHidden(db, "vod", "m2", true);
    expect((await readRecentVod(db, 10)).map((m) => m.id)).toEqual([12, 10]);
    expect(await readHiddenCategories(db)).toEqual(["vod:m2"]);
    expect((await readRecentSeries(db, 10)).map((s) => s.id)).toEqual([21, 20]);
  });

  it("lists movies and episodes in progress, one per series, newest first", async () => {
    const db = await library();
    await replaceEpisodes(db, 20, [episode(200, 1, 1), episode(201, 1, 2)]);
    await replaceEpisodes(db, 21, [episode(210, 1, 1)]);
    expect(await readEpisodes(db, 20)).toHaveLength(2);
    expect((await readEpisodes(db, 20)).find((e) => e.id === 201)).toEqual(episode(201, 1, 2));

    await writeResume(db, "vod", 10, point(600, 1000));
    await writeResume(db, "vod", 12, point(2900, 5000, true)); // watched
    await writeResume(db, "vod", 11, point(5, 6000)); // too early to resume
    await writeResume(db, "episode", 200, point(900, 2000));
    await writeResume(db, "episode", 201, point(300, 3000)); // same series, later
    await writeResume(db, "episode", 210, point(100, 500));
    await writeResume(db, "episode", 999, point(100, 7000)); // series page never opened

    const items = await readInProgress(db, 10);
    expect(items.map((i) => `${i.kind}:${i.id}`)).toEqual(["episode:201", "vod:10", "episode:210"]);
    const first = items[0]!;
    expect(first.kind === "episode" && first.series).toEqual({
      id: 20,
      name: "Show 20",
      cover: "http://img.example/20.jpg",
      backdrop: null,
    });
    expect(first.point).toEqual(point(300, 3000));
    expect((await readInProgress(db, 1)).map((i) => i.id)).toEqual([201]);
  });

  it("returns nothing for a fresh account", async () => {
    const db = await library();
    expect(await readInProgress(db, 10)).toEqual([]);
    expect(await readRecentChannels(db, 10)).toEqual([]);
  });
});
