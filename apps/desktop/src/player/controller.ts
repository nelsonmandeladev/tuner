/**
 * Playback state machine over the single mpv instance.
 *
 * - `open()` loads a source with `loadfile … replace`: mpv stops the current
 *   file (and closes its connection) before it opens the next one, so zapping
 *   never holds two connections (CLAUDE.md rule 5).
 * - A live stream that drops (error, or EOF on something that never ends) is
 *   reloaded up to 3 times with 1 s / 2 s / 4 s backoff while the overlay shows
 *   "Reconnecting…" over the last frame. The count resets once playback has
 *   been stable for 15 s, so a flapping stream cannot loop forever.
 * - Hardware decoding (on by default, Settings): `hwdec=auto-safe`; lavc drops to
 *   software after repeated decode errors. If a load still fails after the
 *   decoder was configured but before the first frame, the next try runs with
 *   `hwdec=no` (once per source).
 * - Each open is timed from the load command to `playback-restart`, mpv's
 *   signal that the first frame is up and playback has started.
 *
 * Everything that may be logged goes through `redact()`.
 */

import { redact } from "@tuner/core";
import type { MpvEvent } from "tauri-plugin-libmpv-api";
import { ensureMpv, mpv, onMpvEvent, preferredHwdec } from "./mpv";
import { initialPlayerState, usePlayer, type LoadTiming, type Track } from "./store";

export interface PlayerSource {
  /** Shown in the overlay and in timings. Never a URL. */
  label: string;
  live: boolean;
  /** Asks mpv to load the stream (`loadfile … replace`). Called again on every reconnect. */
  load: () => Promise<void>;
  /**
   * Another way to open the same thing, tried once if this source fails
   * before its first frame (catch-up URL forms differ between panels).
   */
  fallback?: () => PlayerSource | null;
  /** Called at the first frame of a user-initiated open. */
  onFirstFrame?: () => void;
}

export interface OpenOptions {
  /**
   * `performance.now()` of the user action that asked for this stream. Timings
   * run from it, so they include everything the app does before mpv starts.
   */
  requestedAt?: number;
}

/** Shown when mpv cannot start at all (not a stream problem). */
export const PLAYER_START_FAILED =
  "The video player could not start on this computer. Reinstall Tuner, then try again.";

const MAX_RECONNECTS = 3;
const BACKOFF_MS = [1000, 2000, 4000] as const;
const STABLE_AFTER_MS = 15_000;

interface PendingLoad {
  t0: number;
  /** Set for user-initiated opens; reconnects are not timed. */
  timing: LoadTiming["kind"] | null;
  /** True until mpv reports `start-file` for this load (the old file's events still arrive until then). */
  awaitingStart: boolean;
  startMs: number | null;
  issuedMs: number | null;
  openedMs: number | null;
  videoMs: number | null;
}

let current: PlayerSource | null = null;
let pending: PendingLoad | null = null;
let attempt = 0;
let hwdecFallback = false;
let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
let stableTimer: ReturnType<typeof setTimeout> | undefined;
let pausedForCache = false;
let traceSink: ((line: string) => void) | null = null;

const set = usePlayer.setState;

function trace(line: string) {
  traceSink?.(redact(line));
}

/** Debug only: receives one line per player event, already redacted. */
export function setPlayerTrace(sink: ((line: string) => void) | null) {
  traceSink = sink;
}

let started: Promise<void> | null = null;

/** Creates the mpv instance and subscribes to its events, once per app run. */
export function startPlayer(): Promise<void> {
  started ??= (async () => {
    await ensureMpv();
    await onMpvEvent(handleEvent);
  })().catch((error: unknown) => {
    started = null;
    throw error;
  });
  return started;
}

export async function open(source: PlayerSource, { requestedAt }: OpenOptions = {}) {
  const t0 = requestedAt ?? performance.now();
  try {
    await startPlayer();
  } catch (error) {
    // libmpv could not be loaded or created (a missing runtime DLL on a clean
    // PC, seen in M6): say so instead of loading forever. Retry tries again.
    trace(`player start failed: ${String(error)}`);
    current = source;
    set({
      status: "error",
      label: source.label,
      live: source.live,
      buffering: false,
      error: PLAYER_START_FAILED,
    });
    return;
  }
  clearTimers();
  const { status } = usePlayer.getState();
  const zapping = status === "playing" || status === "loading" || status === "reconnecting";

  current = source;
  attempt = 0;
  if (hwdecFallback) {
    hwdecFallback = false;
    await mpv.setHwdec(preferredHwdec());
  }
  set({
    status: "loading",
    ...(zapping ? {} : { shown: false }),
    label: source.label,
    live: source.live,
    error: null,
    reconnectAttempt: 0,
    buffering: true,
    timePos: null,
    duration: null,
  });
  trace(`open "${source.label}" (${zapping ? "zap" : "first"})`);
  await load(zapping ? "zap" : "first", t0);
}

