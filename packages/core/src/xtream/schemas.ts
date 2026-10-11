/**
 * Zod schemas for every Xtream response in docs/XTREAM_API.md. Each parses
 * the provider's shape and returns a clean model (camelCase, numbers as
 * numbers, times in milliseconds). Fields coerce and default; only an item
 * without its id is rejected, and list parsing skips it instead of failing.
 */

import * as z from "zod";
import {
  anyValue,
  base64Text,
  firstText,
  flag,
  id,
  int,
  loose,
  name,
  num,
  record,
  text,
  unixMs,
} from "./coerce";

// --- account ----------------------------------------------------------------

export const AccountInfoSchema = z
  .object({
    user_info: loose({
      auth: flag,
      status: text,
      exp_date: unixMs,
      is_trial: flag,
      active_cons: int,
      max_connections: int,
      created_at: unixMs,
      message: text,
      allowed_output_formats: z.unknown(),
    }),
    server_info: loose({
      timezone: text,
      timestamp_now: unixMs,
      server_protocol: text,
    }),
  })
  .transform(({ user_info: u, server_info: s }) => ({
    auth: u.auth,
    status: u.status,
    expiresAt: u.exp_date,
    isTrial: u.is_trial,
    activeConnections: u.active_cons,
    maxConnections: u.max_connections,
    createdAt: u.created_at,
    message: u.message,
    allowedFormats: Array.isArray(u.allowed_output_formats)
      ? u.allowed_output_formats.filter((f): f is string => typeof f === "string")
      : [],
    timezone: s.timezone,
    serverTime: s.timestamp_now,
  }));
export type AccountInfo = z.output<typeof AccountInfoSchema>;

// --- categories ---------------------------------------------------------------

export const CategorySchema = z
  .object({
    category_id: z.unknown(),
    category_name: name,
    parent_id: int,
  })
  .transform((c, ctx) => {
    const categoryId = typeof c.category_id === "number" ? String(c.category_id) : c.category_id;
    if (typeof categoryId !== "string" || categoryId.trim() === "") {
      ctx.addIssue({ code: "custom", message: "category without id" });
      return z.NEVER;
    }
    return { id: categoryId, name: c.category_name, parentId: c.parent_id || null };
  });
export type Category = z.output<typeof CategorySchema>;

/** Category ids are strings in the API; some panels send numbers or a list. */
const categoryId = anyValue.transform((v) => {
  const first = Array.isArray(v) ? v[0] : v;
  if (typeof first === "number" && Number.isFinite(first)) return String(first);
  return typeof first === "string" && first.trim() !== "" ? first : null;
});

// --- live ---------------------------------------------------------------------

export const LiveStreamSchema = z
  .object({
    stream_id: id,
    num: int,
    name,
    stream_icon: text,
    epg_channel_id: text,
    added: unixMs,
    category_id: categoryId,
    tv_archive: flag,
    tv_archive_duration: int,
  })
  .transform((s) => ({
    id: s.stream_id,
    num: s.num,
    name: s.name,
    icon: s.stream_icon,
    epgChannelId: s.epg_channel_id,
    addedAt: s.added,
    categoryId: s.category_id,
    tvArchive: s.tv_archive,
    tvArchiveDays: s.tv_archive_duration ?? 0,
  }));
export type LiveStream = z.output<typeof LiveStreamSchema>;

// --- movies -------------------------------------------------------------------

/** Container extension: letters and digits only, since it becomes part of a URL path. */
const extension = anyValue.transform((v) => {
  const ext = typeof v === "string" ? v.trim().toLowerCase() : "";
  return /^[a-z0-9]{1,8}$/.test(ext) ? ext : "mp4";
});

export const VodStreamSchema = z
  .object({
    stream_id: id,
    num: int,
    name,
    stream_icon: text,
    rating: num,
    rating_5based: num,
    added: unixMs,
    category_id: categoryId,
    container_extension: extension,
  })
  .transform((v) => ({
    id: v.stream_id,
    num: v.num,
    name: v.name,
    icon: v.stream_icon,
    rating: v.rating ?? (v.rating_5based === null ? null : v.rating_5based * 2),
    addedAt: v.added,
    categoryId: v.category_id,
    ext: v.container_extension,
  }));
export type VodStream = z.output<typeof VodStreamSchema>;

/** Codec details providers copy from ffprobe. Often [] or missing. */
const MediaInfoSchema = record.transform((m) =>
  m === null
    ? null
    : {
        codec: typeof m.codec_name === "string" ? m.codec_name : null,
        width: typeof m.width === "number" ? m.width : null,
        height: typeof m.height === "number" ? m.height : null,
        channels: typeof m.channels === "number" ? m.channels : null,
      },
);

