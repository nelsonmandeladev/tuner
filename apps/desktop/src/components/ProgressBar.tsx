interface ProgressBarProps {
  /** 0–1. */
  value: number;
  /** "list": thin, muted fill (channel rows). "focus": accent fill (preview). "media": on video, with a thumb. */
  tone?: "list" | "focus" | "media";
  className?: string;
  /** Called with 0–1 when the bar is clicked (seekable catch-up). */
  onSeek?: (fraction: number) => void;
  label?: string;
  /** The round handle at the position; on by default on video. */
  thumb?: boolean;
}

/** DESIGN.md `ProgressBar`: 3–4 px on `--track`; fill muted in lists, accent when in focus. */
export function ProgressBar({
  value,
  tone = "list",
  className = "",
  onSeek,
  label,
  thumb = tone === "media",
}: ProgressBarProps) {
  const pct = `${Math.round(Math.min(1, Math.max(0, value)) * 1000) / 10}%`;
  const track =
    tone === "media"
      ? "h-1 bg-track-on-media"
      : tone === "focus"
        ? "h-1 bg-track"
        : "h-0.75 bg-track";
  const fill = tone === "list" ? "bg-text-faint" : "bg-accent";
  return (
    <div
      className={`relative rounded-full ${track} ${onSeek ? "cursor-pointer" : ""} ${className}`}
      role={onSeek ? "slider" : "progressbar"}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value * 100)}
      onClick={
        onSeek
          ? (event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              onSeek((event.clientX - rect.left) / rect.width);
            }
          : undefined
      }
    >
      <div className={`h-full rounded-full ${fill}`} style={{ width: pct }} />
      {thumb && (
        <div
          className="absolute -top-1.25 -ml-1.75 size-3.5 rounded-full bg-text"
          style={{ left: pct }}
        />
      )}
    </div>
  );
}
