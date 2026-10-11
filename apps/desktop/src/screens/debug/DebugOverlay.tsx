import {
  ArrowExpandIcon,
  ArrowShrinkIcon,
  GoBackward10SecIcon,
  GoForward10SecIcon,
  PauseIcon,
  PlayIcon,
  StopIcon,
  VolumeHighIcon,
  VolumeMute01Icon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import { Icon } from "../../components/Icon";
import { Toast } from "../../components/Toast";
import {
  retry,
  seekBy,
  setAudioTrack,
  setSubtitleTrack,
  setVolume,
  stop,
  toggleMute,
  togglePause,
} from "../../player/controller";
import { usePlayer, type Track } from "../../player/store";

interface DebugOverlayProps {
  fullScreen: boolean;
  onToggleFullScreen: () => void;
}

/** React UI over the video: proves controls and text can sit on top of mpv. */
export function DebugOverlay({ fullScreen, onToggleFullScreen }: DebugOverlayProps) {
  const p = usePlayer();
  const reconnecting =
    p.status === "reconnecting" ? `Reconnecting… (${p.reconnectAttempt}/3)` : null;

  return (
    <div className="absolute inset-0 flex flex-col justify-between p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 rounded-chip bg-overlay px-3 py-1.5 text-small font-medium text-text">
          {p.live && <span className="size-2 rounded-full bg-live" aria-hidden />}
          <span>{p.label ?? "Nothing loaded"}</span>
          <span className="text-text-muted">· {statusText(p.status, p.buffering)}</span>
        </div>
        <StreamInfo />
      </div>

      <Toast message={reconnecting} />

      {p.status === "error" && (
        <div className="flex flex-col items-center gap-3 self-center rounded-card bg-overlay-strong px-6 py-5 text-center">
          <p className="text-body text-text">{p.error}</p>
          <button
            className="rounded-control bg-accent px-4 py-2 text-small font-semibold text-on-accent"
            onClick={() => void retry()}
          >
            Try again
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 rounded-button bg-overlay p-2">
        <IconButton
          icon={p.paused ? PlayIcon : PauseIcon}
          label={p.paused ? "Play" : "Pause"}
          onClick={() => void togglePause()}
        />
        <IconButton icon={StopIcon} label="Stop" onClick={() => void stop()} />
        <IconButton
          icon={GoBackward10SecIcon}
          label="Back 10 seconds"
          onClick={() => void seekBy(-10)}
        />
        <IconButton
          icon={GoForward10SecIcon}
          label="Forward 10 seconds"
          onClick={() => void seekBy(10)}
        />
        <span className="px-2 font-mono text-mono text-text-2">
          {formatTime(p.timePos)} / {p.live ? "live" : formatTime(p.duration)}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <TrackSelect
            label="Audio"
            tracks={p.audioTracks}
            onSelect={(id) => void setAudioTrack(id)}
          />
          <TrackSelect
            label="Subtitles"
            tracks={p.subtitleTracks}
            onSelect={(id) => void setSubtitleTrack(id)}
            allowOff
          />
          <IconButton
            icon={p.mute ? VolumeMute01Icon : VolumeHighIcon}
            label={p.mute ? "Unmute" : "Mute"}
            onClick={() => void toggleMute()}
          />
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(p.volume)}
            onChange={(e) => void setVolume(Number(e.target.value))}
            aria-label="Volume"
            className="w-24 accent-accent"
          />
          <IconButton
            icon={fullScreen ? ArrowShrinkIcon : ArrowExpandIcon}
            label={fullScreen ? "Leave full screen" : "Full screen"}
            onClick={onToggleFullScreen}
          />
        </div>
      </div>
    </div>
  );
}

function StreamInfo() {
  const video = usePlayer((s) => s.video);
  const audio = usePlayer((s) => s.audioTracks.find((t) => t.selected));
  const hwdec = usePlayer((s) => s.hwdec);
  if (!video.codec && !audio) return null;
  const size = video.width && video.height ? ` ${video.width}×${video.height}` : "";
  const channels = audio?.channels ? ` ${audio.channels}ch` : "";
  return (
    <div className="rounded-chip bg-overlay px-3 py-1.5 font-mono text-mono text-text-2">
      {video.codec ?? "no video"}
      {size} · {audio?.codec ?? "no audio"}
      {channels} · hwdec {hwdec ?? "off"}
    </div>
  );
}

function IconButton(props: { icon: IconSvgElement; label: string; onClick: () => void }) {
  return (
    <button
      className="grid size-11 place-items-center rounded-field bg-ghost text-text transition-colors duration-(--duration-hover) hover:bg-overlay-strong"
      onClick={props.onClick}
      aria-label={props.label}
      title={props.label}
    >
      <Icon icon={props.icon} />
    </button>
  );
}

function TrackSelect(props: {
  label: string;
  tracks: Track[];
  onSelect: (id: number | "no") => void;
  allowOff?: boolean;
}) {
  if (props.tracks.length === 0) return null;
  const selected = props.tracks.find((t) => t.selected)?.id ?? "no";
  return (
    <select
      aria-label={props.label}
      value={selected}
      onChange={(e) => props.onSelect(e.target.value === "no" ? "no" : Number(e.target.value))}
      className="h-11 max-w-56 rounded-field border border-line-strong bg-overlay-strong px-3 text-small text-text"
    >
      {props.allowOff && <option value="no">{props.label}: off</option>}
      {props.tracks.map((t) => (
        <option key={t.id} value={t.id}>
          {props.label}:{" "}
          {[t.lang, t.title, t.codec, t.channels && `${t.channels}ch`]
            .filter(Boolean)
            .join(" · ") || `#${t.id}`}
        </option>
      ))}
    </select>
  );
}

function statusText(status: string, buffering: boolean) {
  if (status === "playing" && buffering) return "buffering";
  return status;
}

function formatTime(seconds: number | null) {
  if (seconds === null) return "--:--";
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}
