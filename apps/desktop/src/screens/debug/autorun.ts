import { invoke } from "@tauri-apps/api/core";

let plan: Promise<string | null> | null = null;

/** The `TUNER_M1_SUITE` plan the app was started with, or null. Asked once per run. */
export function devAutorunPlan(): Promise<string | null> {
  plan ??= invoke<string | null>("debug_autorun").catch(() => null);
  return plan;
}
