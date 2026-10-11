import { FavouriteIcon, PlayIcon } from "@hugeicons/core-free-icons";
import { nowNext, progressOf, type LiveChannel, type Programme } from "@tuner/core";
import { useState } from "react";
import { formatClock } from "../../app/format";
import { LiveBadge } from "../../components/Badge";
import { Button } from "../../components/Button";
import { GeneratedArt } from "../../components/GeneratedArt";
import { Icon } from "../../components/Icon";
import { ProgressBar } from "../../components/ProgressBar";
import { Toast } from "../../components/Toast";
import { useNow, useSchedule } from "../../data/epg";
import { toggleFavorite, useLive } from "../../data/live";
import { usePlayer } from "../../player/store";
import { retry, useTuner } from "../../player/tuner";
import { VideoSurface } from "../../player/VideoSurface";
import { CatchupList } from "./CatchupList";
import { playerErrorMessage } from "./messages";

interface PreviewPaneProps {
  channel: LiveChannel | null;
  onWatch: () => void;
  onCatchup: (programme: Programme) => void;
}

/**
 * The right pane of Live TV (LiveTV.dc.html): the selected channel playing
 * muted in the shared mpv instance, what is on with its progress, Watch and
 * favorite, and what comes next, or the recorded programmes for catch-up.
 */
export function PreviewPane({ channel, onWatch, onCatchup }: PreviewPaneProps) {
  const now = useNow();
  const schedule = useSchedule(channel?.id);
  const favorite = useLive((s) => (channel ? s.favorites.includes(channel.id) : false));
  // The tab belongs to a channel: another channel opens on "Up next".
  const [tabFor, setTabFor] = useState<{ id: number; tab: "next" | "catchup" } | null>(null);
  const tab = channel?.tvArchive && tabFor?.id === channel.id ? tabFor.tab : "next";
  const setTab = (next: "next" | "catchup") => channel && setTabFor({ id: channel.id, tab: next });
  const { now: current, upcoming } = nowNext(schedule ?? [], now);

  if (!channel) {
    return <section aria-label="Preview" className="pt-6 pr-7 pb-6 pl-2" />;
  }

  return (
    <section
      aria-label="Preview"
      data-pane="preview"
      className="flex min-h-0 min-w-0 flex-col gap-5 pt-6 pr-7 pl-2"
    >
      <PreviewVideo channel={channel} />

      <div className="flex flex-col gap-1.5">
        <span className="truncate font-mono text-caption text-text-faint" data-preview-channel>
          {channel.num !== null ? `${channel.num} · ` : ""}
          {channel.name}
        </span>
        <h1 className="line-clamp-2 text-title" data-preview-title>
          {current?.title ?? channel.name}
        </h1>
        {current ? (
          <div className="mt-1.5 flex items-center gap-3">
            <span className="font-mono text-mono text-text-muted">
              {formatClock(current.start)}
            </span>
            <ProgressBar value={progressOf(current, now)} tone="focus" className="flex-1" />
            <span className="font-mono text-mono text-text-muted">{formatClock(current.end)}</span>
          </div>
        ) : (
          <p className="text-caption text-text-dim">
            {schedule === undefined && channel.epgChannelId
              ? "Loading the guide…"
              : "No programme information for this channel."}
          </p>
        )}
      </div>

      <div className="flex gap-2.5">
        <div className="flex-1 [&>button]:w-full">
          <Button onClick={onWatch}>
            <Icon icon={PlayIcon} size={16} className="[&_path]:fill-current" />
            Watch
          </Button>
        </div>
        <button
          type="button"
          aria-label={
            favorite ? `Remove ${channel.name} from favorites` : `Add ${channel.name} to favorites`
          }
          aria-pressed={favorite}
          data-favorite
          onClick={() => void toggleFavorite(channel.id)}
          className={`flex size-12 flex-none items-center justify-center rounded-button border border-line-strong bg-surface transition-colors duration-(--duration-hover) ease-out hover:bg-surface-raised ${
            favorite ? "text-accent" : "text-text"
          }`}
        >
          <Icon icon={FavouriteIcon} className={favorite ? "[&_path]:fill-current" : ""} />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-1 border-t border-line pt-4">
        <div className="mb-2 flex items-center gap-4">
          {channel.tvArchive ? (
            <div role="tablist" aria-label="Programmes" className="flex gap-4">
              {(
                [
                  ["next", "Up next"],
                  ["catchup", "Catch-up"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={tab === id}
                  onClick={() => setTab(id)}
                  className={`text-eyebrow-s uppercase transition-colors duration-(--duration-hover) ${
                    tab === id ? "text-text-faint" : "text-text-dim hover:text-text-2"
                  } ${tab === id ? "underline decoration-accent decoration-2 underline-offset-6" : ""}`}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : (
            <h2 className="text-eyebrow-s text-text-faint uppercase">Up next</h2>
          )}
        </div>
        {tab === "catchup" ? (
          <CatchupList channel={channel} onPlay={onCatchup} />
        ) : upcoming.length > 0 ? (
          upcoming.slice(0, 3).map((p) => (
            <div key={p.start} className="flex gap-4 py-2 text-small">
              <span className="w-11 flex-none font-mono text-caption text-text-faint">
                {formatClock(p.start)}
              </span>
              <span className="truncate text-text-2">{p.title}</span>
            </div>
          ))
        ) : (
          <p className="py-2 text-caption text-text-dim">Nothing listed yet.</p>
        )}
      </div>
    </section>
  );
}

/** The rounded video hole and what sits on it: chips, generated art before the first frame, errors. */
function PreviewVideo({ channel }: { channel: LiveChannel }) {
  const status = usePlayer((s) => s.status);
  const shown = usePlayer((s) => s.shown);
  const reconnecting = usePlayer((s) => s.status === "reconnecting");
  const error = usePlayer((s) => s.error);
  const inUse = useTuner((s) => s.inUse);
  const tunedId = useTuner((s) => s.channelId);
  // Art until a picture is up. During a zap mpv keeps the last frame, so no art then.
  const showArt = !shown || status === "error" || status === "idle" || tunedId !== channel.id;

  return (
    <div className="relative aspect-video w-full">
      <VideoSurface radius={18} className="absolute inset-0" />
      {showArt && <GeneratedArt name={channel.name} className="absolute inset-0 rounded-card" />}
      <div className="absolute top-3.5 left-3.5">
        <LiveBadge size="preview" />
      </div>
      <span className="absolute top-3.5 right-3.5 inline-flex h-6.5 items-center rounded-chip bg-overlay-preview px-2.5 text-mono text-text-2">
        Preview · muted
      </span>
      {status === "error" && tunedId === channel.id && (
        <div className="absolute inset-x-4 bottom-4 flex items-center justify-between gap-3 rounded-field bg-overlay-strong p-3">
          <span className="text-caption text-text-2">{playerErrorMessage(error, inUse)}</span>
          <button
            type="button"
            onClick={retry}
            className="h-9 flex-none rounded-control bg-ghost px-3 text-caption font-semibold text-text hover:bg-ghost-strong"
          >
            Try again
          </button>
        </div>
      )}
      <Toast message={reconnecting ? "Reconnecting…" : null} />
    </div>
  );
}
