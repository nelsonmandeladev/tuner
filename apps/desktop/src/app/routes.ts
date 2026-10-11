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

/** The five destinations in the sidebar, in order (SPEC "Features"). */
export const mainRoutes = [
  { path: "/", label: "Home", icon: Home01Icon },
  { path: "/live", label: "Live TV", icon: Tv01Icon },
  { path: "/movies", label: "Movies", icon: Film01Icon },
  { path: "/series", label: "Series", icon: PlayListIcon },
  { path: "/search", label: "Search", icon: Search01Icon },
] as const satisfies readonly NavRoute[];

export const settingsRoute = {
  path: "/settings",
  label: "Settings",
  icon: Settings01Icon,
} as const satisfies NavRoute;
