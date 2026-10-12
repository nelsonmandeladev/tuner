import { audioCodecName, channelLayout, resolutionName, videoCodecName } from "../app/format";
import { usePlayer } from "./store";

/** "1080p · H.264 · AC3 5.1", from what mpv decodes. */
export function useStreamInfo(): string | null {
  const height = usePlayer((s) => s.video.height);
  const codec = usePlayer((s) => s.video.codec);
  const audio = usePlayer((s) => s.audioTracks.find((t) => t.selected));
  const playing = usePlayer((s) => s.shown);
  if (!playing) return null;
  const sound = [audioCodecName(audio?.codec ?? null), channelLayout(audio?.channels ?? null)]
    .filter(Boolean)
    .join(" ");
  const parts = [resolutionName(height), videoCodecName(codec), sound || null].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}
