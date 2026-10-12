/**
 * Window layout the user controls: whether the sidebar is open. Remembered
 * in app.db, so the next start opens the same way.
 */

import { create } from "zustand";
import { readAppSetting, writeAppSetting } from "../data/session";

const SIDEBAR_OPEN = "ui.sidebarOpen";

/** The sidebar's width (DESIGN.md "Spacing and sizes"); the title bar's left panel matches it. */
export const SIDEBAR_WIDTH = 248;

/** Panel in 200 ms, out 150 ms (DESIGN.md "Motion"); instant under reduced motion. */
export function sidebarTransition(open: boolean, reduceMotion: boolean | null) {
  if (reduceMotion) return { duration: 0 };
  return open
    ? ({ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] } as const)
    : ({ duration: 0.15, ease: "easeIn" } as const);
}

export const useLayout = create<{
  sidebarOpen: boolean;
  /** Widths the user dragged panes to, by pane id (see PANES). */
  panes: Partial<Record<PaneId, number>>;
  /** A page that runs under the title bar (detail heroes) has been scrolled: the bar gets its background. */
  underBarScrolled: boolean;
}>(() => ({ sidebarOpen: true, panes: {}, underBarScrolled: false }));

/**
 * Panes the user can resize (M5 review), with their default and limits in
 * CSS px. The sidebar is not one of them.
 */
export const PANES = {
  /** Live TV's categories (264 since the M3 review). */
  "live.categories": { initial: 264, min: 200, max: 440 },
  /** Live TV's preview, on the right. */
  "live.preview": { initial: 460, min: 320, max: 760 },
  /** The category rail in Movies and Series. */
  "catalog.categories": { initial: 264, min: 200, max: 440 },
} as const;
export type PaneId = keyof typeof PANES;

/** The narrowest the flexible middle (channel list, poster grid) may get while dragging. */
export const FLEX_PANE_MIN = 320;

const PANE_WIDTHS = "ui.paneWidths";

export function paneWidth(id: PaneId): number {
  return useLayout.getState().panes[id] ?? PANES[id].initial;
}

/** Sets a pane's width (clamped to its limits); `save` stores it for the next start. */
export function setPaneWidth(id: PaneId, width: number, save = false) {
  const { min, max } = PANES[id];
  const panes = {
    ...useLayout.getState().panes,
    [id]: Math.round(Math.min(max, Math.max(min, width))),
  };
  useLayout.setState({ panes });
  if (save) void writeAppSetting(PANE_WIDTHS, JSON.stringify(panes)).catch(() => undefined);
}

/** Pages whose artwork runs up under the title bar (M5 review): movie and series details. */
export const runsUnderTitleBar = (pathname: string) => /^\/(movies|series)\/[^/]+/.test(pathname);

/** Reads the remembered layout (once, at start). */
export async function loadLayout() {
  const [open, widths] = await Promise.all([
    readAppSetting(SIDEBAR_OPEN).catch(() => null),
    readAppSetting(PANE_WIDTHS).catch(() => null),
  ]);
  if (open !== null) useLayout.setState({ sidebarOpen: open !== "0" });
  if (widths !== null) {
    try {
      const parsed = JSON.parse(widths) as Partial<Record<PaneId, number>>;
      const panes: Partial<Record<PaneId, number>> = {};
      for (const id of Object.keys(PANES) as PaneId[]) {
        const width = parsed[id];
        if (typeof width === "number")
          panes[id] = Math.min(PANES[id].max, Math.max(PANES[id].min, width));
      }
      useLayout.setState({ panes });
    } catch {
      // A damaged value: the defaults.
    }
  }
}

export function toggleSidebar() {
  const sidebarOpen = !useLayout.getState().sidebarOpen;
  useLayout.setState({ sidebarOpen });
  void writeAppSetting(SIDEBAR_OPEN, sidebarOpen ? "1" : "0").catch(() => undefined);
}

/**
 * How wide `pane` may get in `container` while the others keep their widths
 * and the flexible pane its minimum.
 */
export function roomFor(container: HTMLElement | null, pane: PaneId, others: PaneId[]): number {
  if (!container) return PANES[pane].max;
  return container.clientWidth - others.reduce((sum, id) => sum + paneWidth(id), 0) - FLEX_PANE_MIN;
}
