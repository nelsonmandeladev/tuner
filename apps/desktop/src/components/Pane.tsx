import type { ReactNode } from "react";
import { FLEX_PANE_MIN, PANES, useLayout, type PaneId } from "../app/layout";

/**
 * A pane the user can resize (with a ResizeHandle beside it). It may shrink
 * below its saved width, down to its minimum, when the window is narrow.
 */
export function Pane({ id, children }: { id: PaneId; children: ReactNode }) {
  const width = useLayout((s) => s.panes[id] ?? PANES[id].initial);
  return (
    <div
      className="grid min-h-0 min-w-0 grid-rows-[minmax(0,1fr)]"
      style={{ flex: `0 1 ${width}px`, minWidth: PANES[id].min }}
      data-pane-width={id}
    >
      {children}
    </div>
  );
}

/** The pane that takes the rest of the width (channel list, poster grid). */
export function FlexPane({ children }: { children: ReactNode }) {
  return (
    <div
      className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)]"
      style={{ minWidth: FLEX_PANE_MIN }}
    >
      {children}
    </div>
  );
}
