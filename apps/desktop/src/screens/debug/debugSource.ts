import { invoke } from "@tauri-apps/api/core";
import type { PlayerSource } from "../../player/controller";
import { mpv } from "../../player/mpv";

export type DebugKind = "live" | "movie" | "series";

export interface DebugPick {
  kind: DebugKind;
  id: number;
  /** `ts` / `m3u8` for live, the item's `container_extension` for VOD. */
  ext: string;
}

/**
 * A stream from the dev account in `.env.local`. Rust builds the URL and loads
 * it into mpv (src-tauri/src/debug_stream.rs); the webview only sends the id.
 */
export function debugSource(pick: DebugPick): PlayerSource {
  return {
    label: `${pick.kind} ${pick.id}.${pick.ext}`,
    live: pick.kind === "live",
    load: () => invoke("debug_stream_load", { source: pick }),
  };
}

/** Sends an already-redacted line to the `tauri dev` terminal. */
export function debugTrace(line: string) {
  void invoke("debug_trace", { line: `${Math.round(performance.now())} ${line}` });
}

/** A generated FFmpeg test pattern: exercises the video path without touching the provider. */
export const testPattern: PlayerSource = {
  label: "test pattern",
  live: false,
  load: () => mpv.loadfile("av://lavfi:testsrc2=size=1920x1080:rate=30"),
};
