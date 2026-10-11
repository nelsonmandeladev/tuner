import { useEffect } from "react";
import { useNavigate } from "react-router";

let redirected = false;

/**
 * Dev only: when the app starts with `TUNER_M1_SUITE` set, open the player
 * debug screen, which then runs the M1 suite. The dynamic import keeps the
 * debug code out of release bundles.
 */
export function useDevAutorun() {
  const navigate = useNavigate();

  useEffect(() => {
    if (!import.meta.env.DEV || redirected) return;
    void import("../screens/debug/autorun")
      .then(({ devAutorunPlan }) => devAutorunPlan())
      .then((plan) => {
        if (!plan || redirected) return;
        redirected = true;
        void navigate("/debug/player");
      });
  }, [navigate]);
}
