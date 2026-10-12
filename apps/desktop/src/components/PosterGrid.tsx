import { useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PosterItem } from "../data/catalog";
import { PosterCard } from "./PosterCard";

/** Narrowest poster before a column is dropped (Main.dc.html: ~173 px at 1440 wide). */
const MIN_CARD = 168;
/** DESIGN.md "grid gaps 14". */
const GAP = 14;
/** Caption under the poster: 10 px gap + one 13/1.4 line. */
const CAPTION = 10 + 19;
/** Space between rows. */
const ROW_GAP = 24;
const FAST_PX_PER_MS = 20;

interface PosterGridProps {
  ids: number[];
  items: Map<number, PosterItem>;
  progress?: Map<number, number>;
  onOpen: (id: number) => void;
  /** Restores the scroll position (returning from a detail page). */
  initialOffset?: number;
  onScrollOffset?: (offset: number) => void;
}

/**
 * Posters in as many columns as fit, virtualised by row with TanStack Virtual
 * (SPEC "Quality bar": 60 fps on 50,000 items). Arrow keys move between
 * posters and Enter opens one (DESIGN.md "Accessibility and input").
 */
export function PosterGrid({
  ids,
  items,
  progress,
  onOpen,
  initialOffset = 0,
  onScrollOffset,
}: PosterGridProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [focusedId, setFocusedId] = useState<number | null>(null);
  const [fast, setFast] = useState(false);
  const lastScroll = useRef({ offset: 0, time: 0 });

  useLayoutEffect(() => {
    const element = scroller.current;
    if (!element) return;
    // The content box: clientWidth includes the scroller's own padding.
    const measure = () => {
      const style = getComputedStyle(element);
      setWidth(
        element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
      );
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    return () => observer.disconnect();
  }, []);

  const columns = Math.max(2, Math.floor((width + GAP) / (MIN_CARD + GAP)));
  const cardWidth = width > 0 ? (width - GAP * (columns - 1)) / columns : MIN_CARD;
  const rowHeight = Math.round(cardWidth * 1.5 + CAPTION + ROW_GAP);
  const rows = Math.ceil(ids.length / columns);

  const virtualizer = useVirtualizer({
    count: rows,
    getScrollElement: () => scroller.current,
    estimateSize: () => rowHeight,
    overscan: 2,
    initialOffset,
    useFlushSync: false,
    onChange: (instance, sync) => {
      const offset = instance.scrollOffset ?? 0;
      const time = performance.now();
      const speed =
        Math.abs(offset - lastScroll.current.offset) / Math.max(1, time - lastScroll.current.time);
      lastScroll.current = { offset, time };
      setFast(sync && speed > FAST_PX_PER_MS);
      onScrollOffset?.(offset);
    },
  });

  // Row height follows the window width.
  useEffect(() => {
    virtualizer.measure();
  }, [rowHeight, virtualizer]);

  const moveFocus = useCallback(
    (delta: number) => {
      const from = focusedId === null ? -1 : ids.indexOf(focusedId);
      const to = Math.min(ids.length - 1, Math.max(0, from + delta));
      const id = ids[to];
      if (id === undefined) return;
      setFocusedId(id);
      virtualizer.scrollToIndex(Math.floor(to / columns), { align: "auto" });
      requestAnimationFrame(() =>
        document
          .querySelector<HTMLElement>(`[data-poster="${id}"]`)
          ?.focus({ preventScroll: true }),
      );
    },
    [focusedId, ids, columns, virtualizer],
  );

  const effectiveFocus =
    focusedId !== null && ids.includes(focusedId) ? focusedId : (ids[0] ?? null);

  return (
    <div
      ref={scroller}
      className="min-h-0 flex-1 overflow-y-auto px-8 pt-1 pb-10"
      data-poster-scroller
      onKeyDown={(event) => {
        const step = {
          ArrowRight: 1,
          ArrowLeft: -1,
          ArrowDown: columns,
          ArrowUp: -columns,
          PageDown: columns * 3,
          PageUp: -columns * 3,
        }[event.key];
        if (step === undefined) return;
        event.preventDefault();
        moveFocus(step);
      }}
    >
      <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((row) => (
          <div
            key={row.key}
            className="absolute inset-x-0 top-0 grid"
            style={{
              transform: `translateY(${row.start}px)`,
              gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
              columnGap: GAP,
            }}
          >
            {ids.slice(row.index * columns, row.index * columns + columns).map((id) => {
              const item = items.get(id);
              if (!item) return null;
              return (
                <PosterCard
                  key={id}
                  item={fast ? { ...item, image: null } : item}
                  progress={progress?.get(id)}
                  focused={id === effectiveFocus}
                  onOpen={onOpen}
                  onFocus={setFocusedId}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
