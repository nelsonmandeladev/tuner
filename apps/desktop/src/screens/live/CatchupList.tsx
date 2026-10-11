import { useVirtualizer } from "@tanstack/react-virtual";
import type { LiveChannel, Programme } from "@tuner/core";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatClock, formatDay, formatLeft } from "../../app/format";
import { Button } from "../../components/Button";
import { loadArchive } from "../../data/catchup";

type Row = { type: "day"; label: string } | { type: "programme"; programme: Programme };

const DAY_ROW = 36;
const PROGRAMME_ROW = 40;

/**
 * Recorded programmes of a catch-up channel, newest first, grouped by day.
 * Choosing one plays it in the player (seekable).
 */
export function CatchupList({
  channel,
  onPlay,
}: {
  channel: LiveChannel;
  onPlay: (programme: Programme) => void;
}) {
  const [state, setState] = useState<
    { status: "loading" } | { status: "ready"; programmes: Programme[] } | { status: "error" }
  >({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    loadArchive(channel)
      .then((programmes) => !cancelled && setState({ status: "ready", programmes }))
      .catch(() => !cancelled && setState({ status: "error" }));
    return () => {
      cancelled = true;
    };
  }, [channel, attempt]);

  const rows = useMemo<Row[]>(() => {
    if (state.status !== "ready") return [];
    const out: Row[] = [];
    let day = "";
    for (const programme of state.programmes) {
      const label = formatDay(programme.start);
      if (label !== day) out.push({ type: "day", label: (day = label) });
      out.push({ type: "programme", programme });
    }
    return out;
  }, [state]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scroller.current,
    estimateSize: (i) => (rows[i]?.type === "day" ? DAY_ROW : PROGRAMME_ROW),
    overscan: 6,
    useFlushSync: false,
  });

  if (state.status === "loading") {
    return (
      <div className="flex flex-col gap-2 py-2" aria-busy>
        {[0, 1, 2].map((i) => (
          <span key={i} className="h-5 rounded-full bg-surface" />
        ))}
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <div className="flex flex-col items-start gap-3 py-2">
        <p className="text-caption text-text-muted">The recordings could not be loaded.</p>
        <Button variant="ghost" onClick={() => setAttempt((a) => a + 1)}>
          Try again
        </Button>
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <p className="py-2 text-caption text-text-dim">No recorded programmes for this channel.</p>
    );
  }
  return (
    <div
      ref={scroller}
      className="-mx-2 min-h-0 flex-1 overflow-y-auto px-2 pb-6"
      data-catchup-list
    >
      <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((item) => {
          const row = rows[item.index]!;
          return (
            <div
              key={item.key}
              className="absolute inset-x-0 top-0"
              style={{ transform: `translateY(${item.start}px)` }}
            >
              {row.type === "day" ? (
                <h3 className="flex h-9 items-end pb-1 text-mono font-semibold text-text-dim">
                  {row.label}
                </h3>
              ) : (
                <button
                  type="button"
                  data-catchup={row.programme.start}
                  data-minutes={Math.round((row.programme.end - row.programme.start) / 60_000)}
                  onClick={() => onPlay(row.programme)}
                  className="-mx-2 flex h-10 w-[calc(100%+1rem)] items-center gap-4 rounded-control px-2 text-left text-small transition-colors duration-(--duration-hover) hover:bg-surface"
                >
                  <span className="w-11 flex-none font-mono text-caption text-text-faint">
                    {formatClock(row.programme.start)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-text-2">{row.programme.title}</span>
                  <span className="flex-none font-mono text-mono text-text-dim">
                    {formatLeft(row.programme.end - row.programme.start)}
                  </span>
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
