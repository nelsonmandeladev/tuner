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
  /** A page that runs under the title bar (detail heroes) has been scrolled: the bar gets its background. */
  underBarScrolled: boolean;
}>(() => ({ sidebarOpen: true, underBarScrolled: false }));

/** Pages whose artwork runs up under the title bar (M5 review): movie and series details. */
export const runsUnderTitleBar = (pathname: string) => /^\/(movies|series)\/[^/]+/.test(pathname);

/** Reads the remembered layout (once, at start). */
export async function loadLayout() {
  const value = await readAppSetting(SIDEBAR_OPEN).catch(() => null);
  if (value !== null) useLayout.setState({ sidebarOpen: value !== "0" });
}

export function toggleSidebar() {
  const sidebarOpen = !useLayout.getState().sidebarOpen;
  useLayout.setState({ sidebarOpen });
  void writeAppSetting(SIDEBAR_OPEN, sidebarOpen ? "1" : "0").catch(() => undefined);
}