export async function stop() {
  clearTimers();
  current = null;
  pending = null;
  await mpv.stop();
  set({ ...resetPlayback(), status: "idle", label: null, shown: false });
}

/** Opens the current source again, e.g. from the error state's retry button. */
export function retry() {
  if (current) return open(current);
}

/** Dev only: runs the reconnect path as if the live stream had just dropped. */
export function simulateDrop() {
  if (import.meta.env.DEV) failed("simulated drop");
}

export const togglePause = () => mpv.setPause(!usePlayer.getState().paused);
export const toggleMute = () => mpv.setMute(!usePlayer.getState().mute);
export const seekBy = mpv.seekBy;
export const seekTo = mpv.seekTo;
export const setVolume = mpv.setVolume;
export const setAudioTrack = mpv.setAudioTrack;
export const setSubtitleTrack = mpv.setSubtitleTrack;

async function load(timing: PendingLoad["timing"], t0 = performance.now()) {
  const source = current;
  if (!source) return;
  const load: PendingLoad = {
    t0,
    timing,
    awaitingStart: true,
    startMs: null,
    issuedMs: null,
    openedMs: null,
    videoMs: null,
  };
  pending = load;
  try {
    await source.load();
    load.issuedMs = performance.now() - t0;
  } catch (error) {
    if (source !== current) return;
    trace(`load failed: ${String(error)}`);
    pending = null;
    set({ status: "error", buffering: false, error: redact(String(error)) });
  }
}

function handleEvent(event: MpvEvent) {
  const now = performance.now();
  switch (event.event) {
    case "start-file":
      set((s) => ({ loads: s.loads + 1 }));
      if (pending?.awaitingStart) {
        pending.awaitingStart = false;
        pending.startMs = now - pending.t0;
      }
      trace("start-file");
      break;
    case "file-loaded":
      if (pending && !pending.awaitingStart) {
        pending.openedMs = now - pending.t0;
        // keep-open=yes pauses mpv at the end of a file, and pause outlives
        // the file: the next episode (or a live reconnect after an end of
        // stream) would show its first frame and stay paused (seen in M4).
        // Unpausing earlier does not stick: the old file is still at its end
        // and pauses again.
        if (usePlayer.getState().paused) void mpv.setPause(false);
      }
      trace("file-loaded");
      break;
    case "video-reconfig":
      if (pending && !pending.awaitingStart) pending.videoMs ??= now - pending.t0;
      break;
    case "playback-restart":
      // Also fires after every seek; only the first one after a load is a "first frame".
      if (pending && !pending.awaitingStart) firstFrame(pending, now);
      break;
    case "end-file":
      trace(`end-file ${event.reason}${event.error ? ` (${event.error})` : ""}`);
      // The file being replaced by an open/zap reports "stop": expected.
      if (event.reason === "stop" || pending?.awaitingStart) break;
      if (event.reason === "error" || current?.live) failed(`end-file ${event.reason}`);
      else set({ status: "ended", buffering: false });
      break;
    case "property-change":
      onProperty(event.name, event.data);
      break;
  }
}

function firstFrame(load: PendingLoad, now: number) {
  pending = null;
  if (load.timing && current) {
    const timing: LoadTiming = {
      kind: load.timing,
      label: current.label,
      totalMs: Math.round(now - load.t0),
      startMs: load.startMs === null ? null : Math.round(load.startMs),
      issuedMs: load.issuedMs === null ? null : Math.round(load.issuedMs),
      openedMs: load.openedMs === null ? null : Math.round(load.openedMs),
      videoMs: load.videoMs === null ? null : Math.round(load.videoMs),
    };
    set((s) => ({ timings: [...s.timings, timing] }));
    current.onFirstFrame?.();
    trace(
      `first frame ${timing.kind} ${timing.totalMs} ms (opened ${timing.openedMs}, video ${timing.videoMs})`,
    );
  } else {
    trace(`playing again after reconnect ${attempt}`);
  }
  set({
    status: "playing",
    shown: true,
    reconnectAttempt: 0,
    error: null,
    buffering: pausedForCache,
  });
  clearTimeout(stableTimer);
  stableTimer = setTimeout(() => (attempt = 0), STABLE_AFTER_MS);
}

