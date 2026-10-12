import { ArrowLeft01Icon } from "@hugeicons/core-free-icons";
import { MediaChip } from "../../components/Badge";
import { IconButton } from "../../components/IconButton";
import type { VodMedia } from "../../player/tuner";
import { useStreamInfo } from "../../player/useStreamInfo";

/** Top of the movie/episode overlay: back and what plays; the stream info chip (Player.dc.html). */
export function VodHeader({ media, onBack }: { media: VodMedia; onBack: () => void }) {
  const info = useStreamInfo();
  return (
    <header className="relative flex flex-wrap items-center justify-between gap-4 px-10 py-7">
      <div className="flex min-w-0 items-center gap-4">
        <IconButton
          icon={ArrowLeft01Icon}
          variant="media-strong"
          aria-label={media.series ? `Back to ${media.series.name}` : "Back to the movie"}
          onClick={onBack}
        />
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-body-l font-semibold" data-player-media>
            {media.series ? media.series.name : media.title}
          </span>
          <span className="font-mono text-caption text-text-2">
            {media.series ? media.detail : media.detail || "Movie"}
          </span>
        </span>
      </div>
      {info && <MediaChip mono>{info}</MediaChip>}
    </header>
  );
}
