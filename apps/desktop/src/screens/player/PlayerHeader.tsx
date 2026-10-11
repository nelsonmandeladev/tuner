import { ArrowLeft01Icon } from "@hugeicons/core-free-icons";
import type { LiveChannel } from "@tuner/core";
import { audioCodecName, channelLayout, resolutionName, videoCodecName } from "../../app/format";
import { LiveBadge, MediaChip } from "../../components/Badge";
import { ChannelLogo } from "../../components/ChannelLogo";
import { IconButton } from "../../components/IconButton";
import { usePlayer } from "../../player/store";

interface PlayerHeaderProps {
  channel: LiveChannel;
  mode: "live" | "catchup";
  onBack: () => void;
}

/** Top of the overlay: back, logo, name and number; LIVE and the stream info chip (Player.dc.html). */
export function PlayerHeader({ channel, mode, onBack }: PlayerHeaderProps) {
  const info = useStreamInfo();
  return (
    <header className="relative flex flex-wrap items-center justify-between gap-4 px-10 py-7">
      <div className="flex min-w-0 items-center gap-4">
        <IconButton
          icon={ArrowLeft01Icon}
          variant="media-strong"
          aria-label="Back to Live TV"
          onClick={onBack}
        />
        <ChannelLogo name={channel.name} icon={channel.icon} size={44} />
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-body-l font-semibold" data-player-channel>
            {channel.name}
          </span>
          {channel.num !== null && (
            <span className="font-mono text-caption text-text-2">{channel.num}</span>
          )}
        </span>
      </div>
      <div className="flex items-center gap-2.5">
        {mode === "live" ? <LiveBadge /> : <MediaChip>Catch-up</MediaChip>}
        {info && <MediaChip mono>{info}</MediaChip>}
      </div>
    </header>
  );
}

/** "1080p · H.264 · AC3 5.1", from what mpv decodes. */
function useStreamInfo(): string | null {
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
