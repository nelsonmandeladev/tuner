import { describe, expect, it } from "vitest";
import { HttpError } from "../../src/adapters";
import { XtreamClient } from "../../src/xtream/client";
import { XtreamError } from "../../src/xtream/errors";
import { apiUrl, normalizeServer, streamUrl } from "../../src/xtream/urls";
import { creds, fakeHttp, fixture } from "../helpers";

const account = fixture<Record<string, Record<string, unknown>>>("account-info.json");

async function errorOf(promise: Promise<unknown>): Promise<XtreamError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof XtreamError) return error;
    throw error;
  }
  throw new Error("expected an XtreamError");
}

describe("account info", () => {
  it("returns the account when the login is valid", async () => {
    const { http } = fakeHttp({ "": account });
    const info = await new XtreamClient(http, creds).accountInfo();
    expect(info.status).toBe("Active");
  });

  it("maps auth 0 and empty answers to wrong credentials", async () => {
    const refused = { ...account, user_info: { ...account.user_info, auth: 0 } };
    for (const body of [refused, [], {}]) {
      const { http } = fakeHttp({ "": body });
      expect((await errorOf(new XtreamClient(http, creds).accountInfo())).kind).toBe(
        "wrong-credentials",
      );
    }
  });

  it("reports an expired account with its status", async () => {
    const expired = { ...account, user_info: { ...account.user_info, status: "Expired" } };
    const { http } = fakeHttp({ "": expired });
    const error = await errorOf(new XtreamClient(http, creds).accountInfo());
    expect(error).toMatchObject({ kind: "inactive", status: "Expired" });
  });

  it.each([
    ["network", undefined, "unreachable"],
    ["timeout", undefined, "unreachable"],
    ["status", 503, "unreachable"],
    ["status", 403, "wrong-credentials"],
    ["status", 404, "bad-response"],
    ["not-json", undefined, "bad-response"],
  ] as const)("maps an HTTP %s error (%s) to %s", async (kind, status, expected) => {
    const { http } = fakeHttp({
      "": () => {
        throw new HttpError(kind, "boom", status);
      },
    });
    expect((await errorOf(new XtreamClient(http, creds).accountInfo())).kind).toBe(expected);
  });

  it("never puts credentials in error messages", async () => {
    const { http } = fakeHttp({
      "": () => {
        throw new HttpError("network", `failed: ${apiUrl(creds)}`);
      },
    });
    const error = await errorOf(new XtreamClient(http, creds).accountInfo());
    expect(error.message).not.toContain(creds.username);
    expect(error.message).not.toContain(creds.password);
    expect(error.message).not.toContain(encodeURIComponent(creds.password));
  });
});

describe("lists and details", () => {
  it("asks for the right action for each list", async () => {
    const { http, urls } = fakeHttp({
      get_live_categories: [],
      get_vod_categories: [],
      get_series_categories: [],
      get_live_streams: fixture("live-streams.json"),
    });
    const client = new XtreamClient(http, creds);
    await client.categories("live");
    await client.categories("vod");
    await client.categories("series");
    const live = await client.liveStreams();
    expect(live.items.length).toBeGreaterThan(0);
    expect(urls.map((u) => new URL(u).searchParams.get("action"))).toEqual([
      "get_live_categories",
      "get_vod_categories",
      "get_series_categories",
      "get_live_streams",
    ]);
  });

  it("reads series episodes keyed by season and fills in seasons", async () => {
    const recorded = fixture<Record<string, unknown>>("series-info.json");
    const { http } = fakeHttp({ get_series_info: { ...recorded, seasons: [] } });
    const info = await new XtreamClient(http, creds).seriesInfo(1);
    expect(info.episodes.length).toBeGreaterThan(0);
    expect(info.seasons.map((s) => s.season)).toEqual(
      [...new Set(info.episodes.map((e) => e.season))].sort(),
    );
  });

  it("reads series episodes sent as an array of seasons", async () => {
    const { http } = fakeHttp({
      get_series_info: {
        seasons: [],
        episodes: [[{ id: "11", episode_num: 1 }], [{ id: "21", episode_num: 1 }]],
      },
    });
    const info = await new XtreamClient(http, creds).seriesInfo(1);
    expect(info.episodes.map((e) => [e.id, e.season])).toEqual([
      [11, 1],
      [21, 2],
    ]);
  });

  it("returns now/next from the short EPG", async () => {
    const { http } = fakeHttp({ get_short_epg: fixture("short-epg.json") });
    const epg = await new XtreamClient(http, creds).shortEpg(1);
    expect(epg.length).toBeGreaterThan(0);
  });
});

describe("urls", () => {
  it("normalises what the user types into scheme://host[:port]", () => {
    expect(normalizeServer("provider.example:8080")).toBe("http://provider.example:8080");
    expect(normalizeServer(" https://provider.example/ ")).toBe("https://provider.example");
    expect(normalizeServer("http://provider.example:8080/player_api.php?username=x")).toBe(
      "http://provider.example:8080",
    );
    expect(normalizeServer("")).toBeNull();
    expect(normalizeServer("ftp://provider.example")).toBeNull();
    expect(normalizeServer("http://")).toBeNull();
  });

  it("encodes credentials in API and stream URLs", () => {
    expect(apiUrl(creds, { action: "get_series" })).toBe(
      "http://provider.example:8080/player_api.php?username=alice&password=s3cret%2F%23%3F&action=get_series",
    );
    expect(streamUrl(creds, "live", 4521, "ts")).toBe(
      "http://provider.example:8080/live/alice/s3cret%2F%23%3F/4521.ts",
    );
    expect(() => streamUrl(creds, "movie", 1, "../ts")).toThrow();
  });
});
