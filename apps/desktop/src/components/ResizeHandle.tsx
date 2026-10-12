import { useRef, useState } from "react";
import { PANES, paneWidth, setPaneWidth, useLayout, type PaneId } from "../app/layout";
import { notifyLayoutMoved } from "../player/videoHole";

/** Arrow keys move the edge this far. */
const KEY_STEP = 16;

interface ResizeHandleProps {
  pane: PaneId;
  /** "end": the handle is the pane's right edge. "start": its left edge (a pane on the right). */
  edge: "end" | "start";
  /** Names the pane for screen readers ("Categories"). */
  label: string;
  /** The widest the pane may get now, so the flexible pane beside it keeps its minimum. */
  room: () => number;
}

/**
 * The draggable edge between two panes (M5 review). Drag it, or focus it and
 * use the arrow keys; a double-click puts the default width back. The width
 * is saved when the drag ends.
 */
export function ResizeHandle({ pane, edge, label, room }: ResizeHandleProps) {
  const width = useLayout((s) => s.panes[pane] ?? PANES[pane].initial);
  const [dragging, setDragging] = useState(false);
  const start = useRef({ x: 0, width: 0 });
  const { min, max } = PANES[pane];

  const resize = (next: number, save = false) => {
    setPaneWidth(pane, Math.min(next, Math.max(min, room())), save);
    notifyLayoutMoved();
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={`Resize ${label}`}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={width}
      tabIndex={0}
      className="group relative z-10 w-0 flex-none cursor-col-resize outline-none"
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        start.current = { x: event.clientX, width: paneWidth(pane) };
        setDragging(true);
      }}
      onPointerMove={(event) => {
        if (!dragging) return;
        const dx = event.clientX - start.current.x;
        resize(start.current.width + (edge === "end" ? dx : -dx));
      }}
      onPointerUp={(event) => {
        if (!dragging) return;
        event.currentTarget.releasePointerCapture(event.pointerId);
        setDragging(false);
        resize(paneWidth(pane), true);
      }}
      onDoubleClick={() => resize(PANES[pane].initial, true)}
      onKeyDown={(event) => {
        const step = { ArrowLeft: -KEY_STEP, ArrowRight: KEY_STEP }[event.key];
        if (step === undefined) return;
        event.preventDefault();
        event.stopPropagation();
        resize(paneWidth(pane) + (edge === "end" ? step : -step), true);
      }}
      data-resize={pane}
    >
      {/* An 8 px grab area centred on the edge; the line shows on hover, focus and drag. */}
      <span className="absolute inset-y-0 -left-1 w-2" />
      <span
        className={`pointer-events-none absolute inset-y-0 -left-px w-0.5 transition-colors duration-(--duration-hover) ${
          dragging
            ? "bg-accent"
            : "bg-transparent group-hover:bg-line-strong group-focus-visible:bg-accent"
        }`}
      />
    </div>
  );
}
