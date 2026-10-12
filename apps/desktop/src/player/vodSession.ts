/**
 * Movies and episodes while they play (SPEC §5–6):
 *
 * - The position is saved every 10 s, on pause, and whenever playback stops
 *   or moves to something else, so a crash or a closed window loses at most
 *   10 s. At 90% (or at the end) the item is marked watched.
 * - Near the end of an episode (10 s left, or at the end of the file if
 *   that comes first) the next one is offered; with autoplay on (the
 *   default) it starts after a 10-second countdown that can be cancelled.
 *   Some provider files stall a few seconds before their end and never
 *   report it (seen in M4), so the offer does not wait for the end.
 *
 * Watches the player and tuner stores; imported once for its side effects
 * (see PlaybackScope).
 */

import {
  RESUME_SAVE_MS,
  episodeTitle,
  isWatched,
  nextEpisode,
  writeResume,
  type Episode,
} from "@tuner/core";
import { readAutoplayNext } from "../data/details";
import { activeLibrary } from "../data/session";
import { movies } from "../data/catalog";
import { usePlayer } from "./store";
import { playVod, setUpNext, useTuner, type VodMedia } from "./tuner";

/** SPEC §6: the next episode starts after this countdown. */
export const UP_NEXT_COUNTDOWN_MS = 10_000;
/** The next episode is offered when this much of the current one is left. */
const UP_NEXT_LEAD_SECS = 10;

interface Position {
  media: VodMedia;
  pos: number;
  dur: number | null;
}

let last: Position | null = null;
let lastSavedAt = 0;
let countdown: ReturnType<typeof setTimeout> | undefined;
/** The episode the next one was already offered for (once per episode). */
let offeredFor: VodMedia | null = null;
/** Saves run one after another, so a later one never lands before an earlier one. */
let saving: Promise<void> = Promise.resolve();

function save(position: Position | null, options: { ended?: boolean } = {}): Promise<void> {
  saving = saving.then(() => write(position, options)).catch(() => undefined);
  return saving;
}

/**
 * Saves where the movie or episode is now and waits for every save to land.
 * Call before showing a page that reads resume points (leaving the player).
 */
export function flushResume(): Promise<void> {
  const { mode, media } = useTuner.getState();
  const { timePos, duration } = usePlayer.getState();
  if (mode === "vod" && media && timePos !== null && last?.media === media) {
    last = { media, pos: timePos, dur: duration };
    return save(last);
  }
  return saving;
}

async function write(position: Position | null, { ended = false } = {}) {
  const db = activeLibrary();
  if (!db || !position) return;
  const { media, dur } = position;
  const pos = ended && dur ? dur : position.pos;
  lastSavedAt = Date.now();
  await writeResume(db, media.kind, media.id, {
    positionSecs: pos,
    durationSecs: dur,
    watched: ended || isWatched(pos, dur),
    updatedAt: lastSavedAt,
  });
  if (media.kind === "vod") void movies.refreshProgress();
}

usePlayer.subscribe((state, prev) => {
  const { mode, media } = useTuner.getState();

  // Keep the last known position of what is playing.
  if (mode === "vod" && media && state.status === "playing" && state.timePos !== null) {
    if (last && last.media !== media) void save(last);
    last = { media, pos: state.timePos, dur: state.duration };
    if (Date.now() - lastSavedAt >= RESUME_SAVE_MS) void save(last);
    if (
      media.kind === "episode" &&
      offeredFor !== media &&
      state.duration &&
      state.duration - state.timePos <= UP_NEXT_LEAD_SECS
    ) {
      offeredFor = media;
      void offerNext(media);
    }
  }

  if (state.paused && !prev.paused) void save(last);

  if (state.status === "ended" && prev.status !== "ended" && last) {
    const ended = last;
    last = null;
    void save(ended, { ended: true });
    if (offeredFor !== ended.media) {
      offeredFor = ended.media;
      void offerNext(ended.media);
    }
  } else if (prev.status === "playing" && (state.status === "idle" || state.status === "error")) {
    // Stopped (left the player) or failed: keep where it got to.
    void save(last);
    last = null;
  }
});

// A new item replacing the old one saves the old one's position first.
useTuner.subscribe((state, prev) => {
  if (state.media !== prev.media && last && last.media !== state.media) {
    void save(last);
    last = null;
  }
  if (state.media !== prev.media || state.mode !== "vod") cancelUpNext();
});

async function offerNext(media: VodMedia) {
  if (media.kind !== "episode" || !media.series) return;
  const episode = nextEpisode(media.series.episodes, media.id);
  if (!episode) return;
  const autoplay = await readAutoplayNext();
  // Only if the user is still on that episode.
  if (useTuner.getState().media !== media) return;
  const playsAt = autoplay ? Date.now() + UP_NEXT_COUNTDOWN_MS : null;
  setUpNext({ episode, playsAt });
  if (playsAt !== null) countdown = setTimeout(() => playNext(), UP_NEXT_COUNTDOWN_MS);
}

/** Plays the offered (or the following) episode now. */
export function playNext(requestedAt?: number) {
  clearTimeout(countdown);
  const { media, upNext } = useTuner.getState();
  if (!media?.series) return;
  const episode = upNext?.episode ?? nextEpisode(media.series.episodes, media.id);
  if (episode) playVod(episodeMedia(media.series, episode), { requestedAt });
}

/** Cancels the countdown and closes the offer. */
export function cancelUpNext() {
  clearTimeout(countdown);
  if (useTuner.getState().upNext) setUpNext(null);
}

/** The player's description of an episode of `series`. */
export function episodeMedia(
  series: { id: number; name: string; episodes: Episode[] },
  episode: Episode,
): VodMedia {
  const code = [
    episode.season !== null ? `S${episode.season}` : null,
    episode.episodeNum !== null ? `E${episode.episodeNum}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return {
    kind: "episode",
    id: episode.id,
    ext: episode.ext,
    title: episodeTitle(episode.title, series.name) ?? (code || series.name),
    detail: code,
    series,
  };
}
