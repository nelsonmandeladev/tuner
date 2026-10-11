import {
  ArrowDown01Icon,
  ArrowExpand01Icon,
  ArrowShrink01Icon,
  ArrowUp01Icon,
  AudioWave01Icon,
  GoBackward10SecIcon,
  GoForward10SecIcon,
  Menu01Icon,
  PauseIcon,
  PlayIcon,
  SubtitleIcon,
  TvSmartIcon,
  VolumeHighIcon,
  VolumeMute01Icon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import { nowNext, progressOf, type LiveChannel } from "@tuner/core";
import type { ReactNode } from "react";
import { formatClock, formatDay, formatPosition } from "../../app/format";
import { trackLabel } from "../../player/trackLabel";
import { Icon } from "../../components/Icon";
import { IconButton } from "../../components/IconButton";
import { ProgressBar } from "../../components/ProgressBar";
import { useNow, useSchedule } from "../../data/epg";
import { seekBy, togglePause } from "../../player/controller";
import { toggleFullscreen, useFullscreen } from "../../player/fullscreen";
import { usePlayer, type Track } from "../../player/store";
import { catchupPosition, toggleUserMute, tune, useTuner, zap } from "../../player/tuner";
import type { PlayerMenu } from "../Player";
import { TrackMenu } from "./TrackMenu";

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
  const paused = usePlayer((s) => s.paused);
  const timePos = usePlayer((s) => s.timePos);
  const origin = useTuner((s) => s.catchupOrigin);
  const audioTracks = usePlayer((s) => s.audioTracks);
  const subtitleTracks = usePlayer((s) => s.subtitleTracks);
  const muted = useTuner((s) => s.userMuted);
  const fullscreen = useFullscreen((s) => s.on);
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
          <button
            type="button"
            aria-label={paused ? "Play" : "Pause"}
            onClick={() => void togglePause()}
            className="flex size-13 items-center justify-center rounded-full bg-text text-bg transition-transform duration-(--duration-hover) active:scale-95"
          >
            <Icon icon={paused ? PlayIcon : PauseIcon} className="[&_path]:fill-current" />
          </button>
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
          <IconButton
            icon={muted ? VolumeMute01Icon : VolumeHighIcon}
            variant="media"
            aria-label={muted ? "Unmute" : "Mute"}
            aria-pressed={muted}
            onClick={toggleUserMute}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <MediaButton
              icon={AudioWave01Icon}
              onClick={() => setMenu(menu === "audio" ? null : "audio")}
              expanded={menu === "audio"}
            >
              {audioLabel(audioTracks)}
            </MediaButton>
            {menu === "audio" && <TrackMenu kind="audio" onClose={() => setMenu(null)} />}
          </div>
          <div className="relative">
            <MediaButton
              icon={SubtitleIcon}
              onClick={() => setMenu(menu === "sub" ? null : "sub")}
              expanded={menu === "sub"}
            >
              {subtitleLabel(subtitleTracks)}
            </MediaButton>
            {menu === "sub" && <TrackMenu kind="sub" onClose={() => setMenu(null)} />}
          </div>
          {catchup ? (
            <MediaButton icon={TvSmartIcon} onClick={() => tune(channel.id)}>
              Back to live
            </MediaButton>
          ) : (
            <MediaButton icon={Menu01Icon} onClick={onGuide}>
              Guide
            </MediaButton>
          )}
          <IconButton
            icon={fullscreen ? ArrowShrink01Icon : ArrowExpand01Icon}
            variant="media"
            aria-label={fullscreen ? "Exit full screen" : "Full screen"}
            onClick={() => void toggleFullscreen()}
          />
        </div>
      </div>
    </footer>
  );
}

function MediaButton({
  icon,
  children,
  onClick,
  expanded,
}: {
  icon: IconSvgElement;
  children: ReactNode;
  onClick: () => void;
  expanded?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={expanded}
      aria-haspopup={expanded === undefined ? undefined : "menu"}
      className="inline-flex h-11 items-center gap-2 rounded-field bg-ghost px-3.5 text-small font-medium text-text transition-colors duration-(--duration-hover) hover:bg-ghost-strong"
    >
      <Icon icon={icon} size={18} />
      {children}
    </button>
  );
}

function audioLabel(tracks: Track[]): string {
  const index = tracks.findIndex((t) => t.selected);
  return index === -1 ? "Audio" : trackLabel(tracks[index]!, index);
}

function subtitleLabel(tracks: Track[]): string {
  const index = tracks.findIndex((t) => t.selected);
  return index === -1 ? "Subtitles off" : trackLabel(tracks[index]!, index);
}
