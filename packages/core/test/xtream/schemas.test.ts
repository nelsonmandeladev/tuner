import { describe, expect, it } from "vitest";
import { parseList } from "../../src/xtream/client";
import { decodeBase64 } from "../../src/xtream/coerce";
import {
  AccountInfoSchema,
  CategorySchema,
  EpgEntrySchema,
  EpisodeSchema,
  LiveStreamSchema,
  SeriesSchema,
  VodInfoSchema,
  VodStreamSchema,
} from "../../src/xtream/schemas";
import { fixture } from "../helpers";

describe("recorded fixtures", () => {
  it("parse every list item without skipping any", async () => {
    const cases = [
      ["live-categories.json", CategorySchema],
      ["vod-categories.json", CategorySchema],
      ["series-categories.json", CategorySchema],
      ["live-streams.json", LiveStreamSchema],
      ["vod-streams.json", VodStreamSchema],
      ["series.json", SeriesSchema],
    ] as const;
    for (const [file, schema] of cases) {
      const data = fixture<unknown[]>(file);
      const { items, skipped } = await parseList(schema, data);
      expect(skipped, file).toBe(0);
      expect(items.length, file).toBe(data.length);
    }
  });

  it("parse account info, keeping status, expiry and limits", () => {
    const info = AccountInfoSchema.parse(fixture("account-info.json"));
    expect(info).toMatchObject({
      auth: true,
      status: "Active",
      isTrial: false,
      maxConnections: 1,
      allowedFormats: ["m3u8", "ts"],
      timezone: "Europe/Paris",
    });
    expect(info.expiresAt).toBeGreaterThan(Date.UTC(2026, 0, 1));
  });

  it("parse VOD info including codec details", () => {
    const info = VodInfoSchema.parse(fixture("vod-info.json"));
    expect(info.id).toBeGreaterThan(0);
    expect(info.video?.codec).toBe("hevc");
    expect(info.audio?.codec).toEqual(expect.any(String));
    expect(info.ext).toBe("mkv");
  });

  it("decode base64 EPG titles as UTF-8", async () => {
    const { items } = await parseList(
      EpgEntrySchema,
      fixture<{ epg_listings: unknown[] }>("short-epg.json").epg_listings,
    );
    expect(items.length).toBeGreaterThan(0);
    for (const entry of items) {
      expect(entry.title).toMatch(/^programme title \d+/);
      expect(entry.end).toBeGreaterThan(entry.start);
    }
  });
});

describe("coercion of messy provider values", () => {
  it("turns numeric strings into numbers and 0/1 strings into booleans", () => {
    const stream = LiveStreamSchema.parse({
      stream_id: "4521",
      num: "301",
      name: "Sport 1",
      added: "1700000000",
      category_id: 12,
      tv_archive: "1",
      tv_archive_duration: "3",
    });
    expect(stream).toMatchObject({
      id: 4521,
      num: 301,
      categoryId: "12",
      tvArchive: true,
      tvArchiveDays: 3,
      addedAt: 1_700_000_000_000,
    });
  });

  it("defaults missing and null fields instead of failing", () => {
    expect(LiveStreamSchema.parse({ stream_id: 1 })).toEqual({
      id: 1,
      num: null,
      name: "",
      icon: null,
      epgChannelId: null,
      addedAt: null,
      categoryId: null,
      tvArchive: false,
      tvArchiveDays: 0,
    });
    expect(
      VodStreamSchema.parse({ stream_id: 2, rating: "", container_extension: null }),
    ).toMatchObject({
      rating: null,
      ext: "mp4",
    });
  });

  it("falls back to the 5-based rating, doubled", () => {
    expect(VodStreamSchema.parse({ stream_id: 2, rating: "", rating_5based: 3.5 }).rating).toBe(7);
  });

  it("refuses a container extension that could change the URL path", () => {
    expect(VodStreamSchema.parse({ stream_id: 3, container_extension: "../x" }).ext).toBe("mp4");
  });

  it("reads the first backdrop from an array and treats [] as empty", () => {
    expect(SeriesSchema.parse({ series_id: 7, backdrop_path: ["", "b.jpg"] }).backdrop).toBe(
      "b.jpg",
    );
    expect(SeriesSchema.parse({ series_id: 7, backdrop_path: [] }).backdrop).toBeNull();
  });

  it("accepts [] where an object belongs", () => {
    const info = VodInfoSchema.parse({ info: [], movie_data: [] });
    expect(info).toMatchObject({ id: null, name: null, video: null, audio: null });
    expect(EpisodeSchema.parse({ id: "9", info: [] }).durationSecs).toBeNull();
  });

  it("keeps category ids as strings whatever the provider sends", () => {
    expect(CategorySchema.parse({ category_id: 40, category_name: "Films" }).id).toBe("40");
    expect(VodStreamSchema.parse({ stream_id: 1, category_id: ["40", "41"] }).categoryId).toBe(
      "40",
    );
  });

  it("passes plain text through base64 decoding", () => {
    expect(decodeBase64("UHJlbWllciBMZWFndWU=")).toBe("Premier League");
    expect(decodeBase64("Not base64 at all!")).toBe("Not base64 at all!");
  });
});

describe("one bad item never breaks a list", () => {
  it("skips items without a usable id and keeps the rest", async () => {
    const { items, skipped } = await parseList(LiveStreamSchema, [
      { stream_id: 1, name: "ok" },
      { name: "no id" },
      { stream_id: "abc" },
      { stream_id: -5 },
      null,
      "garbage",
      { stream_id: 2, name: "also ok", tv_archive: "yes?" },
    ]);
    expect(items.map((i) => i.id)).toEqual([1, 2]);
    expect(skipped).toBe(5);
  });

  it("accepts an object keyed by id instead of an array", async () => {
    const { items } = await parseList(CategorySchema, {
      a: { category_id: "1", category_name: "A" },
    });
    expect(items).toEqual([{ id: "1", name: "A", parentId: null }]);
  });

  it("treats null, {} and a string as an empty list", async () => {
    for (const data of [null, {}, "<html>"]) {
      expect((await parseList(CategorySchema, data)).items).toEqual([]);
    }
  });

  it("skips programmes without start or stop times", async () => {
    const { items, skipped } = await parseList(EpgEntrySchema, [
      { title: "", start_timestamp: "1", stop_timestamp: "2" },
      { title: "", start_timestamp: "" },
    ]);
    expect(items).toHaveLength(1);
    expect(skipped).toBe(1);
  });
});
