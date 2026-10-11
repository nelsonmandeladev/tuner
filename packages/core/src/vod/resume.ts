/**
 * Resume points and episode order (SPEC §5–6): position saved every 10 s and
 * on close, watched at 90%, and the next episode after the current one.
 */

import type { Episode } from "../xtream/schemas";

/** Save the position this often while playing. */
export const RESUME_SAVE_MS = 10_000;
/** A movie or episode counts as watched from this fraction on. */
export const WATCHED_AT = 0.9;
/** Below this, starting again from the beginning is simpler than resuming. */
export const RESUME_MIN_SECS = 30;

export interface ResumePoint {
  positionSecs: number;
  durationSecs: number | null;
  watched: boolean;
  updatedAt: number;
}

export function isWatched(positionSecs: number, durationSecs: number | null): boolean {
  return !!durationSecs && durationSecs > 0 && positionSecs / durationSecs >= WATCHED_AT;
}

/** Where playback should start: the saved position, unless it is too early or already watched. */
export function resumeFrom(point: ResumePoint | null | undefined): number | null {
  if (!point || point.watched || point.positionSecs < RESUME_MIN_SECS) return null;
  return point.positionSecs;
}

/** 0–1 progress for a resume bar. Watched items are full. */
export function resumeProgress(point: ResumePoint | null | undefined): number {
  if (!point) return 0;
  if (point.watched) return 1;
  return point.durationSecs ? Math.min(1, point.positionSecs / point.durationSecs) : 0;
}

/** Episodes in viewing order: by season, then episode number, then id. */
export function sortEpisodes(episodes: readonly Episode[]): Episode[] {
  return [...episodes].sort(
    (a, b) =>
      (a.season ?? 0) - (b.season ?? 0) || (a.episodeNum ?? 0) - (b.episodeNum ?? 0) || a.id - b.id,
  );
}

/** The episode after `id` in viewing order, crossing into the next season. Null after the last. */
export function nextEpisode(episodes: readonly Episode[], id: number): Episode | null {
  const ordered = sortEpisodes(episodes);
  const index = ordered.findIndex((e) => e.id === id);
  return index === -1 ? null : (ordered[index + 1] ?? null);
}

/**
 * The episode to offer on a series page: the one in progress most recently,
 * else the one after the last watched, else the first.
 */
export function episodeToPlay(
  episodes: readonly Episode[],
  resume: ReadonlyMap<number, ResumePoint>,
): { episode: Episode; resume: boolean } | null {
  const ordered = sortEpisodes(episodes);
  if (ordered.length === 0) return null;
  let latest: { episode: Episode; point: ResumePoint } | null = null;
  for (const episode of ordered) {
    const point = resume.get(episode.id);
    if (point && (!latest || point.updatedAt > latest.point.updatedAt)) latest = { episode, point };
  }
  if (!latest) return { episode: ordered[0]!, resume: false };
  if (!latest.point.watched && resumeFrom(latest.point) !== null)
    return { episode: latest.episode, resume: true };
  const next = latest.point.watched ? nextEpisode(ordered, latest.episode.id) : latest.episode;
  return next ? { episode: next, resume: false } : { episode: ordered[0]!, resume: false };
}
