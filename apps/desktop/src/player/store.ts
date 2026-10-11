import { create } from "zustand";

export interface Track {
  id: number;
  type: "audio" | "sub";
  title: string | null;
  lang: string | null;
  codec: string | null;
  channels: number | null;
  selected: boolean;
}

export interface VideoInfo {
  codec: string | null;
  width: number | null;
  height: number | null;
}

export type PlayerStatus = "idle" | "loading" | "playing" | "reconnecting" | "ended" | "error";

/** One timed load: from the load command to mpv's first frame (`playback-restart`). */
export interface LoadTiming {
  kind: "first" | "zap";
  label: string;
  /** Request (user action, or the load command) → first frame. */
  totalMs: number;
  /**
   * Request → mpv's `start-file` event: what the app spends before mpv opens
   * the stream, plus one event's trip back to the webview.
   */
  startMs: number | null;
  /** Request → the load command accepted (keychain, URL, IPC): the app's own share. */
  issuedMs: number | null;
  /** Load command → `file-loaded` (connect + probe). */
  openedMs: number | null;
  /** Load command → `video-reconfig` (decoder and video output ready). */
  videoMs: number | null;
}

export interface PlayerState {
  status: PlayerStatus;
  /** What is loaded, for the overlay (never a URL). */
  label: string | null;
  live: boolean;
  paused: boolean;
  /**
   * A picture is on screen: true from a first frame until the player stops.
   * A zap keeps it true, because mpv keeps the last frame up until the next
   * stream's first frame replaces it.
   */
  shown: boolean;
  /** Waiting on the network: opening, or stalled while playing. */
  buffering: boolean;
  timePos: number | null;
  duration: number | null;
  volume: number;
  mute: boolean;
  audioTracks: Track[];
  subtitleTracks: Track[];
  video: VideoInfo;
  hwdec: string | null;
  reconnectAttempt: number;
  error: string | null;
  /** `start-file` events seen. Proves that moving or resizing the video never reloads it. */
  loads: number;
  timings: LoadTiming[];
}

export const initialPlayerState: PlayerState = {
  status: "idle",
  label: null,
  live: false,
  paused: false,
  shown: false,
  buffering: false,
  timePos: null,
  duration: null,
  volume: 100,
  mute: false,
  audioTracks: [],
  subtitleTracks: [],
  video: { codec: null, width: null, height: null },
  hwdec: null,
  reconnectAttempt: 0,
  error: null,
  loads: 0,
  timings: [],
};

/** Written only by the player controller; components read it. */
export const usePlayer = create<PlayerState>(() => initialPlayerState);
