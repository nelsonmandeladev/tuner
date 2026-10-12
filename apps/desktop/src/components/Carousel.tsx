import { ArrowLeft01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { Children, useCallback, useEffect, useRef, type ReactNode } from "react";
import type { CarouselControls } from "../hooks/useCarouselControls";
import { Icon } from "./Icon";

/** DESIGN.md "grid gaps 14". */
const GAP = 14;

interface CarouselProps {
  /** Cards shown side by side (Main.dc.html: five channel cards). */
  perPage: number;
  /** Called with the first and last index on screen (to load what they show). */
  onVisible?: (first: number, last: number) => void;
  /** Marks the scroller for checks (`data-row`). */
  row: string;
  children: ReactNode;
}

/**
 * One row of cards that scrolls sideways a page at a time (Home's favorite
 * channels). Cards keep the grid's width; the arrows live next to the row's
 * title (see `CarouselArrows`), so the scroller hands them out through
 * `onControls`.
 */
export function Carousel({
  perPage,
  onVisible,
  row,
  children,
  onControls,
}: CarouselProps & { onControls: (controls: CarouselControls) => void }) {
  const scroller = useRef<HTMLDivElement>(null);
  const count = Children.count(children);

  const page = useCallback((direction: -1 | 1) => {
    const element = scroller.current;
    if (!element) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    element.scrollBy({
      left: direction * (element.clientWidth + GAP),
      behavior: reduce ? "auto" : "smooth",
    });
  }, []);

  const update = useCallback(() => {
    const element = scroller.current;
    if (!element) return;
    const max = element.scrollWidth - element.clientWidth;
    onControls({ canBack: element.scrollLeft > 1, canForward: element.scrollLeft < max - 1, page });
    const step = (element.clientWidth + GAP) / perPage;
    const first = Math.floor(element.scrollLeft / step);
    onVisible?.(first, Math.min(count - 1, first + perPage - 1));
  }, [onControls, onVisible, page, perPage, count]);

  useEffect(() => {
    const element = scroller.current;
    if (!element) return;
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [update]);

  return (
    <div
      ref={scroller}
      onScroll={update}
      className="flex snap-x snap-mandatory [scrollbar-width:none] gap-3.5 overflow-x-auto"
      data-row={row}
    >
      {Children.map(children, (child) => (
        <div
          className="flex min-w-0 flex-none snap-start [&>*]:w-full"
          style={{ flexBasis: `calc((100% - ${(perPage - 1) * GAP}px) / ${perPage})` }}
        >
          {child}
        </div>
      ))}
    </div>
  );
}

/** The previous/next buttons beside a carousel's title; hidden when every card fits. */
export function CarouselArrows({
  controls,
  label,
}: {
  controls: CarouselControls | null;
  label: string;
}) {
  if (!controls || (!controls.canBack && !controls.canForward)) return null;
  const arrow = (direction: -1 | 1) => (
    <button
      type="button"
      aria-label={direction < 0 ? `Previous ${label}` : `Next ${label}`}
      disabled={direction < 0 ? !controls.canBack : !controls.canForward}
      onClick={() => controls.page(direction)}
      className="flex size-10 items-center justify-center rounded-full border border-line-strong bg-surface text-text transition-colors duration-(--duration-hover) ease-out hover:bg-surface-raised disabled:cursor-default disabled:opacity-40 disabled:hover:bg-surface"
    >
      <Icon icon={direction < 0 ? ArrowLeft01Icon : ArrowRight01Icon} size={18} />
    </button>
  );
  return (
    <span className="flex items-center gap-2" data-carousel-arrows>
      {arrow(-1)}
      {arrow(1)}
    </span>
  );
}
