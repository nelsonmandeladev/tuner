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
 * The history position the player was opened from. Leaving steps back to it,
 * so the player never stays in the history behind the page it returns to
 * (Back on a detail page would otherwise reopen the player; M5 review).
 */
let openedFrom: number | null = null;
const historyIndex = () => (window.history.state as { idx?: number } | null)?.idx ?? null;

/** Where the player goes back to when it was not opened by a step we can undo. */
export function playerFallback(): string {
  const { mode, returnTo } = useTuner.getState();
  return mode === "vod" ? (returnTo ?? "/movies") : "/live";
}

/**
 * Opens the player on what is tuned, in full screen (Enter / double-click in
 * Live TV, Play on a detail page). Pass the stream's load: the window's
 * full-screen transition keeps the main thread busy for a few hundred ms,
 * which would delay the load command, so full screen waits for it (1 s at most).
 */
export async function enterPlayer(navigate: NavigateFunction, loading?: Promise<unknown>) {
  if (!window.location.pathname.startsWith("/watch")) {
    openedFrom = historyIndex();
    void navigate("/watch");
  }
  if (loading) {
    await Promise.race([loading.catch(() => undefined), new Promise((r) => setTimeout(r, 1000))]);
  }
  await setFullscreen(true);
}

/**
 * Leaves the player without choosing where to go (the caller navigates):
 * saves the resume point, leaves full screen.
 */
export async function exitPlayer() {
  openedFrom = null;
  if (useTuner.getState().mode === "vod") await flushResume();
  await setFullscreen(false);
}

/**
 * Back from the player (Esc, the back button): one step back in the history,
 * to the page that opened it (Live TV, Home, a detail page). If the player
 * was not opened by a step we can undo, it is replaced by the channel's or the
 * movie's own page instead. Leaves full screen too.
 */
export async function leavePlayer(navigate: NavigateFunction) {
  // The detail page shows the resume point: let the last save land first.
  if (useTuner.getState().mode === "vod") await flushResume();
  await setFullscreen(false);
  const from = openedFrom;
  openedFrom = null;
  if (from !== null && historyIndex() === from + 1) void navigate(-1);
  else void navigate(playerFallback(), { replace: true });
}
