import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { useVirtualizer } from "@tanstack/react-virtual";
import { nowNext, progressOf } from "@tuner/core";
import { useEffect, useRef, useState } from "react";
import { IconButton } from "../../components/IconButton";
import { ProgressBar } from "../../components/ProgressBar";
import { useNow, useSchedule, wantEpg } from "../../data/epg";
import { useLive } from "../../data/live";
import { channelOf, useTuner } from "../../player/tuner";

const ROW = 60;

interface GuidePanelProps {
  channelId: number;
  onClose: () => void;
  onPick: (id: number) => void;
}

/**
 * The channel guide over the video (SPEC "Player", G): the zap list with what
 * is on now. Arrows move, Enter tunes, Esc or G closes. Not in the mockups;
 * it follows the switcher's look.
 */
export function GuidePanel({ channelId, onClose, onPick }: GuidePanelProps) {
  const list = useTuner((s) => s.list);
  const categoryName = useLive((s) => s.categories.find((c) => c.id === s.categoryId)?.name);
  const [index, setIndex] = useState(() => Math.max(0, list.indexOf(channelId)));
  const scroller = useRef<HTMLDivElement>(null);
  const now = useNow();

  const virtualizer = useVirtualizer({
    count: list.length,
    getScrollElement: () => scroller.current,
    estimateSize: () => ROW,
    overscan: 6,
    useFlushSync: false,
  });

  useEffect(() => {
    virtualizer.scrollToIndex(index, { align: "auto" });
  }, [index, virtualizer]);

  const items = virtualizer.getVirtualItems();
  const first = items[0]?.index ?? 0;
  const last = items[items.length - 1]?.index ?? -1;
  useEffect(() => {
    const timer = setTimeout(() => wantEpg("guide", list.slice(first, last + 1)), 150);
    return () => clearTimeout(timer);
  }, [first, last, list]);
  useEffect(() => () => wantEpg("guide", []), []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const step = { ArrowDown: 1, ArrowUp: -1, PageDown: 8, PageUp: -8 }[event.key];
      if (step !== undefined) {
        event.preventDefault();
        setIndex((i) => Math.min(list.length - 1, Math.max(0, i + step)));
      } else if (event.key === "Home" || event.key === "End") {
        event.preventDefault();
        setIndex(event.key === "Home" ? 0 : list.length - 1);
      } else if (event.key === "Enter") {
        event.preventDefault();
        const id = list[index];
        if (id !== undefined) onPick(id);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [index, list, onPick]);

  return (
    <aside
      aria-label="Channel guide"
      className="absolute top-0 right-0 bottom-0 flex w-100 flex-col gap-3 bg-overlay-strong py-7 pr-6 pl-5"
      data-guide
    >
      <div className="flex items-center justify-between gap-3 pl-2">
        <div className="flex flex-col">
          <span className="text-eyebrow-s text-text-muted uppercase">Guide</span>
          <span className="truncate text-body font-semibold">{categoryName ?? "Channels"}</span>
        </div>
        <IconButton
          icon={Cancel01Icon}
          variant="media"
          aria-label="Close guide"
          onClick={onClose}
        />
      </div>
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto">
        <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
          {items.map((row) => (
            <div
              key={row.key}
              className="absolute inset-x-0 top-0"
              style={{ transform: `translateY(${row.start}px)` }}
            >
              <GuideRow
                id={list[row.index]!}
                now={now}
                highlighted={row.index === index}
                tuned={list[row.index] === channelId}
                onPick={onPick}
              />
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}

function GuideRow({
  id,
  now,
  highlighted,
  tuned,
  onPick,
}: {
  id: number;
  now: number;
  highlighted: boolean;
  tuned: boolean;
  onPick: (id: number) => void;
}) {
  const channel = channelOf(id);
  const schedule = useSchedule(id);
  if (!channel) return null;
  const current = schedule ? nowNext(schedule, now).now : null;
  return (
    <button
      type="button"
      onClick={() => onPick(id)}
      aria-current={tuned || undefined}
      className={`flex h-14 w-full items-center gap-3 rounded-button border px-3 text-left ${
        highlighted ? "border-accent/60 bg-ghost" : "border-transparent hover:bg-ghost"
      }`}
    >
      <span
        className={`min-w-7 flex-none font-mono text-mono ${tuned ? "text-accent" : "text-text-muted"}`}
      >
        {channel.num ?? ""}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate text-small font-semibold">{channel.name}</span>
        {current && (
          <span className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-mono text-text-2">{current.title}</span>
            <ProgressBar
              value={progressOf(current, now)}
              tone="media"
              thumb={false}
              className="w-12 flex-none"
            />
          </span>
        )}
      </span>
    </button>
  );
}
