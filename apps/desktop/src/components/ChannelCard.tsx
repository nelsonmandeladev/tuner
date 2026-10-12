import { nowNext, progressOf, type LiveChannel } from "@tuner/core";
import { memo } from "react";
import { useSchedule } from "../data/epg";
import { ChannelLogo } from "./ChannelLogo";

interface ChannelCardProps {
  channel: LiveChannel;
  now: number;
  onOpen: (id: number) => void;
}

/**
 * DESIGN.md `ChannelCard` (Main.dc.html): logo, name and number, what is on
 * now on two lines at most, and a thin progress bar.
 */
export const ChannelCard = memo(function ChannelCard({ channel, now, onOpen }: ChannelCardProps) {
  const schedule = useSchedule(channel.id);
  const current = schedule ? nowNext(schedule, now).now : null;
  const loading = schedule === undefined && channel.epgChannelId !== null;

  return (
    <button
      type="button"
      onClick={() => onOpen(channel.id)}
      className="flex min-w-0 flex-col gap-3.5 rounded-card border border-line bg-surface p-4 text-left text-text transition-colors duration-(--duration-hover) ease-out hover:bg-surface-selected"
      data-channel-card={channel.id}
    >
      <span className="flex items-center gap-2.5">
        <ChannelLogo name={channel.name} icon={channel.icon} />
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-small font-semibold">{channel.name}</span>
          <span className="font-mono text-mono text-text-dim">{channel.num ?? ""}</span>
        </span>
      </span>
      {loading ? (
        <span className="flex h-9 flex-col gap-2 pt-1" aria-hidden>
          <span className="h-3 w-4/5 rounded-full bg-surface-raised" />
          <span className="h-3 w-1/2 rounded-full bg-surface-raised" />
        </span>
      ) : (
        <span
          className={`line-clamp-2 h-9 text-caption ${current ? "text-text-2" : "text-text-dim"}`}
        >
          {current?.title ?? (channel.epgChannelId ? "" : "No guide for this channel")}
        </span>
      )}
      <span className="block h-0.75 rounded-full bg-track">
        <span
          className="block h-full rounded-full bg-text-muted"
          style={{ width: `${current ? Math.round(progressOf(current, now) * 100) : 0}%` }}
        />
      </span>
    </button>
  );
});
