/**
 * Window layout the user controls: whether the sidebar is open. Remembered
 * in app.db, so the next start opens the same way.
 */

import { create } from "zustand";
import { readAppSetting, writeAppSetting } from "../data/session";

const SIDEBAR_OPEN = "ui.sidebarOpen";

export const useLayout = create<{ sidebarOpen: boolean }>(() => ({ sidebarOpen: true }));

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
