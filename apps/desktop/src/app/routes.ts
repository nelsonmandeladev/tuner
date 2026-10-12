import {
  Film01Icon,
  Home01Icon,
  Search01Icon,
  Settings01Icon,
  Tv01Icon,
  PlayListIcon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";

export interface NavRoute {
  path: string;
  label: string;
  icon: IconSvgElement;
}

/**
 * The sidebar's destinations, in order (SPEC "Features"). Search, the fifth,
 * is an overlay over any screen rather than a route (see `searchNav`).
 */
export const mainRoutes = [
  { path: "/", label: "Home", icon: Home01Icon },
  { path: "/live", label: "Live TV", icon: Tv01Icon },
  { path: "/movies", label: "Movies", icon: Film01Icon },
  { path: "/series", label: "Series", icon: PlayListIcon },
] as const satisfies readonly NavRoute[];

export const searchNav = { label: "Search", icon: Search01Icon } as const;

export const settingsRoute = {
  path: "/settings",
  label: "Settings",
  icon: Settings01Icon,
} as const satisfies NavRoute;
