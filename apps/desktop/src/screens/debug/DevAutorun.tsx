import { invoke } from "@tauri-apps/api/core";
import { useEffect } from "react";
import { useNavigate } from "react-router";
import { devAutorunPlan } from "./autorun";
import { debugTrace } from "./debugSource";
import { runM2Suite, type DevCredentials } from "./m2Suite";

const STARTED_KEY = "tuner.m2SuiteStarted";

/**
 * Dev only, rendered at the router root: starts the acceptance suites the app
 * was launched with. `TUNER_M1_SUITE` opens the player debug screen (which
 * runs it); `TUNER_M2_SUITE=1` runs the connect and sync checks. Each runs
 * once per window, also across hot reloads.
 */
export default function DevAutorun() {
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    void devAutorunPlan().then((plan) => {
      if (!cancelled && plan) void navigate("/debug/player");
    });
    void invoke<DevCredentials | null>("debug_m2_credentials").then((creds) => {
      if (cancelled || !creds || once(STARTED_KEY)) return;
      void navigate("/connect");
      void runM2Suite(creds, debugTrace, () => void navigate("/", { replace: true }));
    });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return null;
}

/** True if already started in this window; marks it started otherwise. */
function once(key: string): boolean {
  try {
    if (sessionStorage.getItem(key) === "1") return true;
    sessionStorage.setItem(key, "1");
  } catch {
    // Without storage a hot reload may start the suite again; dev only.
  }
  return false;
}
