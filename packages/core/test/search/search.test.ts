import { describe, expect, it } from "vitest";
import {
  buildSearchIndex,
  parseSearchIndex,
  readSearchDocs,
  searchIndexKey,
  searchLibrary,
  serializeSearchIndex,
  type SearchDoc,
} from "../../src/search";
import {
  replaceCategories,
  replaceLive,
  replaceSeries,
  replaceVod,
} from "../../src/storage/library";
import { migrate } from "../../src/storage/migrate";
import { accountMigrations } from "../../src/storage/migrations";
import type { LiveStream, Series, VodStream } from "../../src/xtream/schemas";
import { memoryDb } from "../sqlite";

const live = (id: number, name: string, categoryId: string): LiveStream => ({
  id,
  num: id,
  name,
  icon: null,
  epgChannelId: null,
  addedAt: null,
  categoryId,
  tvArchive: false,
  tvArchiveDays: 0,
});
const movie = (id: number, name: string, categoryId: string): VodStream => ({
  id,
  num: id,
  name,
  icon: `http://img.example/${id}.jpg`,
  rating: null,
  addedAt: id,
  categoryId,
  ext: "mkv",
});
const show = (id: number, name: string, categoryId: string): Series => ({
  id,
  num: id,
  name,
  cover: null,
  plot: null,
  cast: null,
  director: null,
  genre: null,
  releaseDate: "2021-05-01",
  lastModifiedAt: id,
  rating: null,
  backdrop: null,
  episodeRunTime: null,
  categoryId,
});

async function library() {
  const db = memoryDb();
  await migrate(db, accountMigrations);
  await db.transaction(async (tx) => {
    replaceCategories(tx, "live", [
      { id: "1", name: "FR| Sports", parentId: null },
      { id: "2", name: "FR| News", parentId: null },
    ]);
    replaceCategories(tx, "vod", [{ id: "10", name: "Drama", parentId: null }]);
    replaceCategories(tx, "series", [{ id: "20", name: "Kids", parentId: null }]);
    replaceLive(tx, [
      live(1, "FR| Écho du Fleuve HD", "1"),
      live(2, "FR| Echo Infos", "2"),
      live(3, "FR| Arena Une", "1"),
      // Listed twice: one channel in two categories.
      live(3, "FR| Arena Une", "2"),
    ]);
    replaceVod(tx, [
      movie(100, "FR ★ Le Fleuve Lointain - 2023 [4K]", "10"),
      movie(101, "FR ★ Harbour Lights - 2019", "10"),
    ]);
    replaceSeries(tx, [show(200, "FR ★ Les Petits Fleuves", "20")]);
  });
  return db;
}

const titles = (hits: { title: string }[]) => hits.map((h) => h.title);
/** For checks where the score order is not the point. */
const sorted = (hits: { title: string }[]) => titles(hits).sort();

describe("search", () => {
  it("reads one document per item with clean titles, years and categories", async () => {
    const docs = await readSearchDocs(await library());
    expect(docs).toHaveLength(6);
    const byKey = new Map(docs.map((d) => [d.key, d]));
    expect(byKey.get("vod:100")).toMatchObject<Partial<SearchDoc>>({
      title: "Le Fleuve Lointain",
      year: 2023,
      icon: "http://img.example/100.jpg",
      category: "Drama",
    });
    expect(byKey.get("series:200")).toMatchObject({ title: "Les Petits Fleuves", year: 2021 });
    expect(byKey.get("live:3")).toMatchObject({ title: "FR| Arena Une", text: "Arena Une" });
    expect(byKey.get("live:3")?.category).toBe("Sports News");
  });

  it("ignores accents and case, takes prefixes and one typo, groups by kind", async () => {
    const index = buildSearchIndex(await readSearchDocs(await library()));
    expect(sorted(searchLibrary(index, "echo").live)).toEqual([
      "FR| Echo Infos",
      "FR| Écho du Fleuve HD",
    ]);
    expect(titles(searchLibrary(index, "ÉCHO DU").live)).toEqual(["FR| Écho du Fleuve HD"]);
    // Prefix while typing.
    expect(titles(searchLibrary(index, "harb").vod)).toEqual(["Harbour Lights"]);
    // One typo in a word of four letters or more: a missing letter, a wrong one.
    expect(titles(searchLibrary(index, "harbur").vod)).toEqual(["Harbour Lights"]);
    expect(titles(searchLibrary(index, "fleive").vod)).toEqual(["Le Fleuve Lointain"]);
    const fleuve = searchLibrary(index, "fleuve");
    expect(fleuve.total).toEqual({ live: 1, vod: 1, series: 1 });
    // Every word must match.
    expect(titles(searchLibrary(index, "fleuve 2023").vod)).toEqual(["Le Fleuve Lointain"]);
    expect(searchLibrary(index, "fleuve 2019").total.vod).toBe(0);
    // Category names match too, below names.
    expect(sorted(searchLibrary(index, "sports").live)).toEqual([
      "FR| Arena Une",
      "FR| Écho du Fleuve HD",
    ]);
    expect(searchLibrary(index, "  ★ ").total).toEqual({ live: 0, vod: 0, series: 0 });
  });

  it("keeps the per-kind limit and counts every match", async () => {
    const index = buildSearchIndex(await readSearchDocs(await library()));
    const result = searchLibrary(index, "une", { limit: 1 });
    expect(result.live).toHaveLength(1);
    expect(result.total.live).toBe(1);
    // The language prefix is not matched: "fr" would otherwise find everything.
    expect(searchLibrary(index, "fr").total).toEqual({ live: 0, vod: 0, series: 0 });
    // A lone letter matches whole words only.
    expect(searchLibrary(index, "l").total.vod).toBe(0);
    expect(searchLibrary(index, "le").total.vod).toBe(1);
  });

  it("leaves out items listed only in hidden categories", async () => {
    const index = buildSearchIndex(await readSearchDocs(await library()));
    const hidden = new Set(["live:1"]);
    // Channel 1 is only in Sports; channel 3 is also in News.
    expect(titles(searchLibrary(index, "echo", { hidden }).live)).toEqual(["FR| Echo Infos"]);
    expect(titles(searchLibrary(index, "arena", { hidden }).live)).toEqual(["FR| Arena Une"]);
  });

  it("round-trips through text and refuses an index built for other data", async () => {
    const db = await library();
    const index = buildSearchIndex(await readSearchDocs(db));
    const key = searchIndexKey([
      { list: "live", syncedAt: 5, count: 3, skipped: 0 },
      { list: "vod", syncedAt: 6, count: 2, skipped: 0 },
    ]);
    expect(key).toBe("v1|categories:0|live:5|vod:6|series:0");
    const text = serializeSearchIndex(index, key);
    const loaded = parseSearchIndex(text, key);
    expect(loaded?.documentCount).toBe(6);
    expect(titles(searchLibrary(loaded!, "harbur").vod)).toEqual(["Harbour Lights"]);
    expect(parseSearchIndex(text, "v1|other")).toBeNull();
    expect(parseSearchIndex("not an index", key)).toBeNull();
    expect(parseSearchIndex(`${JSON.stringify({ key })}\n{broken`, key)).toBeNull();
  });
});
