import { nowNext } from "@tuner/core";
import { Kbd } from "../../components/Kbd";
import { useNow, useSchedule } from "../../data/epg";
import { channelOf } from "../../player/tuner";
import { neighbours } from "./neighbours";

/**
 * The channels above and below the current one in the zap list, right of
 * centre (Player.dc.html): ↑ goes to the top row, ↓ to the bottom one.
 */
export function ChannelSwitcher({ channelId, list }: { channelId: number; list: number[] }) {
  const { prev, next } = neighbours(list, channelId);
  return (
    <section
      aria-label="Channel switcher"
      className="absolute top-1/2 right-10 flex w-75 -translate-y-1/2 flex-col gap-1.5"
    >
      {prev !== null && <SwitcherRow id={prev} />}
      <SwitcherRow id={channelId} current />
      {next !== null && <SwitcherRow id={next} />}
      {prev !== null && (
        <span className="mt-1.5 flex items-center justify-end gap-1 text-mono text-text-2">
          <Kbd onMedia>↑</Kbd>
          <Kbd onMedia>↓</Kbd>
          <span className="ml-1">change channel</span>
        </span>
      )}
    </section>
  );
}

function SwitcherRow({ id, current = false }: { id: number; current?: boolean }) {
  const channel = channelOf(id);
  const now = useNow();
  const schedule = useSchedule(id);
  if (!channel) return null;
  const programme = schedule ? nowNext(schedule, now).now : null;
  const text = programme ? `${channel.name} · ${programme.title}` : channel.name;
  return (
    <div
      className={`flex items-center gap-3 rounded-button ${
        current
          ? "border border-accent/60 bg-overlay-strong p-3"
          : "bg-overlay px-3 py-2.5 opacity-75"
      }`}
      data-switcher-row={current ? "current" : "other"}
    >
      <span
        className={`min-w-7 flex-none font-mono text-mono ${current ? "text-accent" : "text-text-muted"}`}
      >
        {channel.num ?? ""}
      </span>
      <span
        className={`truncate text-small ${current ? "font-semibold text-text" : "text-text-2"}`}
      >
        {text}
      </span>
    </div>
  );
}