function failed(why: string) {
  const source = current;
  if (!source) return;
  clearTimers();
  const decoderStartedNoFrame = pending !== null && pending.videoMs !== null;
  const { hwdec } = usePlayer.getState();

  if (decoderStartedNoFrame && !hwdecFallback && hwdec && hwdec !== "no") {
    hwdecFallback = true;
    trace(`${why}: retrying with software decoding`);
    void mpv.setHwdec("no").then(() => load(null));
    return;
  }
  const fallback = pending !== null ? source.fallback?.() : null;
  if (fallback) {
    trace(`${why}: trying the other URL form`);
    current = fallback;
    void load(pending?.timing ?? null, pending?.t0);
    return;
  }
  if (!source.live) {
    pending = null;
    set({ status: "error", buffering: false, error: "This video stopped playing." });
    return;
  }
  if (attempt >= MAX_RECONNECTS) {
    trace(`${why}: giving up after ${attempt} reconnects`);
    pending = null;
    set({
      status: "error",
      buffering: false,
      reconnectAttempt: 0,
      error: "The stream is not responding.",
    });
    return;
  }
  const delay = BACKOFF_MS[attempt] ?? BACKOFF_MS[BACKOFF_MS.length - 1];
  attempt += 1;
  trace(`${why}: reconnect ${attempt}/${MAX_RECONNECTS} in ${delay} ms`);
  set({ status: "reconnecting", reconnectAttempt: attempt, buffering: true });
  reconnectTimer = setTimeout(() => {
    if (source === current) void load(null);
  }, delay);
}

function onProperty(name: string, data: unknown) {
  switch (name) {
    case "pause":
      set({ paused: data === true });
      break;
    case "time-pos":
      set({ timePos: typeof data === "number" ? data : null });
      break;
    case "duration":
      set({ duration: typeof data === "number" ? data : null });
      break;
    case "seeking":
      trace(`seeking ${data === true}`);
      break;
    case "paused-for-cache":
      if (pausedForCache !== (data === true)) trace(`paused-for-cache ${data === true}`);
      pausedForCache = data === true;
      set((s) => ({
        buffering: pausedForCache || s.status === "loading" || s.status === "reconnecting",
      }));
      break;
    case "eof-reached":
      // keep-open=yes: the file stays loaded at its end, so EOF arrives here, not as end-file.
      if (data !== true || pending) break;
      trace("eof-reached");
      if (current?.live) failed("live stream ended");
      else set({ status: "ended", buffering: false });
      break;
    case "volume":
      if (typeof data === "number") set({ volume: data });
      break;
    case "mute":
      set({ mute: data === true });
      break;
    case "width":
    case "height":
      set((s) => ({ video: { ...s.video, [name]: typeof data === "number" ? data : null } }));
      break;
    case "hwdec-current":
      set({ hwdec: typeof data === "string" ? data : null });
      break;
    case "track-list":
      set(parseTracks(data));
      break;
  }
}

/** `track-list` is an mpv node: an array of objects with loosely typed fields. */
function parseTracks(data: unknown) {
  const items = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
  const str = (v: unknown) => (typeof v === "string" && v ? v : null);
  const num = (v: unknown) => (typeof v === "number" ? v : null);
  const tracks = (type: Track["type"]): Track[] =>
    items
      .filter((t) => t.type === type && typeof t.id === "number")
      .map((t) => ({
        id: t.id as number,
        type,
        title: str(t.title),
        lang: str(t.lang),
        codec: str(t.codec),
        channels: num(t["demux-channel-count"]),
        selected: t.selected === true,
      }));
  const video = items.find((t) => t.type === "video" && t.selected === true);
  return {
    audioTracks: tracks("audio"),
    subtitleTracks: tracks("sub"),
    video: {
      ...usePlayer.getState().video,
      codec: str(video?.codec),
    },
  };
}

function clearTimers() {
  clearTimeout(reconnectTimer);
  clearTimeout(stableTimer);
}

function resetPlayback() {
  const { status, label, live, timePos, duration, error, reconnectAttempt, buffering } =
    initialPlayerState;
  return { status, label, live, timePos, duration, error, reconnectAttempt, buffering };
}
