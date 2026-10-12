import { create } from "zustand";

export interface VideoHole {
  left: number;
  top: number;
  width: number;
  height: number;
  radius: number;
}

/** Where the video shows through, in CSS pixels; null when no surface is mounted. */
export const useVideoHole = create<{ hole: VideoHole | null }>(() => ({ hole: null }));

/**
 * Something moved the video's box without resizing it (a pane being dragged,
 * the sidebar sliding): the surface measures itself again on the next frame.
 */
const LAYOUT_EVENT = "tuner:layout";

export function notifyLayoutMoved() {
  window.dispatchEvent(new Event(LAYOUT_EVENT));
}

export function onLayoutMoved(listener: () => void): () => void {
  window.addEventListener(LAYOUT_EVENT, listener);
  return () => window.removeEventListener(LAYOUT_EVENT, listener);
}
