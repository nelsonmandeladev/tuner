/** Display formatting for times, durations and stream details. */

const clock = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });
const weekday = new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric" });

/** "19:30" in the user's time zone. */
export function formatClock(ms: number): string {
  return clock.format(ms);
}

/** "38m", "1h 32m": time left in a programme. */
export function formatLeft(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

/** "Today", "Yesterday" or "Fri 9", for grouping catch-up programmes. */
export function formatDay(ms: number, now = Date.now()): string {
  const day = (t: number) => new Date(t).toDateString();
  if (day(ms) === day(now)) return "Today";
  if (day(ms) === day(now - 86_400_000)) return "Yesterday";
  return weekday.format(ms);
}

/** "1:02:05" / "42:10": a position in a recording. */
export function formatPosition(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rest = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${rest}` : `${m}:${rest}`;
}

const VIDEO_CODECS: Record<string, string> = {
  h264: "H.264",
  hevc: "HEVC",
  mpeg2video: "MPEG-2",
  av1: "AV1",
  vp9: "VP9",
};
const AUDIO_CODECS: Record<string, string> = {
  aac: "AAC",
  ac3: "AC3",
  eac3: "E-AC3",
  mp2: "MP2",
  mp3: "MP3",
  opus: "Opus",
  dts: "DTS",
};

/** "5.1", "2.0" from a channel count. */
export function channelLayout(channels: number | null): string | null {
  if (!channels) return null;
  if (channels === 1) return "Mono";
  if (channels === 6) return "5.1";
  if (channels === 8) return "7.1";
  return `${channels}.0`;
}

export function videoCodecName(codec: string | null): string | null {
  return codec ? (VIDEO_CODECS[codec] ?? codec.toUpperCase()) : null;
}

export function audioCodecName(codec: string | null): string | null {
  return codec ? (AUDIO_CODECS[codec] ?? codec.toUpperCase()) : null;
}

/** "1080p", "4K". */
export function resolutionName(height: number | null): string | null {
  if (!height) return null;
  return height >= 2000 ? "4K" : `${height}p`;
}

const ISO_639_2: Record<string, string> = {
  eng: "en",
  fre: "fr",
  fra: "fr",
  ger: "de",
  deu: "de",
  spa: "es",
  ita: "it",
  por: "pt",
  ara: "ar",
  dut: "nl",
  nld: "nl",
  tur: "tr",
  pol: "pl",
  rus: "ru",
};
const languageNames = new Intl.DisplayNames(undefined, { type: "language" });

/** "English" from "eng" or "en"; null for unknown or missing codes. */
export function languageName(code: string | null): string | null {
  if (!code || code === "und") return null;
  try {
    const name = languageNames.of(ISO_639_2[code] ?? code);
    // Some locales write language names in lower case ("français"); a label starts with a capital.
    return name ? name.charAt(0).toLocaleUpperCase() + name.slice(1) : null;
  } catch {
    return null;
  }
}
