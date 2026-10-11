import { nowNext, progressOf, type LiveChannel } from "@tuner/core";
import { memo } from "react";
import { formatLeft } from "../../app/format";
import { OutlineBadge } from "../../components/Badge";
import { ChannelLogo } from "../../components/ChannelLogo";
import { ProgressBar } from "../../components/ProgressBar";
import { useSchedule } from "../../data/epg";

interface ChannelRowProps {
  channel: LiveChannel;
  selected: boolean;
  /** Width of the number column, in characters of the mono font. */
  numberWidth: number;
  now: number;
  /** Fast scrolling: no logo image (see ChannelList). */
  lite?: boolean;
  onPick: (id: number, at: number) => void;
  onOpen: (id: number) => void;
}

/**
 * DESIGN.md `ChannelRow`: number, logo, name and Catch-up badge, the current
 * programme with a thin progress bar, and time left. Selected: surface and a
 * hairline (LiveTV.dc.html).
 */
export const ChannelRow = memo(function ChannelRow({
  channel,
  selected,
  numberWidth,
  now,
  lite = false,
  onPick,
  onOpen,
}: ChannelRowProps) {
  const schedule = useSchedule(channel.id);
  const current = schedule ? nowNext(schedule, now).now : null;
  const loading = schedule === undefined && channel.epgChannelId !== null;

  return (
    <button
      type="button"
      id={`channel-${channel.id}`}
      data-channel={channel.id}
      aria-current={selected || undefined}
      tabIndex={selected ? 0 : -1}
      onClick={(event) => onPick(channel.id, event.timeStamp)}
      onDoubleClick={() => onOpen(channel.id)}
      className={`flex h-17.5 w-full items-center gap-3.5 rounded-button border px-3 text-left text-text transition-colors duration-(--duration-hover) ease-out ${
        selected ? "border-line-outline bg-surface-selected" : "border-transparent hover:bg-surface"
      }`}
    >
      <span
        className="flex-none font-mono text-caption text-text-dim"
        style={{ width: `${numberWidth}ch` }}
      >
        {channel.num ?? ""}
      </span>
      <ChannelLogo name={channel.name} icon={lite ? null : channel.icon} />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-small font-semibold">{channel.name}</span>
          {channel.tvArchive && <OutlineBadge>Catch-up</OutlineBadge>}
        </span>
        {current ? (
          <>
            <span className="truncate text-caption text-text-muted">{current.title}</span>
            <ProgressBar value={progressOf(current, now)} className="max-w-55" />
          </>
        ) : loading ? (
          <>
            <span className="h-3.5 w-2/3 max-w-60 rounded-full bg-surface" />
            <span className="h-0.75 max-w-55 rounded-full bg-surface" />
          </>
        ) : null}
      </span>
      {current && (
        <span className="flex-none font-mono text-mono text-text-dim">
          {formatLeft(current.end - now)}
        </span>
      )}
    </button>
  );
});
