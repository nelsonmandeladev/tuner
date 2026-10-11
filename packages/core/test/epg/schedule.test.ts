import { describe, expect, it } from "vitest";
import {
  archivedProgrammes,
  fetchSchedule,
  nowNext,
  progressOf,
  tidySchedule,
} from "../../src/epg/schedule";
import { XtreamClient } from "../../src/xtream/client";
import type { EpgEntry } from "../../src/xtream/schemas";
import { creds, fakeHttp, fixture } from "../helpers";

const MIN = 60_000;
const NOW = 1_791_746_556_000;

function entry(title: string, startMin: number, endMin: number, hasArchive = false): EpgEntry {
  return {
    id: title,
    title,
    description: null,
    start: NOW + startMin * MIN,
    end: NOW + endMin * MIN,
    hasArchive,
    nowPlaying: false,
  };
}

/** The wire shape: base64 titles and unix-seconds strings, as providers send them. */
function wire(title: string, startMin: number, endMin: number, hasArchive = 0) {
  return {
    title: btoa(title),
    start_timestamp: String((NOW + startMin * MIN) / 1000),
    stop_timestamp: String((NOW + endMin * MIN) / 1000),
    has_archive: hasArchive,
  };
}

describe("tidySchedule", () => {
  it("drops ended and duplicate programmes and sorts by start", () => {
    const tidy = tidySchedule(
      [
        entry("later", 60, 90),
        entry("ended", -90, -30),
        entry("now", -10, 60),
        entry("now", -10, 60),
      ],
      NOW,
    );
    expect(tidy.map((p) => p.title)).toEqual(["now", "later"]);
  });

  it("keeps at most 8", () => {
    const many = Array.from({ length: 20 }, (_, i) => entry(`p${i}`, i * 10, i * 10 + 10));
    expect(tidySchedule(many, NOW)).toHaveLength(8);
  });
});

describe("nowNext", () => {
  it("finds what is on and what follows", () => {
    const programmes = tidySchedule(
      [entry("a", -30, 30), entry("b", 30, 90), entry("c", 90, 120)],
      NOW,
    );
    const { now, next, upcoming } = nowNext(programmes, NOW);
    expect(now?.title).toBe("a");
    expect(next?.title).toBe("b");
    expect(upcoming.map((p) => p.title)).toEqual(["b", "c"]);
    expect(progressOf(now!, NOW)).toBeCloseTo(0.5);
  });

  it("has no current programme in a gap", () => {
    const programmes = tidySchedule([entry("b", 30, 90)], NOW);
    expect(nowNext(programmes, NOW)).toMatchObject({ now: null, next: { title: "b" } });
  });
});

describe("fetchSchedule", () => {
  it("uses the short EPG when it covers now", async () => {
    const { http, urls } = fakeHttp({
      get_short_epg: { epg_listings: [wire("now", -20, 40), wire("next", 40, 100)] },
    });
    const result = await fetchSchedule(new XtreamClient(http, creds), 7, "short", NOW);
    expect(result.source).toBe("short");
    expect(result.programmes.map((p) => p.title)).toEqual(["now", "next"]);
    expect(urls).toHaveLength(1);
  });

  it("does not ask for the table when a channel has no guide", async () => {
    const { http, urls } = fakeHttp({ get_short_epg: { epg_listings: [] } });
    const result = await fetchSchedule(new XtreamClient(http, creds), 7, "short", NOW);
    expect(result).toEqual({ programmes: [], source: "short" });
    expect(urls).toHaveLength(1);
  });

  it("switches to the data table when the short EPG skips the current programme", async () => {
    // The provider bug: the short EPG starts ~2 h late.
    const { http, urls } = fakeHttp({
      get_short_epg: { epg_listings: [wire("late", 106, 200)] },
      get_simple_data_table: {
        epg_listings: [wire("before", -120, -40, 1), wire("now", -40, 20), wire("next", 20, 80)],
      },
    });
    const result = await fetchSchedule(new XtreamClient(http, creds), 7, "short", NOW);
    expect(result.source).toBe("table");
    expect(result.programmes.map((p) => p.title)).toEqual(["now", "next"]);
    expect(urls.map((u) => new URL(u).searchParams.get("action"))).toEqual([
      "get_short_epg",
      "get_simple_data_table",
    ]);
  });

  it("keeps the short EPG when the table has nothing on now either (a real gap)", async () => {
    const { http } = fakeHttp({
      get_short_epg: { epg_listings: [wire("late", 30, 90)] },
      get_simple_data_table: { epg_listings: [wire("late", 30, 90)] },
    });
    const result = await fetchSchedule(new XtreamClient(http, creds), 7, "short", NOW);
    expect(result.source).toBe("short");
  });

  it("goes straight to the table once the account's source is the table", async () => {
    const { http, urls } = fakeHttp({
      get_simple_data_table: fixture("simple-data-table.json"),
    });
    await fetchSchedule(new XtreamClient(http, creds), 7, "table", NOW);
    expect(urls.map((u) => new URL(u).searchParams.get("action"))).toEqual([
      "get_simple_data_table",
    ]);
  });
});

describe("archivedProgrammes", () => {
  it("lists recorded, finished programmes inside the window, newest first", () => {
    const entries = [
      entry("too old", -4 * 1440, -4 * 1440 + 60, true),
      entry("old", -2 * 1440, -2 * 1440 + 60, true),
      entry("recent", -120, -60, true),
      entry("not recorded", -60, -30, false),
      entry("still on", -30, 30, true),
    ];
    expect(archivedProgrammes(entries, NOW, 3).map((p) => p.title)).toEqual(["recent", "old"]);
  });
});
