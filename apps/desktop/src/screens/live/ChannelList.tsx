import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useMemo, useRef, useState } from "react";
import { EmptyState } from "../../components/EmptyState";
import { Icon } from "../../components/Icon";
import { useNow, wantEpg } from "../../data/epg";
import { FAVORITES, setFilter, useLive } from "../../data/live";
import { ChannelRow } from "./ChannelRow";

/** 70 px row + 2 px gap (LiveTV.dc.html). */
export const ROW = 72;
/** Wait for scrolling to settle before asking for schedules. */
const EPG_SETTLE_MS = 200;
/**
 * Above this speed (px/ms, i.e. 20,000 px/s: dragging the scrollbar through
 * thousands of rows) rows skip their logo images: each new row would start
 * an image request and decode every frame. They come back when it slows.
 */
const FAST_PX_PER_MS = 20;

interface ChannelListProps {
  onPick: (id: number, at: number) => void;
  onOpen: (id: number) => void;
  /** Lets the screen scroll the list to a row (keyboard selection, number entry). */
  scrollRef: React.RefObject<((index: number) => void) | null>;
}

/**
 * The current category's channels after the filter. Virtualised with
 * TanStack Virtual (SPEC "Quality bar": 60 fps on 20,000 channels): only the
 * rows on screen exist, and only they ask for now/next.
 */
export function ChannelList({ onPick, onOpen, scrollRef }: ChannelListProps) {
  const list = useLive((s) => s.list);
  const channels = useLive((s) => s.channels);
  const selectedId = useLive((s) => s.selectedId);
  const filter = useLive((s) => s.filter);
  const categoryId = useLive((s) => s.categoryId);
  const categoryName = useLive((s) => s.categories.find((c) => c.id === s.categoryId)?.name ?? "");
  const now = useNow();
  const scroller = useRef<HTMLDivElement>(null);
  const [fast, setFast] = useState(false);
  const lastScroll = useRef({ offset: 0, time: 0 });

  const virtualizer = useVirtualizer({
    onChange: (instance, sync) => {
      const offset = instance.scrollOffset ?? 0;
      const time = performance.now();
      const speed =
        Math.abs(offset - lastScroll.current.offset) / Math.max(1, time - lastScroll.current.time);
      lastScroll.current = { offset, time };
      setFast(sync && speed > FAST_PX_PER_MS);
    },
    count: list.length,
    getScrollElement: () => scroller.current,
    estimateSize: () => ROW,
    getItemKey: (index) => list[index] ?? index,
    overscan: 6,
    useFlushSync: false,
  });

  useEffect(() => {
    scrollRef.current = (index) => virtualizer.scrollToIndex(index, { align: "auto" });
    return () => {
      scrollRef.current = null;
    };
  }, [scrollRef, virtualizer]);

  // A new category or filter starts at the top.
  useEffect(() => {
    virtualizer.scrollToOffset(0);
  }, [categoryId, filter, virtualizer]);

  const numberWidth = useMemo(() => {
    let widest = 3;
    for (const id of list) {
      const digits = String(channels.get(id)?.num ?? "").length;
      if (digits > widest) widest = digits;
    }
    return widest;
  }, [list, channels]);

  const items = virtualizer.getVirtualItems();
  const first = items[0]?.index ?? 0;
  const last = items[items.length - 1]?.index ?? -1;
  const scrolling = virtualizer.isScrolling;
  useEffect(() => {
    if (scrolling) return;
    const timer = setTimeout(() => wantEpg("list", list.slice(first, last + 1)), EPG_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [first, last, list, scrolling]);
  useEffect(() => () => wantEpg("list", []), []);

  return (
    <section
      aria-label="Channels"
      data-pane="channels"
      className="flex min-h-0 min-w-0 flex-col gap-4 px-5 pt-6"
    >
      <div className="relative flex items-center">
        <label htmlFor="channel-filter" className="sr-only">
          Filter channels
        </label>
        <input
          id="channel-filter"
          type="search"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder={`Filter ${categoryName}`}
          autoComplete="off"
          spellCheck={false}
          className="h-11 min-w-0 flex-1 rounded-full border border-line-strong bg-surface px-5 text-small text-text placeholder:text-text-placeholder focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent [&::-webkit-search-cancel-button]:hidden"
        />
        {filter && (
          <button
            type="button"
            aria-label="Clear filter"
            onClick={() => setFilter("")}
            className="absolute right-2 flex size-8 items-center justify-center rounded-full text-text-muted hover:text-text"
          >
            <Icon icon={Cancel01Icon} size={16} />
          </button>
        )}
      </div>

      {list.length === 0 ? (
        <EmptyState
          message={
            filter
              ? `No channel in ${categoryName} matches “${filter}”.`
              : categoryId === FAVORITES
                ? "No favorites yet. Press the heart on any channel."
                : "This category has no channels."
          }
        />
      ) : (
        <div
          ref={scroller}
          className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1 pb-6"
          data-channel-scroller
        >
          <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
            {items.map((row) => {
              const channel = channels.get(list[row.index]!);
              if (!channel) return null;
              return (
                <div
                  key={row.key}
                  className="absolute inset-x-0 top-0"
                  style={{ transform: `translateY(${row.start}px)` }}
                >
                  <ChannelRow
                    channel={channel}
                    selected={channel.id === selectedId}
                    numberWidth={numberWidth}
                    now={now}
                    lite={fast}
                    onPick={onPick}
                    onOpen={onOpen}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
