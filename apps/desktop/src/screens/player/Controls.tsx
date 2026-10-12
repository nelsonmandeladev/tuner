import {
  ArrowExpand01Icon,
  ArrowShrink01Icon,
  AudioWave01Icon,
  PauseIcon,
  PlayIcon,
  SubtitleIcon,
  VolumeHighIcon,
  VolumeMute01Icon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import type { ReactNode } from "react";
import { Icon } from "../../components/Icon";
import { IconButton } from "../../components/IconButton";
import { togglePause } from "../../player/controller";
import { toggleFullscreen, useFullscreen } from "../../player/fullscreen";
import { usePlayer, type Track } from "../../player/store";
import { trackLabel } from "../../player/trackLabel";
import { toggleUserMute, useTuner } from "../../player/tuner";
import type { PlayerMenu } from "../Player";
import { TrackMenu } from "./TrackMenu";

/** Player controls shared by the live and the movie/episode overlays (Player.dc.html). */

/** The big round play/pause button. */
export function PauseButton() {
  const paused = usePlayer((s) => s.paused);
  return (
    <button
      type="button"
      aria-label={paused ? "Play" : "Pause"}
      onClick={() => void togglePause()}
      className="flex size-13 items-center justify-center rounded-full bg-text text-bg transition-transform duration-(--duration-hover) active:scale-95"
    >
      <Icon icon={paused ? PlayIcon : PauseIcon} className="[&_path]:fill-current" />
    </button>
  );
}

export function MuteButton() {
  const muted = useTuner((s) => s.userMuted);
  return (
    <IconButton
      icon={muted ? VolumeMute01Icon : VolumeHighIcon}
      variant="media"
      aria-label={muted ? "Unmute" : "Mute"}
      aria-pressed={muted}
      onClick={toggleUserMute}
    />
  );
}

export function FullscreenButton() {
  const fullscreen = useFullscreen((s) => s.on);
  return (
    <IconButton
      icon={fullscreen ? ArrowShrink01Icon : ArrowExpand01Icon}
      variant="media"
      aria-label={fullscreen ? "Exit full screen" : "Full screen"}
      onClick={() => void toggleFullscreen()}
    />
  );
}

/** A labelled button on video ("English · 5.1", "Guide"). */
export function MediaButton({
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
      className="inline-flex h-11 items-center gap-2 rounded-full bg-ghost px-3.5 text-small font-medium text-text transition-colors duration-(--duration-hover) hover:bg-ghost-strong"
    >
      <Icon icon={icon} size={18} />
      {children}
    </button>
  );
}

/** Audio and subtitle buttons with their menus. */
export function TrackButtons({
  menu,
  setMenu,
}: {
  menu: PlayerMenu;
  setMenu: (menu: PlayerMenu) => void;
}) {
  const audioTracks = usePlayer((s) => s.audioTracks);
  const subtitleTracks = usePlayer((s) => s.subtitleTracks);
  return (
    <>
      <div className="relative">
        <MediaButton
          icon={AudioWave01Icon}
          onClick={() => setMenu(menu === "audio" ? null : "audio")}
          expanded={menu === "audio"}
        >
          {selectedLabel(audioTracks, "Audio")}
        </MediaButton>
        {menu === "audio" && <TrackMenu kind="audio" onClose={() => setMenu(null)} />}
      </div>
      <div className="relative">
        <MediaButton
          icon={SubtitleIcon}
          onClick={() => setMenu(menu === "sub" ? null : "sub")}
          expanded={menu === "sub"}
        >
          {selectedLabel(subtitleTracks, "Subtitles off")}
        </MediaButton>
        {menu === "sub" && <TrackMenu kind="sub" onClose={() => setMenu(null)} />}
      </div>
    </>
  );
}

function selectedLabel(tracks: Track[], none: string): string {
  const index = tracks.findIndex((t) => t.selected);
  return index === -1 ? none : trackLabel(tracks[index]!, index);
}
