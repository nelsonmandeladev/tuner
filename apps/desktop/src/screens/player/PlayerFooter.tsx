import {
  ArrowDown01Icon,
  ArrowUp01Icon,
  GoBackward10SecIcon,
  GoForward10SecIcon,
  Menu01Icon,
  TvSmartIcon,
} from "@hugeicons/core-free-icons";
import { nowNext, progressOf, type LiveChannel } from "@tuner/core";
import { formatClock, formatDay, formatPosition } from "../../app/format";
import { IconButton } from "../../components/IconButton";
import { ProgressBar } from "../../components/ProgressBar";
import { useNow, useSchedule } from "../../data/epg";
import { seekBy } from "../../player/controller";
import { usePlayer } from "../../player/store";
import { catchupPosition, tune, useTuner, zap } from "../../player/tuner";
import type { PlayerMenu } from "../Player";
import { FullscreenButton, MediaButton, MuteButton, PauseButton, TrackButtons } from "./Controls";

interface PlayerFooterProps {
  channel: LiveChannel;
  menu: PlayerMenu;
  setMenu: (menu: PlayerMenu) => void;
  onGuide: () => void;
}

/**
 * Bottom of the overlay (Player.dc.html): "Now" and the programme, what is
 * next, progress with times, and the controls. In catch-up the bar is the
 * recording's position and can be clicked to seek.
 */
export function PlayerFooter({ channel, menu, setMenu, onGuide }: PlayerFooterProps) {
  const mode = useTuner((s) => s.mode);
  const recording = useTuner((s) => s.programme);
  const now = useNow(10_000);
  const schedule = useSchedule(channel.id);
  const { now: current, next } = nowNext(schedule ?? [], now);
  const timePos = usePlayer((s) => s.timePos);
  const origin = useTuner((s) => s.catchupOrigin);
  const catchup = mode === "catchup" && recording !== null;
  const length = recording ? (recording.end - recording.start) / 1000 : 0;
  const position = catchupPosition(timePos, origin);

  const eyebrow = catchup
    ? `Catch-up · ${formatDay(recording.start)} ${formatClock(recording.start)}`
    : current
      ? "Now"
      : "Live";
  const title = catchup ? recording.title : (current?.title ?? channel.name);

  return (
    <footer className="relative flex flex-col gap-5.5 px-10 pb-9">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="flex min-w-0 flex-col gap-2">
          <span className="text-eyebrow text-accent uppercase">{eyebrow}</span>
          <h1 className="line-clamp-2 font-display text-display-m" data-player-title>
            {title}
          </h1>
        </div>
        {!catchup && next && (
          <div className="flex flex-col gap-1 text-right">
            <span className="text-eyebrow-s text-text-muted uppercase">
              Next · {formatClock(next.start)}
            </span>
            <span className="text-body font-normal text-text-2">{next.title}</span>
          </div>
        )}
      </div>

      {catchup ? (
        <div className="flex items-center gap-3.5">
          <span className="font-mono text-caption text-text-2" data-catchup-position>
            {formatPosition(position ?? 0)}
          </span>
          <ProgressBar
            tone="media"
            value={length > 0 ? (position ?? 0) / length : 0}
            className="flex-1"
            label="Position"
            onSeek={(fraction) => position !== null && void seekBy(fraction * length - position)}
          />
          <span className="font-mono text-caption text-text-2">{formatPosition(length)}</span>
        </div>
      ) : current ? (
        <div className="flex items-center gap-3.5">
          <span className="font-mono text-caption text-text-2">{formatClock(current.start)}</span>
          <ProgressBar tone="media" value={progressOf(current, now)} className="flex-1" />
          <span className="font-mono text-caption text-text-2">{formatClock(current.end)}</span>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <PauseButton />
          {catchup ? (
            <>
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
            </>
          ) : (
            <>
              <IconButton
                icon={ArrowUp01Icon}
                variant="media"
                aria-label="Previous channel"
                onClick={() => zap(-1)}
              />
              <IconButton
                icon={ArrowDown01Icon}
                variant="media"
                aria-label="Next channel"
                onClick={() => zap(1)}
              />
            </>
          )}
          <MuteButton />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <TrackButtons menu={menu} setMenu={setMenu} />
          {catchup ? (
            <MediaButton icon={TvSmartIcon} onClick={() => tune(channel.id)}>
              Back to live
            </MediaButton>
          ) : (
            <MediaButton icon={Menu01Icon} onClick={onGuide}>
              Guide
            </MediaButton>
          )}
          <FullscreenButton />
        </div>
      </div>
    </footer>
  );
}
