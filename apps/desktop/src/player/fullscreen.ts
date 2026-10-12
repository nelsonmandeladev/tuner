import { getCurrentWindow } from "@tauri-apps/api/window";
import type { NavigateFunction } from "react-router";
import { create } from "zustand";
import { useTuner } from "./tuner";
import { flushResume } from "./vodSession";

/** Whether the window is in OS full screen, as last set or read. */
export const useFullscreen = create<{ on: boolean }>(() => ({ on: false }));

const inTauri = "__TAURI_INTERNALS__" in window;

export async function setFullscreen(on: boolean) {
  useFullscreen.setState({ on });
  if (inTauri) await getCurrentWindow().setFullscreen(on);
}

export function toggleFullscreen() {
  return setFullscreen(!useFullscreen.getState().on);
}

/**
 * Opens the player on what is tuned, in full screen (Enter / double-click in
 * Live TV, Play on a detail page). Pass the stream's load: the window's
 * full-screen transition keeps the main thread busy for a few hundred ms,
 * which would delay the load command, so full screen waits for it (1 s at most).
 */
export async function enterPlayer(navigate: NavigateFunction, loading?: Promise<unknown>) {
  void navigate("/watch");
  if (loading) {
    await Promise.race([loading.catch(() => undefined), new Promise((r) => setTimeout(r, 1000))]);
  }
  await setFullscreen(true);
}

/**
 * Back from the player (Esc, the back button): to Live TV for channels and
 * catch-up, to the detail page for a movie or an episode. Leaves full screen too.
 */
export async function leavePlayer(navigate: NavigateFunction) {
  const { mode, returnTo } = useTuner.getState();
  // The detail page shows the resume point: let the last save land first.
  if (mode === "vod") await flushResume();
  await setFullscreen(false);
  void navigate(mode === "vod" ? (returnTo ?? "/movies") : "/live");
}
