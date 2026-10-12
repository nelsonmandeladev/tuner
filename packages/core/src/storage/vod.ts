/**
 * Movies and series reads, the detail caches, episodes, resume points and
 * history (ROADMAP M4). Resume and history rows are keyed by id and kind, so
 * they survive every sync.
 */

import type { SqlAdapter } from "../adapters";
import { foldText } from "../text";
import { RESUME_MIN_SECS, type ResumePoint } from "../vod/resume";
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
export function readVodItems(db: SqlAdapter): Promise<VodItem[]> {
  return selectVod(db, "ORDER BY position");
}

/** One movie, or null if the last sync no longer lists it. */
export async function readVodItem(db: SqlAdapter, id: number): Promise<VodItem | null> {
  return (await selectVod(db, "WHERE id = ?", [id]))[0] ?? null;
}

/**
 * Items of a kind that a hidden category does not hide (SPEC §3: hidden
 * categories disappear everywhere): listed in at least one visible category,
 * or anything when nothing is hidden. `alias` is the item table's name in the query.
 */
const visibleIn = (kind: "vod" | "series", alias: string) =>
  `(NOT EXISTS (SELECT 1 FROM hidden_categories WHERE kind = '${kind}')
    OR EXISTS (SELECT 1 FROM category_items m WHERE m.kind = '${kind}' AND m.item_id = ${alias}.id
      AND NOT EXISTS (SELECT 1 FROM hidden_categories h WHERE h.kind = '${kind}' AND h.id = m.category_id)))`;

/** The most recently added movies (`added`), outside hidden categories (Home, SPEC §2). */
export function readRecentVod(db: SqlAdapter, limit: number): Promise<VodItem[]> {
  return selectVod(
    db,
    `WHERE added_at IS NOT NULL AND ${visibleIn("vod", "vod")} ORDER BY added_at DESC, position LIMIT ?`,
    [limit],
  );
}

/**
 * Movies like this one, for its detail page: those sharing the most of its
 * categories (the list API has no genre), then the best rated, then the
 * newest. Hidden categories do not count. The same film listed again (another
 * quality, another language) is the caller's to merge by title.
 */
export async function readRelatedVod(
  db: SqlAdapter,
  id: number,
  limit: number,
): Promise<VodItem[]> {
  const rows = await db.select<{
    id: number;
    name: string;
    icon: string | null;
    rating: number | null;
    added_at: number | null;
    ext: string;
  }>(
    `SELECT v.id, v.name, v.icon, v.rating, v.added_at, v.ext
     FROM category_items mine
     JOIN category_items other
       ON other.kind = 'vod' AND other.category_id = mine.category_id AND other.item_id <> mine.item_id
     JOIN vod v ON v.id = other.item_id
     WHERE mine.kind = 'vod' AND mine.item_id = ?
       AND NOT EXISTS (SELECT 1 FROM hidden_categories h WHERE h.kind = 'vod' AND h.id = other.category_id)
     GROUP BY v.id
     ORDER BY COUNT(*) DESC, v.rating IS NULL, v.rating DESC, v.added_at DESC, v.position
     LIMIT ?`,
    [id, limit],
  );
  return rows.map((r) => ({
    id: Number(r.id),
    name: r.name,
    icon: r.icon,
    rating: num(r.rating),
    addedAt: num(r.added_at),
    ext: r.ext,
  }));
}

/** The most recently updated series (`last_modified`), outside hidden categories. */
export function readRecentSeries(db: SqlAdapter, limit: number): Promise<SeriesItem[]> {
  return selectSeries(
    db,
    `WHERE last_modified_at IS NOT NULL AND ${visibleIn("series", "series")}
     ORDER BY last_modified_at DESC, position LIMIT ?`,
    [limit],
  );
}

