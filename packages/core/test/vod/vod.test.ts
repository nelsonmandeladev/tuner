import { describe, expect, it } from "vitest";
import { HttpError } from "../../src/adapters";
import {
  readSeriesItem,
  readVodItem,
  readVodItems,
  readResume,
  replaceEpisodes,
  seriesOfEpisode,
  writeResume,
  readSeriesItems,
  recordHistory,
} from "../../src/storage/vod";
import { replaceSeries, replaceVod } from "../../src/storage/library";
import { migrate } from "../../src/storage/migrate";
import { accountMigrations } from "../../src/storage/migrations";
import { loadSeriesInfo, loadVodInfo, VOD_INFO_FRESH_MS } from "../../src/vod/details";
import {
  episodeToPlay,
  isWatched,
  nextEpisode,
  resumeFrom,
  resumeProgress,
  type ResumePoint,
} from "../../src/vod/resume";
import { sortIds } from "../../src/vod/sort";
import { splitTitleYear, yearOf } from "../../src/vod/title";
import { XtreamClient } from "../../src/xtream/client";
import type { Episode } from "../../src/xtream/schemas";
import { creds, fakeHttp, fixture } from "../helpers";
import { memoryDb } from "../sqlite";

describe("splitTitleYear", () => {
  it.each([
    ["Night Market - 2026", "Night Market", 2026],
    ["Kribi (2024)", "Kribi", 2024],
    ["Blade Runner 2049 - 2017", "Blade Runner 2049", 2017],
    ["Blade Runner 2049", "Blade Runner 2049", null],
    ["1917", "1917", null],
    ["  Offside  ", "Offside", null],
  ])("%s", (name, title, year) => {
    expect(splitTitleYear(name)).toEqual({ title, year });
  });

  it("reads a year from a release date", () => {
    expect(yearOf("2025-03-14")).toBe(2025);
    expect(yearOf("")).toBeNull();
    expect(yearOf(null)).toBeNull();
  });
});

describe("sortIds", () => {
  const items = new Map(
    [
      { id: 1, name: "Écho", addedAt: 300, rating: 6 },
      { id: 2, name: "alpha", addedAt: 100, rating: null },
      { id: 3, name: "Beta 10", addedAt: 300, rating: 9 },
      { id: 4, name: "Beta 9", addedAt: 200, rating: 6 },
    ].map((i) => [i.id, i]),
  );
  const ids = [1, 2, 3, 4, 99];

  it("orders by recent, name (accents and numbers) and rating, keeping ties stable", () => {
    expect(sortIds(ids, items, "recent")).toEqual([1, 3, 4, 2]);
    expect(sortIds(ids, items, "name")).toEqual([2, 4, 3, 1]);
    expect(sortIds(ids, items, "rating")).toEqual([3, 1, 4, 2]);
  });
});

function ep(id: number, season: number, episodeNum: number): Episode {
  return {
    id,
    season,
    episodeNum,
    title: `E${id}`,
    ext: "mkv",
    durationSecs: 1800,
    image: null,
    plot: null,
    rating: null,
    releaseDate: null,
  };
}

const point = (positionSecs: number, updatedAt: number, watched = false): ResumePoint => ({
  positionSecs,
  durationSecs: 1800,
  watched,
  updatedAt,
});

describe("resume", () => {
  it("counts 90% as watched and skips tiny or finished positions", () => {
    expect(isWatched(1620, 1800)).toBe(true);
    expect(isWatched(1619, 1800)).toBe(false);
    expect(isWatched(100, null)).toBe(false);
    expect(resumeFrom(point(20, 1))).toBeNull();
    expect(resumeFrom(point(600, 1))).toBe(600);
    expect(resumeFrom(point(1700, 1, true))).toBeNull();
    expect(resumeProgress(point(900, 1))).toBeCloseTo(0.5);
    expect(resumeProgress(point(900, 1, true))).toBe(1);
  });

  it("finds the next episode across seasons", () => {
    const episodes = [ep(21, 2, 1), ep(12, 1, 2), ep(11, 1, 1)];
    expect(nextEpisode(episodes, 11)?.id).toBe(12);
    expect(nextEpisode(episodes, 12)?.id).toBe(21);
    expect(nextEpisode(episodes, 21)).toBeNull();
    expect(nextEpisode(episodes, 99)).toBeNull();
  });

  it("offers the episode in progress, else the one after the last watched, else the first", () => {
    const episodes = [ep(11, 1, 1), ep(12, 1, 2), ep(13, 1, 3)];
    expect(episodeToPlay(episodes, new Map())).toEqual({ episode: episodes[0], resume: false });
    expect(
      episodeToPlay(
        episodes,
        new Map([
          [11, point(1700, 1, true)],
          [12, point(600, 2)],
        ]),
      ),
    ).toEqual({ episode: episodes[1], resume: true });
    expect(episodeToPlay(episodes, new Map([[12, point(1700, 5, true)]]))).toEqual({
      episode: episodes[2],
      resume: false,
    });
    expect(episodeToPlay([], new Map())).toBeNull();
  });
});

