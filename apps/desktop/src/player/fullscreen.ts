import { getCurrentWindow } from "@tauri-apps/api/window";
import type { NavigateFunction } from "react-router";
import { create } from "zustand";

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

/** Opens the player on what is tuned, in full screen (Enter / double-click in Live TV). */
export async function enterPlayer(navigate: NavigateFunction) {
  void navigate("/watch");
  await setFullscreen(true);
}

/** Back to Live TV; leaves full screen too (Esc, the back button). */
export async function leavePlayer(navigate: NavigateFunction) {
  await setFullscreen(false);
  void navigate("/live");
}