async function selectVod(db: SqlAdapter, tail: string, params: number[] = []): Promise<VodItem[]> {
  const rows = await db.select<{
    id: number;
    name: string;
    icon: string | null;
    rating: number | null;
    added_at: number | null;
    ext: string;
  }>(`SELECT id, name, icon, rating, added_at, ext FROM vod ${tail}`, params);
  return rows.map((r) => ({
    id: Number(r.id),
    name: r.name,
    icon: r.icon,
    rating: num(r.rating),
    addedAt: num(r.added_at),
    ext: r.ext,
  }));
}

export function readSeriesItems(db: SqlAdapter): Promise<SeriesItem[]> {
  return selectSeries(db, "ORDER BY position");
}

/** One series, or null if the last sync no longer lists it. */
export async function readSeriesItem(db: SqlAdapter, id: number): Promise<SeriesItem | null> {
  return (await selectSeries(db, "WHERE id = ?", [id]))[0] ?? null;
}

async function selectSeries(
  db: SqlAdapter,
  tail: string,
  params: number[] = [],
): Promise<SeriesItem[]> {
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
     FROM series ${tail}`,
    params,
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

interface EpisodeRow {
  id: number;
  season: number | null;
  episode_num: number | null;
  title: string | null;
  ext: string;
  duration_secs: number | null;
  image: string | null;
  plot: string | null;
  rating: number | null;
  release_date: string | null;
}

const EPISODE_COLUMNS = `e.id, e.season, e.episode_num, e.title, e.ext, e.duration_secs, e.image,
  e.plot, e.rating, e.release_date`;

const fromEpisodeRow = (r: EpisodeRow): Episode => ({
  id: Number(r.id),
  season: num(r.season),
  episodeNum: num(r.episode_num),
  title: r.title,
  ext: r.ext,
  durationSecs: num(r.duration_secs),
  image: r.image,
  plot: r.plot,
  rating: num(r.rating),
  releaseDate: r.release_date,
});

/** A series' episodes as stored when its page was last opened (any order). */
export async function readEpisodes(db: SqlAdapter, seriesId: number): Promise<Episode[]> {
  const rows = await db.select<EpisodeRow>(
    `SELECT ${EPISODE_COLUMNS} FROM episodes e WHERE e.series_id = ?`,
    [seriesId],
  );
  return rows.map(fromEpisodeRow);
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

/** A movie or an episode in progress (Home's hero and Continue watching, SPEC §2). */
export type InProgress =
  | { kind: "vod"; id: number; point: ResumePoint; movie: VodItem }
  | {
      kind: "episode";
      id: number;
      point: ResumePoint;
      episode: Episode;
      series: { id: number; name: string; cover: string | null; backdrop: string | null };
    };

interface PointRow {
  position_secs: number;
  duration_secs: number | null;
  watched: number;
  updated_at: number;
}

const pointOf = (r: PointRow): ResumePoint => ({
  positionSecs: Number(r.position_secs),
  durationSecs: num(r.duration_secs),
  watched: Number(r.watched) === 1,
  updatedAt: Number(r.updated_at),
});

/**
 * Movies and episodes started and not finished, most recent first: one entry
 * per series (its latest episode). Items the library no longer lists, and
 * episodes whose series page was never opened, are left out.
 */
export async function readInProgress(db: SqlAdapter, limit: number): Promise<InProgress[]> {
  const point = "r.position_secs, r.duration_secs, r.watched, r.updated_at";
  const unfinished = "r.watched = 0 AND r.position_secs >= ?";
  const [movies, episodes] = await Promise.all([
    db.select<
      PointRow & {
        id: number;
        name: string;
        icon: string | null;
        rating: number | null;
        added_at: number | null;
        ext: string;
      }
    >(
      `SELECT v.id, v.name, v.icon, v.rating, v.added_at, v.ext, ${point}
       FROM resume r JOIN vod v ON v.id = r.id
       WHERE r.kind = 'vod' AND ${unfinished} ORDER BY r.updated_at DESC LIMIT ?`,
      [RESUME_MIN_SECS, limit],
    ),
    db.select<
      PointRow &
        EpisodeRow & {
          series_id: number;
          series_name: string;
          cover: string | null;
          backdrop: string | null;
        }
    >(
      `SELECT ${EPISODE_COLUMNS}, s.id AS series_id, s.name AS series_name, s.cover, s.backdrop, ${point}
       FROM resume r JOIN episodes e ON e.id = r.id JOIN series s ON s.id = e.series_id
       WHERE r.kind = 'episode' AND ${unfinished} ORDER BY r.updated_at DESC LIMIT ?`,
      [RESUME_MIN_SECS, limit * 4],
    ),
  ]);
  const items: InProgress[] = movies.map((r) => ({
    kind: "vod",
    id: Number(r.id),
    point: pointOf(r),
    movie: {
      id: Number(r.id),
      name: r.name,
      icon: r.icon,
      rating: num(r.rating),
      addedAt: num(r.added_at),
      ext: r.ext,
    },
  }));
  const seenSeries = new Set<number>();
  for (const r of episodes) {
    const seriesId = Number(r.series_id);
    if (seenSeries.has(seriesId)) continue;
    seenSeries.add(seriesId);
    items.push({
      kind: "episode",
      id: Number(r.id),
      point: pointOf(r),
      episode: fromEpisodeRow(r),
      series: { id: seriesId, name: r.series_name, cover: r.cover, backdrop: r.backdrop },
    });
  }
  return items.sort((a, b) => b.point.updatedAt - a.point.updatedAt).slice(0, limit);
}

/** A movie or series a person is credited in. */
export interface PersonCredit {
  kind: "vod" | "series";
  id: number;
  name: string;
  image: string | null;
  releaseDate: string | null;
  role: "director" | "cast";
}

/** True when `person` is one of the comma-separated names in `list` (accents and case ignored). */
function credits(list: string | null | undefined, person: string): boolean {
  if (!list) return false;
  return list.split(",").some((name) => foldText(name) === person);
}

/**
 * Titles that credit a person (a detail page's cast). The list API carries
 * cast and director for series only; movies are known once their details
 * were fetched (opened at least once), so movies come from the details cache.
 */
export async function readPersonCredits(db: SqlAdapter, person: string): Promise<PersonCredit[]> {
  const folded = foldText(person);
  if (folded === "") return [];
  const [series, movies] = await Promise.all([
    db.select<{
      id: number;
      name: string;
      cover: string | null;
      release_date: string | null;
      cast_names: string | null;
      director: string | null;
    }>(
      // SQLite's LIKE cannot ignore accents: the few thousand rows are matched here instead.
      `SELECT id, name, cover, release_date, cast_names, director FROM series
       WHERE cast_names IS NOT NULL OR director IS NOT NULL ORDER BY position`,
    ),
    db.select<{ id: number; name: string; icon: string | null; json: string }>(
      `SELECT v.id, v.name, v.icon, d.json FROM details_cache d JOIN vod v ON v.id = d.id
       WHERE d.kind = 'vod' ORDER BY v.position`,
    ),
  ]);
  const found: PersonCredit[] = [];
  for (const m of movies) {
    let info: { cast?: string | null; director?: string | null; releaseDate?: string | null };
    try {
      info = JSON.parse(m.json) as typeof info;
    } catch {
      continue;
    }
    const role = credits(info.director, folded)
      ? "director"
      : credits(info.cast, folded)
        ? "cast"
        : null;
    if (role) {
      found.push({
        kind: "vod",
        id: Number(m.id),
        name: m.name,
        image: m.icon,
        releaseDate: info.releaseDate ?? null,
        role,
      });
    }
  }
  for (const s of series) {
    const role = credits(s.director, folded)
      ? "director"
      : credits(s.cast_names, folded)
        ? "cast"
        : null;
    if (role) {
      found.push({
        kind: "series",
        id: Number(s.id),
        name: s.name,
        image: s.cover,
        releaseDate: s.release_date,
        role,
      });
    }
  }
  return found;
}
