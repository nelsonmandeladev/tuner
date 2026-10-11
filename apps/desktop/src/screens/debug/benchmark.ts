/**
 * M1 measurements: first frame from a stopped player, and zap between streams
 * in the same instance. Each step waits for the controller to record a timing
 * (or fail) before moving on, so only one stream is ever open.
 */

import { open, stop, type PlayerSource } from "../../player/controller";
import { usePlayer, type LoadTiming } from "../../player/store";

/** Gap after stopping, so the provider has released the connection before the next open. */
const REST_AFTER_STOP_MS = 2500;
/** Time each channel stays on screen before the next zap. */
const DWELL_MS = 3000;
const FIRST_FRAME_TIMEOUT_MS = 20_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Resolves with the next recorded timing, or rejects if the load fails or times out. */
function nextTiming(): Promise<LoadTiming> {
  const before = usePlayer.getState().timings.length;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      unsubscribe();
      reject(new Error("No first frame within 20 s"));
    }, FIRST_FRAME_TIMEOUT_MS);
    const unsubscribe = usePlayer.subscribe((state) => {
      const timing = state.timings[before];
      if (timing) {
        clearTimeout(timeout);
        unsubscribe();
        resolve(timing);
      } else if (state.status === "error") {
        clearTimeout(timeout);
        unsubscribe();
        reject(new Error(state.error ?? "Load failed"));
      }
    });
  });
}

async function timedOpen(source: PlayerSource) {
  const timing = nextTiming();
  await open(source);
  return timing;
}

export async function measureFirstFrame(source: PlayerSource, runs: number, signal: AbortSignal) {
  for (let i = 0; i < runs && !signal.aborted; i++) {
    await stop();
    await sleep(REST_AFTER_STOP_MS);
    await timedOpen(source);
    await sleep(DWELL_MS);
  }
}

/** Zaps through `sources` in order; the first open is a warm-up and not counted as a zap. */
export async function measureZap(sources: PlayerSource[], signal: AbortSignal) {
  for (const source of sources) {
    if (signal.aborted) return;
    await timedOpen(source);
    await sleep(DWELL_MS);
  }
}

export function summarize(timings: LoadTiming[], kind: LoadTiming["kind"]) {
  const values = timings
    .filter((t) => t.kind === kind)
    .map((t) => t.totalMs)
    .sort((a, b) => a - b);
  if (values.length === 0) return null;
  const mid = Math.floor(values.length / 2);
  const median =
    values.length % 2 ? values[mid]! : Math.round((values[mid - 1]! + values[mid]!) / 2);
  return { runs: values.length, median, worst: values[values.length - 1]! };
}
