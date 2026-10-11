/**
 * Xtream Codes "player API" client (docs/XTREAM_API.md). Talks to the
 * provider only through the HttpAdapter, and returns parsed models.
 */

import type * as z from "zod";
import { HttpError, type HttpAdapter } from "../adapters";
import { redact } from "../redact";
import { XtreamError } from "./errors";
import {
  AccountInfoSchema,
  CategorySchema,
  EpgEntrySchema,
  EpisodeSchema,
  LiveStreamSchema,
  SeasonSchema,
  SeriesSchema,
  VodInfoSchema,
  VodStreamSchema,
  type AccountInfo,
  type Category,
  type Episode,
  type Season,
  type Series,
} from "./schemas";
import { apiUrl, type Credentials } from "./urls";

export type ContentKind = "live" | "vod" | "series";

export interface ParsedList<T> {
  items: T[];
  /** Items dropped because they had no usable id. */
  skipped: number;
}

export interface SeriesInfo {
  seasons: Season[];
  episodes: Episode[];
}

/** List payloads run to tens of thousands of items: parse in slices so the UI keeps painting. */
const PARSE_SLICE = 1000;
const LIST_TIMEOUT_MS = 60_000;
const CALL_TIMEOUT_MS = 15_000;

const yieldToEventLoop = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * Parses a provider list item by item. A bad item is skipped, never fatal
 * (CLAUDE.md rule 8). Providers sometimes send an object keyed by id instead
 * of an array, or `{}` / `null` for an empty list.
 */
export async function parseList<S extends z.ZodType>(
  schema: S,
  data: unknown,
): Promise<ParsedList<z.output<S>>> {
  const raw: unknown[] = Array.isArray(data)
    ? data
    : data !== null && typeof data === "object"
      ? Object.values(data)
      : [];
  const items: z.output<S>[] = [];
  let skipped = 0;
  for (let i = 0; i < raw.length; i++) {
    const result = schema.safeParse(raw[i]);
    if (result.success) items.push(result.data);
    else skipped++;
    if ((i + 1) % PARSE_SLICE === 0) await yieldToEventLoop();
  }
  return { items, skipped };
}

export class XtreamClient {
  private readonly http: HttpAdapter;
  private readonly creds: Credentials;

  constructor(http: HttpAdapter, creds: Credentials) {
    this.http = http;
    this.creds = creds;
  }

  /**
   * Validates the login (SPEC §1). Throws `wrong-credentials` or `inactive`
   * as well as the transport errors.
   */
  async accountInfo(signal?: AbortSignal): Promise<AccountInfo> {
    const data = await this.get({}, CALL_TIMEOUT_MS, signal);
    if (data === null || typeof data !== "object" || !("user_info" in data)) {
      // Many panels answer bad credentials with an empty body or [].
      throw new XtreamError("wrong-credentials", "No user_info in account info");
    }
    const info = AccountInfoSchema.parse(data);
    if (!info.auth) throw new XtreamError("wrong-credentials", "auth = 0");
    if (info.status && info.status.toLowerCase() !== "active") {
      throw new XtreamError("inactive", `Account status: ${info.status}`, info.status);
    }
    return info;
  }

  categories(kind: ContentKind, signal?: AbortSignal): Promise<ParsedList<Category>> {
    const action = {
      live: "get_live_categories",
      vod: "get_vod_categories",
      series: "get_series_categories",
    }[kind];
    return this.list(action, CategorySchema, signal);
  }

  liveStreams(signal?: AbortSignal) {
    return this.list("get_live_streams", LiveStreamSchema, signal);
  }

  vodStreams(signal?: AbortSignal) {
    return this.list("get_vod_streams", VodStreamSchema, signal);
  }

  series(signal?: AbortSignal): Promise<ParsedList<Series>> {
    return this.list("get_series", SeriesSchema, signal);
  }

  async vodInfo(vodId: number, signal?: AbortSignal) {
    const data = await this.get({ action: "get_vod_info", vod_id: vodId }, CALL_TIMEOUT_MS, signal);
    return VodInfoSchema.parse(data ?? {});
  }

