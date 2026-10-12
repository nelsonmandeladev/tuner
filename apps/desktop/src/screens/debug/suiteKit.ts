/**
 * Shared helpers for the dev-only acceptance suites (M3, M4): waiting on
 * stores and the DOM, user-like clicks and key presses, frame timing and the
 * mpv/DOM alignment check.
 */

import { mpv } from "../../player/mpv";
import { usePlayer, type LoadTiming, type PlayerState } from "../../player/store";

export type Log = (line: string) => void;
export type Check = (name: string, pass: boolean, detail: string) => void;

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
export const clock = () => new Date().toTimeString().slice(0, 8);
export const player = () => usePlayer.getState();
export const round = (n: number) => Math.round(n);

export function waitFor(
  predicate: (s: PlayerState) => boolean,
  timeoutMs: number,
): Promise<boolean> {
  return new Promise((resolve) => {
    if (predicate(player())) return resolve(true);
    const timer = setTimeout(() => {
      unsubscribe();
      resolve(false);
    }, timeoutMs);
    const unsubscribe = usePlayer.subscribe((s) => {
      if (!predicate(s)) return;
      clearTimeout(timer);
      unsubscribe();
      resolve(true);
    });
  });
}

export async function until(
  test: () => boolean,
  timeoutMs: number,
  everyMs = 50,
): Promise<boolean> {
  const end = performance.now() + timeoutMs;
  while (performance.now() < end) {
    if (test()) return true;
    await sleep(everyMs);
  }
  return test();
}

/** Resolves after the next frame has painted. */
export const afterPaint = () =>
  new Promise<number>((resolve) =>
    requestAnimationFrame(() => setTimeout(() => resolve(performance.now()), 0)),
  );

export const $ = <T extends HTMLElement = HTMLElement>(selector: string) =>
  document.querySelector<T>(selector);

export function click(element: Element | null) {
  if (!element) throw new Error("nothing to click");
  element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
}

/** A key press where the user's focus is, as the browser would send it. */
export function press(key: string) {
  const target = document.activeElement ?? document.body;
  target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  return performance.now();
}

/** Time from `t0` until `read()` returns something other than `before`, then painted. */
export async function untilChanged(read: () => string | null, before: string | null, t0: number) {
  const changed = await until(() => read() !== before, 2000, 2);
  if (!changed) return null;
  return (await afterPaint()) - t0;
}

/** The next timing the controller records, or null after `timeoutMs`. */
export function nextTiming(timeoutMs = 25_000): Promise<LoadTiming | null> {
  const before = player().timings.length;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      unsubscribe();
      resolve(null);
    }, timeoutMs);
    const unsubscribe = usePlayer.subscribe((s) => {
      const timing = s.timings[before];
      if (timing || s.status === "error") {
        clearTimeout(timer);
        unsubscribe();
        resolve(timing ?? null);
      }
    });
  });
}

export const stats = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return "n=0";
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
  return `median ${round(median)} ms, worst ${round(sorted[sorted.length - 1]!)} ms (n=${sorted.length})`;
};
export const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length === 0 ? Number.NaN : sorted[Math.floor(sorted.length / 2)]!;
};

/** Calls `onFrame` with each frame's interval for `ms`. */
export function rafLoop(ms: number, onFrame: (dt: number) => void): Promise<void> {
  return new Promise((resolve) => {
    const end = performance.now() + ms;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      if (dt > 0) onFrame(dt);
      if (now < end) requestAnimationFrame(tick);
      else resolve();
    };
    requestAnimationFrame((now) => {
      last = now;
      requestAnimationFrame(tick);
    });
  });
}

/**
 * Compares where mpv puts the video with where the hole is in the DOM (as in
 * the M1 suite): mpv's window is the whole client area, the video sits inside
 * it at `video-margin-ratio-*`.
 */
export async function alignment() {
  const surface = document.querySelector<HTMLElement>("[data-video-surface]");
  if (!surface) return { ok: false, detail: "no surface" };
  const dpr = window.devicePixelRatio;
  const [w, h, l, r, t, b] = await Promise.all(
    [
      "osd-width",
      "osd-height",
      "video-margin-ratio-left",
      "video-margin-ratio-right",
      "video-margin-ratio-top",
      "video-margin-ratio-bottom",
    ].map((name) => mpv.getNumber(name)),
  );
  if ([w, h, l, r, t, b].some((v) => v === null || v === undefined))
    return { ok: false, detail: "mpv properties unavailable" };
  const rect = surface.getBoundingClientRect();
  const mpvBox = [l! * w!, t! * h!, (1 - r!) * w!, (1 - b!) * h!].map(Math.round);
  const domBox = [rect.left, rect.top, rect.right, rect.bottom].map((v) => Math.round(v * dpr));
  const worst = Math.max(...mpvBox.map((v, i) => Math.abs(v - domBox[i]!)));
  return {
    ok: worst <= 2,
    detail: `video box mpv [${mpvBox}] dom [${domBox}] worst ${worst}px (dpr ${dpr})`,
  };
}
