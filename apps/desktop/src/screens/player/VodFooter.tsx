import { GoBackward10SecIcon, GoForward10SecIcon, NextIcon } from "@hugeicons/core-free-icons";
import { nextEpisode } from "@tuner/core";
import { formatPosition } from "../../app/format";
import { IconButton } from "../../components/IconButton";
import { ProgressBar } from "../../components/ProgressBar";
import { seekBy, seekTo } from "../../player/controller";
import { usePlayer } from "../../player/store";
import type { VodMedia } from "../../player/tuner";
import { playNext } from "../../player/vodSession";
import type { PlayerMenu } from "../Player";
import { FullscreenButton, MediaButton, MuteButton, PauseButton, TrackButtons } from "./Controls";

interface VodFooterProps {
  media: VodMedia;
  menu: PlayerMenu;
  setMenu: (menu: PlayerMenu) => void;
}

/**
 * Bottom of the movie/episode overlay (SPEC "Player": title, scrub bar with
 * time, audio/subtitle menu, next episode), in Player.dc.html's layout.
 */
export function VodFooter({ media, menu, setMenu }: VodFooterProps) {
  const timePos = usePlayer((s) => s.timePos);
  const duration = usePlayer((s) => s.duration);
  const next = media.series ? nextEpisode(media.series.episodes, media.id) : null;
  const position = timePos ?? 0;

  return (
    <footer className="relative flex flex-col gap-5.5 px-10 pb-9">
      <div className="flex min-w-0 flex-col gap-2">
        <span className="text-eyebrow text-accent uppercase">
          {media.series ? media.detail || "Episode" : media.detail || "Movie"}
        </span>
        <h1 className="line-clamp-2 font-display text-display-m" data-player-title>
          {media.title}
        </h1>
      </div>

      <div className="flex items-center gap-3.5">
        <span className="font-mono text-caption text-text-2" data-vod-position>
          {formatPosition(position)}
        </span>
        <ProgressBar
          tone="media"
          value={duration ? position / duration : 0}
          className="flex-1"
          label="Position"
          onSeek={(fraction) => duration && void seekTo(fraction * duration)}
        />
        <span className="font-mono text-caption text-text-2">
          {duration ? `-${formatPosition(duration - position)}` : "--:--"}
        </span>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <PauseButton />
          <IconButton
            icon={GoBackward10SecIcon}
            variant="media"
            aria-label="Back 10 seconds"
            onClick={() => void seekBy(-10)}
          />
          <IconButton
            icon={GoForward10SecIcon}
            variant="media"
            aria-label="Forward 10 seconds"
            onClick={() => void seekBy(10)}
          />
          <MuteButton />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <TrackButtons menu={menu} setMenu={setMenu} />
          {next && (
            <MediaButton icon={NextIcon} onClick={() => playNext()}>
              Next episode
            </MediaButton>
          )}
          <FullscreenButton />
        </div>
      </div>
    </footer>
  );
}