async function library() {
  const db = memoryDb();
  await migrate(db, accountMigrations);
  return db;
}

describe("vod storage", () => {
  it("reads movies and series in provider order", async () => {
    const db = await library();
    await db.transaction(async (tx) => {
      replaceVod(tx, [
        {
          id: 2,
          num: 1,
          name: "B - 2020",
          icon: null,
          rating: 7,
          addedAt: 5,
          categoryId: "c",
          ext: "mkv",
        },
        {
          id: 1,
          num: 2,
          name: "A",
          icon: "http://x/a.jpg",
          rating: null,
          addedAt: null,
          categoryId: "c",
          ext: "mp4",
        },
      ]);
      replaceSeries(tx, [
        {
          id: 9,
          num: 1,
          name: "S",
          cover: null,
          plot: "p",
          cast: null,
          director: null,
          genre: "Drama",
          releaseDate: "2025-01-10",
          lastModifiedAt: 7,
          rating: 8,
          backdrop: null,
          episodeRunTime: 50,
          categoryId: "s",
        },
      ]);
    });
    expect((await readVodItem(db, 1))?.icon).toBe("http://x/a.jpg");
    expect(await readVodItem(db, 3)).toBeNull();
    expect((await readSeriesItem(db, 9))?.genre).toBe("Drama");
    expect((await readVodItems(db)).map((v) => [v.id, v.ext, v.rating])).toEqual([
      [2, "mkv", 7],
      [1, "mp4", null],
    ]);
    expect(await readSeriesItems(db)).toEqual([
      {
        id: 9,
        name: "S",
        cover: null,
        backdrop: null,
        plot: "p",
        genre: "Drama",
        releaseDate: "2025-01-10",
        rating: 8,
        addedAt: 7,
      },
    ]);
  });

  it("saves and reads resume points, and maps episodes to their series", async () => {
    const db = await library();
    await writeResume(db, "vod", 5, point(120, 10));
    await writeResume(db, "vod", 5, point(240, 20));
    await writeResume(db, "episode", 5, point(60, 30, true));
    expect((await readResume(db, "vod")).get(5)).toEqual(point(240, 20));
    expect((await readResume(db, "episode", [5, 6])).get(5)?.watched).toBe(true);
    expect((await readResume(db, "vod", [])).size).toBe(0);
    await replaceEpisodes(db, 9, [ep(11, 1, 1), ep(12, 1, 2)]);
    await replaceEpisodes(db, 9, [ep(12, 1, 2)]);
    expect(await seriesOfEpisode(db, 12)).toBe(9);
    expect(await seriesOfEpisode(db, 11)).toBeNull();
    await recordHistory(db, "vod", 5, 1);
    await recordHistory(db, "vod", 5, 2);
    expect(await db.select("SELECT kind, id, watched_at FROM history")).toEqual([
      { kind: "vod", id: 5, watched_at: 2 },
    ]);
  });
});

describe("detail caches", () => {
  it("answer from a fresh cache, refresh a stale one, and fall back to it offline", async () => {
    const db = await library();
    let online = true;
    const { http, urls } = fakeHttp({
      get_vod_info: () => {
        if (!online) throw new HttpError("network", "offline");
        return fixture("vod-info.json") as never;
      },
    });
    const client = new XtreamClient(http, creds);
    const first = await loadVodInfo(client, db, 7, 1000);
    expect(first.source).toBe("network");
    expect((await loadVodInfo(client, db, 7, 2000)).source).toBe("cache");
    expect(urls).toHaveLength(1);
    online = false;
    const later = 1000 + VOD_INFO_FRESH_MS + 1;
    const stale = await loadVodInfo(client, db, 7, later);
    expect(stale.source).toBe("stale");
    expect(stale.value).toEqual(first.value);
    await expect(loadVodInfo(client, db, 8, later)).rejects.toThrow();
  });

  it("store a series' episodes when its info is fetched", async () => {
    const db = await library();
    const { http } = fakeHttp({ get_series_info: fixture("series-info.json") });
    const result = await loadSeriesInfo(new XtreamClient(http, creds), db, 77, 1000);
    expect(result.value.episodes.length).toBeGreaterThan(0);
    expect(await seriesOfEpisode(db, result.value.episodes[0]!.id)).toBe(77);
  });
});
