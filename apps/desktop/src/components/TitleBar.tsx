import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Cancel01Icon,
  Copy01Icon,
  MinusSignIcon,
  SidebarLeftIcon,
  SquareIcon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { useLocation, useNavigate, useNavigationType } from "react-router";
import { shortcutLabel } from "../app/platform";
import {
  runsUnderTitleBar,
  SIDEBAR_WIDTH,
  sidebarTransition,
  toggleSidebar,
  useLayout,
} from "../app/layout";
import { Icon } from "./Icon";
import { Logo } from "./Logo";

const inTauri = "__TAURI_INTERNALS__" in window;

/** Screens without the sidebar or a history to walk: the player and Connect. */
const BARE_ROUTES = ["/watch", "/connect", "/debug"];

/**
 * The window's own title bar (the OS frame is off, tauri.conf.json): sidebar
 * toggle, back and forward, the logo, a drag area (double-click maximizes),
 * and minimize / maximize / close. Hidden in full screen.
 */
export function TitleBar() {
  const { pathname } = useLocation();
  const bare = BARE_ROUTES.some((route) => pathname.startsWith(route));
  const sidebarOpen = useLayout((s) => s.sidebarOpen);
  const reduceMotion = useReducedMotion();
  const underBar = runsUnderTitleBar(pathname);
  const scrolled = useLayout((s) => s.underBarScrolled);
  const history = useHistoryEnds();
  const navigate = useNavigate();
  // Over a detail page's artwork (not yet scrolled) the buttons sit on dark
  // pictures in either theme; over the sidebar they follow the theme.
  const onArt = underBar && !scrolled ? "dark" : undefined;

  return (
    <header
      data-tauri-drag-region
      className={`isolate flex h-10 flex-none items-center gap-1 pl-2 text-text transition-colors duration-(--duration-in) ease-out select-none ${
        // On sidebar screens the bar floats over the content (detail heroes run up under it).
        bare ? "relative" : "absolute inset-x-0 top-0 z-20"
      } ${underBar && scrolled ? "bg-bg" : ""}`}
      data-titlebar
    >
      {/* Over the sidebar the bar takes its colour and its right border runs on up,
          so the window shows one line from top to bottom (M5 review, like Claude). */}
      {!bare && (
        <motion.div
          aria-hidden
          className="absolute inset-y-0 left-0 -z-10 overflow-hidden"
          initial={false}
          animate={{ width: sidebarOpen ? SIDEBAR_WIDTH : 0 }}
          transition={sidebarTransition(sidebarOpen, reduceMotion)}
        >
          <div
            data-tauri-drag-region
            className="h-full border-r border-line bg-bg-sidebar"
            style={{ width: SIDEBAR_WIDTH }}
          />
        </motion.div>
      )}
      {!bare && (
        <span className="contents" data-theme={sidebarOpen ? undefined : onArt}>
          <BarButton
            icon={SidebarLeftIcon}
            label={`${sidebarOpen ? "Hide" : "Show"} sidebar (${shortcutLabel("B")})`}
            pressed={sidebarOpen}
            onClick={toggleSidebar}
          />
          <BarButton
            icon={ArrowLeft01Icon}
            label="Back"
            disabled={!history.canBack}
            onClick={() => void navigate(-1)}
          />
          <BarButton
            icon={ArrowRight01Icon}
            label="Forward"
            disabled={!history.canForward}
            onClick={() => void navigate(1)}
          />
        </span>
      )}
      <span
        data-tauri-drag-region
        className="pl-2"
        data-theme={sidebarOpen && !bare ? undefined : onArt}
      >
        <Logo size="s" />
      </span>
      <div data-tauri-drag-region className="h-full flex-1" />
      <span className="contents" data-theme={onArt}>
        <WindowButtons />
      </span>
    </header>
  );
}

/** A round 28 px icon button on the bar. */
function BarButton({
  icon,
  label,
  disabled,
  pressed,
  onClick,
}: {
  icon: IconSvgElement;
  label: string;
  disabled?: boolean;
  pressed?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className="flex size-7 items-center justify-center rounded-full text-text-muted transition-colors duration-(--duration-hover) ease-out hover:bg-surface-active hover:text-text disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-text-muted"
    >
      <Icon icon={icon} size={18} />
    </button>
  );
}

/** Minimize, maximize/restore and close, in Windows' caption button shape (46 × 40, flush). */
function WindowButtons() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!inTauri) return;
    const appWindow = getCurrentWindow();
    let unlisten: (() => void) | undefined;
    const read = () =>
      void appWindow
        .isMaximized()
        .then(setMaximized)
        .catch(() => undefined);
    read();
    void appWindow.onResized(read).then((u) => (unlisten = u));
    return () => unlisten?.();
  }, []);

  const button =
    "flex h-10 w-11.5 items-center justify-center text-text-2 transition-colors duration-(--duration-hover) ease-out";
  return (
    <div className="flex h-full self-start">
      <button
        type="button"
        aria-label="Minimize"
        className={`${button} hover:bg-surface-active hover:text-text`}
        onClick={() => void getCurrentWindow().minimize()}
      >
        <Icon icon={MinusSignIcon} size={16} />
      </button>
      <button
        type="button"
        aria-label={maximized ? "Restore" : "Maximize"}
        className={`${button} hover:bg-surface-active hover:text-text`}
        onClick={() => void getCurrentWindow().toggleMaximize()}
      >
        <Icon icon={maximized ? Copy01Icon : SquareIcon} size={14} />
      </button>
      <button
        type="button"
        aria-label="Close"
        className={`${button} hover:bg-window-close hover:text-text`}
        onClick={() => void getCurrentWindow().close()}
      >
        <Icon icon={Cancel01Icon} size={16} />
      </button>
    </div>
  );
}

/**
 * Whether Back and Forward have somewhere to go. React Router keeps the
 * position in `history.state.idx`; a new page after going back drops the
 * entries ahead of it, so the furthest index resets on every push.
 */
function useHistoryEnds() {
  const { key } = useLocation();
  const type = useNavigationType();
  const index = (window.history.state as { idx?: number } | null)?.idx ?? 0;
  const [furthest, setFurthest] = useState({ key, value: index });
  if (furthest.key !== key) {
    // Adjusting state while rendering (React's pattern for derived state): once per location.
    setFurthest({ key, value: type === "POP" ? Math.max(furthest.value, index) : index });
  }
  return { canBack: index > 0, canForward: index < furthest.value };
}
