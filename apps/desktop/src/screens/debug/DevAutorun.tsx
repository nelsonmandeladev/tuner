import { invoke } from "@tauri-apps/api/core";
import { useEffect } from "react";
import { useNavigate } from "react-router";
import { devAutorunPlan } from "./autorun";
import { debugTrace } from "./debugSource";
import { runM2Suite, type DevCredentials } from "./m2Suite";
import { parseM3Plan, runM3Suite } from "./m3Suite";
import { parseM4Plan, runM4Suite } from "./m4Suite";
import { parseM5Plan, runM5Suite } from "./m5Suite";
import { useSession } from "../../data/session";

const STARTED_KEY = "tuner.m2SuiteStarted";
const M3_STARTED_KEY = "tuner.m3SuiteStarted";
const M4_STARTED_KEY = "tuner.m4SuiteStarted";
const M5_STARTED_KEY = "tuner.m5SuiteStarted";

/**
 * Dev only, rendered at the router root: starts the acceptance suites the app
 * was launched with. `TUNER_M1_SUITE` opens the player debug screen (which
 * runs it); `TUNER_M2_SUITE=1` runs the connect and sync checks. Each runs
 * once per window, also across hot reloads. `TUNER_M3_SUITE` runs the Live TV
 * and player checks (see m3Suite.ts).
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
    void invoke<string | null>("debug_m3_suite").then(async (value) => {
      if (cancelled || !value) return;
      const plan = parseM3Plan(value);
      if (!plan) {
        debugTrace("TUNER_M3_SUITE is set but not a valid plan (live=…,archive=…)");
        return;
      }
      // Wait for the cached library before starting (boot runs in main.tsx).
      while (useSession.getState().phase === "booting")
        await new Promise((r) => setTimeout(r, 100));
      if (cancelled || once(M3_STARTED_KEY)) return;
      void runM3Suite(plan, navigate, debugTrace);
    });
    void invoke<string | null>("debug_m4_suite").then(async (value) => {
      if (cancelled || !value) return;
      const plan = parseM4Plan(value);
      if (!plan) {
        debugTrace("TUNER_M4_SUITE is set but not a valid plan (movie=…,series=…)");
        return;
      }
      while (useSession.getState().phase === "booting")
        await new Promise((r) => setTimeout(r, 100));
      if (cancelled || once(M4_STARTED_KEY)) return;
      void runM4Suite(plan, navigate, debugTrace);
    });
    void invoke<string | null>("debug_m5_suite").then(async (value) => {
      if (cancelled || !value) return;
      const plan = parseM5Plan(value);
      if (!plan) {
        debugTrace("TUNER_M5_SUITE is set but not a valid plan (live=…,movie=…,series=…)");
        return;
      }
      while (useSession.getState().phase === "booting")
        await new Promise((r) => setTimeout(r, 100));
      if (cancelled || once(M5_STARTED_KEY)) return;
      void runM5Suite(plan, navigate, debugTrace);
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
