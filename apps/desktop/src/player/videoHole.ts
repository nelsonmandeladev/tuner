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