export const VodInfoSchema = z
  .object({
    info: loose({
      name: text,
      o_name: text,
      movie_image: text,
      cover_big: text,
      backdrop_path: firstText,
      tmdb_id: text,
      genre: text,
      plot: text,
      description: text,
      cast: text,
      actors: text,
      director: text,
      rating: num,
      releasedate: text,
      duration_secs: int,
      video: MediaInfoSchema,
      audio: MediaInfoSchema,
    }),
    movie_data: z
      .object({
        stream_id: id,
        name: text,
        container_extension: extension,
        category_id: categoryId,
      })
      .optional()
      .catch(undefined),
  })
  .transform(({ info: i, movie_data: m }) => ({
    id: m?.stream_id ?? null,
    name: i.name ?? m?.name ?? null,
    originalName: i.o_name ?? null,
    poster: i.movie_image ?? i.cover_big ?? null,
    backdrop: i.backdrop_path ?? null,
    tmdbId: i.tmdb_id ?? null,
    genre: i.genre ?? null,
    plot: i.plot ?? i.description ?? null,
    cast: i.cast ?? i.actors ?? null,
    director: i.director ?? null,
    rating: i.rating ?? null,
    releaseDate: i.releasedate ?? null,
    durationSecs: i.duration_secs ?? null,
    ext: m?.container_extension ?? null,
    categoryId: m?.category_id ?? null,
    video: i.video ?? null,
    audio: i.audio ?? null,
  }));
export type VodInfo = z.output<typeof VodInfoSchema>;

// --- series -------------------------------------------------------------------

export const SeriesSchema = z
  .object({
    series_id: id,
    num: int,
    name,
    cover: text,
    plot: text,
    cast: text,
    director: text,
    genre: text,
    releaseDate: text,
    release_date: text,
    last_modified: unixMs,
    rating: num,
    rating_5based: num,
    backdrop_path: firstText,
    episode_run_time: int,
    category_id: categoryId,
  })
  .transform((s) => ({
    id: s.series_id,
    num: s.num,
    name: s.name,
    cover: s.cover,
    plot: s.plot,
    cast: s.cast,
    director: s.director,
    genre: s.genre,
    releaseDate: s.releaseDate ?? s.release_date,
    lastModifiedAt: s.last_modified,
    rating: s.rating ?? (s.rating_5based === null ? null : s.rating_5based * 2),
    backdrop: s.backdrop_path,
    episodeRunTime: s.episode_run_time,
    categoryId: s.category_id,
  }));
export type Series = z.output<typeof SeriesSchema>;

export const EpisodeSchema = z
  .object({
    id,
    episode_num: int,
    title: text,
    container_extension: extension,
    season: int,
    info: loose({
      duration_secs: int,
      movie_image: text,
      plot: text,
      rating: num,
      releasedate: text,
    }),
  })
  .transform((e) => ({
    id: e.id,
    episodeNum: e.episode_num,
    title: e.title,
    ext: e.container_extension,
    season: e.season,
    durationSecs: e.info.duration_secs,
    image: e.info.movie_image,
    plot: e.info.plot,
    rating: e.info.rating,
    releaseDate: e.info.releasedate,
  }));
export type Episode = z.output<typeof EpisodeSchema>;

export const SeasonSchema = z
  .object({
    season_number: int,
    name: text,
    episode_count: int,
    cover: text,
    cover_big: text,
    air_date: text,
  })
  .transform((s) => ({
    season: s.season_number,
    name: s.name,
    episodeCount: s.episode_count,
    cover: s.cover ?? s.cover_big,
    airDate: s.air_date,
  }));
export type Season = z.output<typeof SeasonSchema>;

// --- EPG ----------------------------------------------------------------------

export const EpgEntrySchema = z
  .object({
    id: text,
    title: base64Text,
    description: base64Text,
    start_timestamp: unixMs,
    stop_timestamp: unixMs,
    has_archive: flag,
    now_playing: flag,
  })
  .transform((e, ctx) => {
    if (e.start_timestamp === null || e.stop_timestamp === null) {
      ctx.addIssue({ code: "custom", message: "programme without times" });
      return z.NEVER;
    }
    return {
      id: e.id,
      title: e.title ?? "",
      description: e.description,
      start: e.start_timestamp,
      end: e.stop_timestamp,
      hasArchive: e.has_archive,
      nowPlaying: e.now_playing,
    };
  });
export type EpgEntry = z.output<typeof EpgEntrySchema>;
