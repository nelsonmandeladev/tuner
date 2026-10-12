import { useEffect } from "react";
import { useLocation } from "react-router";
import { closeSearch, prepareSearch } from "../../data/search";
import { useSession } from "../../data/session";
import { useGlobalShortcuts } from "../../hooks/useGlobalShortcuts";
import { SearchOverlay } from "./SearchOverlay";

/** After start, the index loads (or builds) this long after the first screen has painted. */
const PREPARE_AFTER_MS = 1500;

/**
 * Search everywhere once an account is open: the Ctrl/⌘ + K shortcut, the
 * overlay above every screen (the player included), and the index made ready
 * in the background soon after start so the first search is instant.
 */
export function GlobalSearch() {
  const ready = useSession((s) => s.phase === "ready");
  const { pathname } = useLocation();
  const enabled = ready && !pathname.startsWith("/connect");
  useGlobalShortcuts(enabled);

  useEffect(() => {
    if (!enabled) {
      closeSearch();
      return;
    }
    const timer = setTimeout(() => void prepareSearch(), PREPARE_AFTER_MS);
    return () => clearTimeout(timer);
  }, [enabled]);

  return enabled ? <SearchOverlay /> : null;
}
