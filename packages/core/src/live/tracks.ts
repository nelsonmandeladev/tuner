/**
 * Remembered audio and subtitle choice per channel (SPEC "Player"). Track ids
 * belong to one opening of a stream, so a choice is stored by what identifies
 * the track (language, title, codec) and its position among tracks of its
 * type, then matched against the next opening's tracks.
 */

export interface TrackInfo {
  id: number;
  lang: string | null;
  title: string | null;
  codec: string | null;
}

export interface TrackPick {
  lang: string | null;
  title: string | null;
  codec: string | null;
  /** Position among the stream's tracks of this type. */
  index: number;
}

export interface TrackChoice {
  /** Null: no audio choice made. */
  audio: TrackPick | null;
  /** "off": subtitles turned off. Null: no choice made. */
  sub: TrackPick | "off" | null;
}

export const noTrackChoice: TrackChoice = { audio: null, sub: null };

/** Settings key for a channel's choice. */
export const trackChoiceKey = (kind: "live" | "vod" | "series", id: number) =>
  `tracks:${kind}:${id}`;

export function pickOf(tracks: readonly TrackInfo[], id: number): TrackPick | null {
  const index = tracks.findIndex((t) => t.id === id);
  if (index === -1) return null;
  const t = tracks[index]!;
  return { lang: t.lang, title: t.title, codec: t.codec, index };
}

/**
 * The track in `tracks` that best matches `pick`: same language, title and
 * codec; then language and title; then language alone; then the same
 * position. Null when nothing fits.
 */
export function matchTrack(tracks: readonly TrackInfo[], pick: TrackPick): number | null {
  // Without a language or a title, a track has no identity: only its position counts.
  const identified = pick.lang !== null || pick.title !== null;
  const tests: ((t: TrackInfo) => boolean)[] = [
    (t) => t.lang === pick.lang && t.title === pick.title && t.codec === pick.codec,
    (t) => t.lang === pick.lang && t.title === pick.title,
    (t) => pick.lang !== null && t.lang === pick.lang,
  ];
  for (const test of identified ? tests : []) {
    const found = tracks.find(test);
    if (found) return found.id;
  }
  return tracks[pick.index]?.id ?? null;
}
