/**
 * Movies and series reads, the detail caches, episodes, resume points and
 * history (ROADMAP M4). Resume and history rows are keyed by id and kind, so
 * they survive every sync.
 */

import type { SqlAdapter } from "../adapters";
import type { ResumePoint } from "../vod/resume";
import type { Episode } from "../xtream/schemas";
import { insertRows } from "./insert";

export interface VodItem {
  id: number;
  name: string;
  icon: string | null;
  rating: number | null;
  addedAt: number | null;
  ext: string;
}

export interface SeriesItem {
  id: number;
  name: string;
  cover: string | null;
  backdrop: string | null;
  plot: string | null;
  genre: string | null;
  releaseDate: string | null;
  rating: number | null;
  /** `last_modified`, used as "recently added" for series. */
  addedAt: number | null;
}

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

/** Every movie in provider order (~12,000 rows on the test provider; columns kept few). */
export async function readVodItems(db: SqlAdapter): Promise<VodItem[]> {
  const rows = await db.select<{
    id: number;
    name: string;
    icon: string | null;
    rating: number | null;
    added_at: number | null;
    ext: string;
  }>("SELECT id, name, icon, rating, added_at, ext FROM vod ORDER BY position");
  return rows.map((r) => ({
    id: Number(r.id),
    name: r.name,
    icon: r.icon,
    rating: num(r.rating),
    addedAt: num(r.added_at),
    ext: r.ext,
  }));
}

export async function readSeriesItems(db: SqlAdapter): Promise<SeriesItem[]> {
  const rows = await db.select<{
    id: number;
    name: string;
    cover: string | null;
    backdrop: string | null;
    plot: string | null;
    genre: string | null;
    release_date: string | null;
    rating: number | null;
    last_modified_at: number | null;
  }>(
    `SELECT id, name, cover, backdrop, plot, genre, release_date, rating, last_modified_at
     FROM series ORDER BY position`,
  );
  return rows.map((r) => ({
    id: Number(r.id),
    name: r.name,
    cover: r.cover,
    backdrop: r.backdrop,
    plot: r.plot,
    genre: r.genre,
    releaseDate: r.release_date,
    rating: num(r.rating),
    addedAt: num(r.last_modified_at),
  }));
}

// --- detail caches ------------------------------------------------------------------

export type DetailKind = "vod" | "series";

export interface CachedDetail<T> {
  value: T;
  fetchedAt: number;
}

/** A cached detail payload, however old (callers decide what is fresh). */
export async function readDetail<T>(
  db: SqlAdapter,
  kind: DetailKind,
  id: number,
): Promise<CachedDetail<T> | null> {
  const [row] = await db.select<{ json: string; fetched_at: number }>(
    "SELECT json, fetched_at FROM details_cache WHERE kind = ? AND id = ?",
    [kind, id],
  );
  if (!row) return null;
  try {
    return { value: JSON.parse(row.json) as T, fetchedAt: Number(row.fetched_at) };
  } catch {
    return null;
  }
}

export async function writeDetail(
  db: SqlAdapter,
  kind: DetailKind,
  id: number,
  value: unknown,
  at: number,
): Promise<void> {
  await db.execute(
    "INSERT OR REPLACE INTO details_cache (kind, id, json, fetched_at) VALUES (?, ?, ?, ?)",
    [kind, id, JSON.stringify(value), at],
  );
}

// --- episodes -------------------------------------------------------------------------

/** Replaces a series' episodes (episode → series lookups for history and resume). */
export async function replaceEpisodes(
  db: SqlAdapter,
  seriesId: number,
  episodes: readonly Episode[],
): Promise<void> {
  await db.transaction(async (tx) => {
    tx.execute("DELETE FROM episodes WHERE series_id = ?", [seriesId]);
    insertRows(
      tx,
      "episodes",
      [
        "id",
        "series_id",
        "season",
        "episode_num",
        "title",
        "ext",
        "duration_secs",
        "image",
        "plot",
        "rating",
        "release_date",
      ],
      episodes.map((e) => [
        e.id,
        seriesId,
        e.season,
        e.episodeNum,
        e.title,
        e.ext,
        e.durationSecs,
        e.image,
        e.plot,
        e.rating,
        e.releaseDate,
      ]),
      // An episode id listed under two series keeps the last one.
      { orReplace: true },
    );
  });
}

/** The series an episode belongs to, if its series page was opened once. */
export async function seriesOfEpisode(db: SqlAdapter, episodeId: number): Promise<number | null> {
  const [row] = await db.select<{ series_id: number }>(
    "SELECT series_id FROM episodes WHERE id = ?",
    [episodeId],
  );
  return row ? Number(row.series_id) : null;
}

// --- resume and history ------------------------------------------------------------------

/** What a resume or history row refers to. */
export type PlayKind = "live" | "vod" | "episode";

export async function readResume(
  db: SqlAdapter,
  kind: Exclude<PlayKind, "live">,
  ids?: readonly number[],
): Promise<Map<number, ResumePoint>> {
  if (ids && ids.length === 0) return new Map();
  const rows = await db.select<{
    id: number;
    position_secs: number;
    duration_secs: number | null;
    watched: number;
    updated_at: number;
  }>(
    `SELECT id, position_secs, duration_secs, watched, updated_at FROM resume WHERE kind = ?${
      ids ? ` AND id IN (${ids.map(() => "?").join(", ")})` : ""
    }`,
    [kind, ...(ids ?? [])],
  );
  return new Map(
    rows.map((r) => [
      Number(r.id),
      {
        positionSecs: Number(r.position_secs),
        durationSecs: num(r.duration_secs),
        watched: Number(r.watched) === 1,
        updatedAt: Number(r.updated_at),
      },
    ]),
  );
}

export async function writeResume(
  db: SqlAdapter,
  kind: Exclude<PlayKind, "live">,
  id: number,
  point: ResumePoint,
): Promise<void> {
  await db.execute(
    `INSERT OR REPLACE INTO resume (kind, id, position_secs, duration_secs, watched, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [kind, id, point.positionSecs, point.durationSecs, point.watched, point.updatedAt],
  );
}

export async function deleteResume(
  db: SqlAdapter,
  kind: Exclude<PlayKind, "live">,
  id: number,
): Promise<void> {
  await db.execute("DELETE FROM resume WHERE kind = ? AND id = ?", [kind, id]);
}

/** Records that something was watched (Home's "recently watched", M5). */
export async function recordHistory(
  db: SqlAdapter,
  kind: PlayKind,
  id: number,
  at: number,
): Promise<void> {
  await db.execute("INSERT OR REPLACE INTO history (kind, id, watched_at) VALUES (?, ?, ?)", [
    kind,
    id,
    at,
  ]);
}
