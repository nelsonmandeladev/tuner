import { useEffect } from "react";
import { useNavigate } from "react-router";
import { hasModKey } from "../app/platform";
import { toggleSidebar } from "../app/layout";
import { toggleSearch } from "../data/search";

/**
 * App-wide shortcuts, on every screen including the player: Ctrl/⌘ + K opens
 * and closes search (SPEC §7); Ctrl/⌘ + B shows or hides the sidebar.
 * Mounted once, with the search overlay.
 */
export function useGlobalShortcuts(enabled: boolean) {
  const navigate = useNavigate();

  useEffect(() => {
    if (!enabled) return;
    function onKeyDown(event: KeyboardEvent) {
      if (hasModKey(event) && !event.shiftKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        toggleSearch();
      } else if (hasModKey(event) && !event.shiftKey && event.key.toLowerCase() === "b") {
        event.preventDefault();
        toggleSidebar();
      } else if (import.meta.env.DEV && hasModKey(event) && event.shiftKey && event.key === "D") {
        // Dev only: the M1 player debug screen, which is not in the sidebar.
        event.preventDefault();
        void navigate("/debug/player");
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, navigate]);
}
