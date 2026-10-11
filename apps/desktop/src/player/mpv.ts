/**
 * The app's single libmpv instance (CLAUDE.md rule 5).
 *
 * mpv draws into the main window under the transparent webview
 * (tauri-plugin-libmpv, docs/DECISIONS.md D2). The Live TV preview and the
 * full-screen player are the same instance: only the video rectangle moves
 * (see `VideoSurface`). It is created once and lives as long as the window;
 * the plugin destroys it when the window closes.
 *
 * Never observe or read `path`, `filename` or `stream-open-filename`: they hold
 * the stream URL, which contains the password.
 */

import {
  command,
  getProperty,
  init,
  listenEvents,
  setProperty,
  setVideoMarginRatio,
  type MpvConfig,
  type MpvEvent,
  type MpvObservableProperty,
  type VideoMarginRatio,
} from "tauri-plugin-libmpv-api";

/** A desktop browser agent: some providers reject unknown ones (XTREAM_API.md "Quirks"). */
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

export const OBSERVED_PROPERTIES = [
  ["pause", "flag"],
  ["time-pos", "double", "none"],
  ["duration", "double", "none"],
  ["paused-for-cache", "flag"],
  ["seeking", "flag"],
  ["eof-reached", "flag", "none"],
  ["volume", "double"],
  ["mute", "flag"],
  ["track-list", "node"],
  ["hwdec-current", "string", "none"],
  ["width", "int64", "none"],
  ["height", "int64", "none"],
] as const satisfies MpvObservableProperty[];

/** Options that shape the instance itself. They only apply when it is created. */
const config: MpvConfig = {
  initialOptions: {
    vo: "gpu-next",
    // Stay alive with no file loaded, and keep the last frame on screen at the
    // end of a file instead of unloading it (a dropped live stream "ends").
    idle: "yes",
    "keep-open": "yes",
    "force-window": "yes",
    // React draws every control: no mpv OSD, OSC or input handling.
    "osd-level": 0,
    "input-default-bindings": "no",
    "input-vo-keyboard": "no",
  },
  observedProperties: OBSERVED_PROPERTIES,
};

/**
 * Playback tuning, set as properties so it can change at runtime (Settings will
 * change decoding and buffering later). Each takes effect from the next load.
 */
// Values are strings: mpv parses a string for any option type, while a JSON number
// reaches it as a double, which integer options such as probesize reject.
const playbackOptions: Record<string, string> = {
  // Hardware decoding where it is known to be safe. If the hardware decoder
  // fails mid-stream, lavc drops to software after a few bad frames.
  hwdec: "auto-safe",
  "vd-lavc-software-fallback": "yes",
  // A stalled stream ends after 10 s instead of hanging, so reconnect can run.
  "network-timeout": "10",
  "user-agent": USER_AGENT,
  // FFmpeg follows the provider's 302 to the streaming host but keeps the
  // first keep-alive socket open, even after stop. The provider counts it
  // against max_connections (often 1). Asking for close drops it at once.
  "http-header-fields": "Connection: close",
  // Live MPEG-TS arrives at real-time rate, so FFmpeg's stream-info probe
  // (avformat_find_stream_info) costs ~1.5 s of wall time before the first
  // frame. TS and HLS declare their streams up front (PMT), so only run the
  // probe when opening finds no streams at all.
  "demuxer-lavf-probe-info": "nostreams",
};

let ready: Promise<void> | null = null;

/** Creates the instance on first call; later calls return the same promise. */
export function ensureMpv(): Promise<void> {
  ready ??= (async () => {
    await init(config);
    for (const [name, value] of Object.entries(playbackOptions)) {
      await setProperty(name, value);
    }
  })().catch((error: unknown) => {
    ready = null;
    throw error;
  });
  return ready;
}

export function onMpvEvent(callback: (event: MpvEvent) => void) {
  return listenEvents(callback);
}

export const mpv = {
  /** Plays a URL. Only for URLs that never contain credentials; streams load through Rust. */
  loadfile: (url: string) => command("loadfile", [url, "replace"]),
  stop: () => command("stop"),
  setPause: (paused: boolean) => setProperty("pause", paused),
  seekTo: (seconds: number) => command("seek", [seconds, "absolute"]),
  seekBy: (seconds: number) => command("seek", [seconds, "relative"]),
  setVolume: (volume: number) => setProperty("volume", volume),
  setMute: (mute: boolean) => setProperty("mute", mute),
  /**
   * `id` from `track-list`, or "no" to turn the track off. Sent as a string:
   * a JSON number reaches mpv as a double, which the integer `aid`/`sid` reject.
   */
  setAudioTrack: (id: number | "no") => setProperty("aid", String(id)),
  setSubtitleTrack: (id: number | "no") => setProperty("sid", String(id)),
  setHwdec: (mode: "auto-safe" | "no") => setProperty("hwdec", mode),
  setVideoMargins: (ratio: VideoMarginRatio) => setVideoMarginRatio(ratio),
  getNumber: (name: string) => getProperty(name, "double"),
};