  /**
   * Seasons and episodes. `episodes` is an object keyed by season, or an
   * array of seasons; `seasons` can be empty while episodes exist, so seasons
   * are completed from the episode keys.
   */
  async seriesInfo(seriesId: number, signal?: AbortSignal): Promise<SeriesInfo> {
    const data = await this.get(
      { action: "get_series_info", series_id: seriesId },
      CALL_TIMEOUT_MS,
      signal,
    );
    const body = data !== null && typeof data === "object" ? (data as Record<string, unknown>) : {};
    const seasons = (await parseList(SeasonSchema, body.seasons)).items;

    const groups: [string, unknown][] = Array.isArray(body.episodes)
      ? body.episodes.map((group, i) => [String(i + 1), group])
      : body.episodes !== null && typeof body.episodes === "object"
        ? Object.entries(body.episodes)
        : [];
    const episodes: Episode[] = [];
    for (const [key, group] of groups) {
      const { items } = await parseList(EpisodeSchema, group);
      const seasonFromKey = Number(key);
      for (const episode of items) {
        episodes.push({
          ...episode,
          season: episode.season ?? (Number.isFinite(seasonFromKey) ? seasonFromKey : null),
        });
      }
    }
    const known = new Set(seasons.map((s) => s.season));
    for (const season of new Set(episodes.map((e) => e.season))) {
      if (season !== null && !known.has(season)) {
        seasons.push({ season, name: null, episodeCount: null, cover: null, airDate: null });
      }
    }
    seasons.sort((a, b) => (a.season ?? 0) - (b.season ?? 0));
    return { seasons, episodes };
  }

  /** Now and next few programmes. */
  async shortEpg(streamId: number, limit = 4, signal?: AbortSignal) {
    const data = await this.get(
      { action: "get_short_epg", stream_id: streamId, limit },
      CALL_TIMEOUT_MS,
      signal,
    );
    return (await parseList(EpgEntrySchema, listings(data))).items;
  }

  /** The full available day(s), with archive flags (catch-up). */
  async simpleDataTable(streamId: number, signal?: AbortSignal) {
    const data = await this.get(
      { action: "get_simple_data_table", stream_id: streamId },
      CALL_TIMEOUT_MS,
      signal,
    );
    return (await parseList(EpgEntrySchema, listings(data))).items;
  }

  private async list<S extends z.ZodType>(action: string, schema: S, signal?: AbortSignal) {
    const data = await this.get({ action }, LIST_TIMEOUT_MS, signal);
    return parseList(schema, data);
  }

  private async get(
    params: Record<string, string | number>,
    timeoutMs: number,
    signal?: AbortSignal,
  ) {
    try {
      return await this.http.getJson(apiUrl(this.creds, params), { timeoutMs, signal });
    } catch (error) {
      throw toXtreamError(error, this.creds);
    }
  }
}

function listings(data: unknown): unknown {
  return data !== null && typeof data === "object" && "epg_listings" in data
    ? (data as { epg_listings: unknown }).epg_listings
    : [];
}

function toXtreamError(error: unknown, creds: Credentials): XtreamError {
  const secrets = [creds.username, creds.password];
  const message = redact(error instanceof Error ? error.message : String(error), secrets);
  if (error instanceof HttpError) {
    switch (error.kind) {
      case "network":
      case "timeout":
        return new XtreamError("unreachable", message);
      case "aborted":
        return new XtreamError("aborted", message);
      case "status":
        // 401/403 with credentials in the URL means the login was refused.
        if (error.status === 401 || error.status === 403)
          return new XtreamError("wrong-credentials", message);
        if (error.status === 429) return new XtreamError("rate-limited", message);
        if (error.status !== undefined && error.status >= 500)
          return new XtreamError("unreachable", message);
        return new XtreamError("bad-response", message);
      case "not-json":
        return new XtreamError("bad-response", message);
    }
  }
  return new XtreamError("bad-response", message);
}
