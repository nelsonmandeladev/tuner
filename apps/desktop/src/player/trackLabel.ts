import { channelLayout, languageName } from "../app/format";
import type { Track } from "./store";

/** "English · 5.1" (Player.dc.html). */
export function trackLabel(track: Track, position: number): string {
  const name = languageName(track.lang) ?? track.title ?? `Track ${position + 1}`;
  const layout = track.type === "audio" ? channelLayout(track.channels) : null;
  return layout ? `${name} · ${layout}` : name;
}
