import { useEffect } from "react";
import { useNavigate } from "react-router";
import { hasModKey } from "../app/platform";

/** App-wide shortcuts that work from any screen. */
export function useGlobalShortcuts() {
  const navigate = useNavigate();

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (hasModKey(event) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        // M5 turns this into the search overlay; until then it opens the Search screen.
        void navigate("/search");
      } else if (import.meta.env.DEV && hasModKey(event) && event.shiftKey && event.key === "D") {
        // Dev only: the M1 player debug screen, which is not in the sidebar.
        event.preventDefault();
        void navigate("/debug/player");
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigate]);
}
