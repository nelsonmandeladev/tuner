/**
 * M1 acceptance suite (docs/ROADMAP.md "M1"), dev builds only.
 *
 * Runs by itself when the app starts with `TUNER_M1_SUITE=1`, so the checks
 * need no clicking and can be repeated. Every line goes to the `tauri dev`
 * terminal through `debugTrace` (redacted); test items are named by stream id
 * only. One stream at a time, always: each step waits for the previous load to
 * settle, and the suite stops the player at the end.
 */

import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import {
  open,
  setAudioTrack,
  setSubtitleTrack,
  simulateDrop,
  stop,
  type PlayerSource,
} from "../../player/controller";
import { mpv } from "../../player/mpv";
import { usePlayer, type PlayerState } from "../../player/store";
import { measureFirstFrame, measureZap, summarize } from "./benchmark";
import { debugSource, type DebugPick } from "./debugSource";

export interface SuitePlan {
  live: number;
  /** A live channel to try for HEVC. */
  liveHevc: number;
  /** VOD items: [stream id, container extension]. */
  vodAc3: [number, string];
  vodEac3: [number, string];
}

/**
 * Parses `TUNER_M1_SUITE`, e.g. `live=1234,hevc=1240,ac3=5678.mkv,eac3=5679.mkv`.
 * Test items come from the environment, never from code (CLAUDE.md rule 4).
 */
export function parsePlan(value: string): SuitePlan | null {
  const entries = Object.fromEntries(
    value.split(",").map((part) => part.trim().split("=") as [string, string]),
  );
  const vod = (v: string | undefined): [number, string] | null => {
    const [id, ext] = (v ?? "").split(".");
    return Number(id) > 0 && ext ? [Number(id), ext] : null;
  };
  const liveId = Number(entries.live);
  const hevc = Number(entries.hevc);
  const ac3 = vod(entries.ac3);
  const eac3 = vod(entries.eac3);
  if (!(liveId > 0 && hevc > 0 && ac3 && eac3)) return null;
  return { live: liveId, liveHevc: hevc, vodAc3: ac3, vodEac3: eac3 };
}

export interface SuiteControls {
  setLayout: (layout: "preview" | "full") => void;
}

type Log = (line: string) => void;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const state = () => usePlayer.getState();
const clock = () => new Date().toTimeString().slice(0, 8);

function waitFor(predicate: (s: PlayerState) => boolean, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    if (predicate(state())) return resolve(true);
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

const source = (pick: DebugPick): PlayerSource => debugSource(pick);
const live = (id: number, ext = "ts") => source({ kind: "live", id, ext });

export async function runM1Suite(plan: SuitePlan, controls: SuiteControls, log: Log) {
  const results: Record<string, string> = {};
  const check = (name: string, pass: boolean, detail: string) => {
    results[name] = `${pass ? "PASS" : "FAIL"} ${detail}`;
    log(`${clock()} RESULT ${name}: ${results[name]}`);
  };
  const step = (name: string) => log(`${clock()} STEP ${name}`);
  const abort = new AbortController();

  try {
    step(`first frame x5, live ${plan.live}.ts`);
    await measureFirstFrame(live(plan.live), 5, abort.signal);
    const first = summarize(state().timings, "first");
    check("first-frame", !!first && first.median < 1500, JSON.stringify(first));

    step(`zap x5, live ${plan.live}..${plan.live + 5}.ts`);
    await measureZap(
      Array.from({ length: 6 }, (_, i) => live(plan.live + i)),
      abort.signal,
    );
    const zap = summarize(state().timings, "zap");
    check("zap", !!zap && zap.median < 1000, JSON.stringify(zap));

    step("layout, full screen and resize keep one load and stay aligned");
    await open(live(plan.live));
    await waitFor((s) => s.status === "playing", 15_000);
    await layoutChecks(controls, check, log);

    step(`HEVC live ${plan.liveHevc}.ts`);
    await open(live(plan.liveHevc));
    const hevcUp = await waitFor((s) => s.status === "playing", 15_000);
    await sleep(3000);
    check("hevc-live", hevcUp && state().video.codec === "hevc", describe());

    for (const [name, [id, ext]] of [
      ["vod-ac3", plan.vodAc3],
      ["vod-eac3", plan.vodEac3],
    ] as const) {
      step(`${name}: movie ${id}.${ext}`);
      await vodChecks(name, source({ kind: "movie", id, ext }), check);
    }

    step("reconnect after a drop (simulated) on live");
    await open(live(plan.live));
    await waitFor((s) => s.status === "playing", 15_000);
    const loadsBefore = state().loads;
    const t0 = performance.now();
    simulateDrop();
    const sawToast = await waitFor((s) => s.status === "reconnecting", 2000);
    const back = await waitFor((s) => s.status === "playing", 20_000);
    check(
      "reconnect-recovers",
      sawToast && back,
      `back in ${Math.round(performance.now() - t0)} ms, loads +${state().loads - loadsBefore}`,
    );

    step("reconnect gives up after 3 tries (stream id that does not exist)");
    const attempts: string[] = [];
    const t1 = performance.now();
    const unsubscribe = usePlayer.subscribe((s, prev) => {
      if (s.reconnectAttempt !== prev.reconnectAttempt && s.reconnectAttempt > 0)
        attempts.push(`#${s.reconnectAttempt}@${Math.round(performance.now() - t1)}ms`);
    });
    await open(live(1));
    const gaveUp = await waitFor((s) => s.status === "error", 40_000);
    unsubscribe();
    check(
      "reconnect-gives-up",
      gaveUp && attempts.length === 3,
      `${attempts.join(" ")} then "${state().error}" at ${Math.round(performance.now() - t1)} ms`,
    );
  } catch (error) {
    log(`${clock()} SUITE ERROR ${String(error)}`);
  } finally {
    await stop();
    controls.setLayout("preview");
    log(`${clock()} SUITE DONE ${JSON.stringify(results)}`);
  }
}

function describe() {
  const s = state();
  const audio = s.audioTracks.find((t) => t.selected);
  return `video ${s.video.codec} ${s.video.width}x${s.video.height}, audio ${audio?.codec} ${audio?.channels}ch, hwdec ${s.hwdec}, status ${s.status}`;
}

async function vodChecks(
  name: string,
  vod: PlayerSource,
  check: (name: string, pass: boolean, detail: string) => void,
) {
  await open(vod);
  const up = await waitFor((s) => s.status === "playing", 30_000);
  // 4K VOD may still be filling its cache right after the first frame.
  const advancing = await waitFor((s) => (s.timePos ?? 0) > 3, 30_000);
  const s = state();
  const audio = s.audioTracks.find((t) => t.selected);
  check(`${name}-plays`, up && advancing && !!audio, describe());

  const tracks = `audio [${s.audioTracks.map((t) => `${t.id}:${t.lang ?? "?"}:${t.codec}`).join(", ")}] subs [${s.subtitleTracks.map((t) => `${t.id}:${t.lang ?? "?"}:${t.codec}`).join(", ")}]`;
  const otherAudio = s.audioTracks.find((t) => !t.selected);
  if (otherAudio) {
    await setAudioTrack(otherAudio.id);
    await sleep(1500);
  }
  const audioSwitched =
    !otherAudio || state().audioTracks.find((t) => t.selected)?.id === otherAudio.id;
  const firstSub = s.subtitleTracks[0];
  if (firstSub) {
    await setSubtitleTrack(firstSub.id);
    await sleep(1000);
  }
  const subOn = !firstSub || state().subtitleTracks.find((t) => t.selected)?.id === firstSub.id;
  if (firstSub) await setSubtitleTrack("no");
  check(`${name}-tracks`, audioSwitched && subOn, tracks);

  await mpv.seekTo(60);
  const seeked = await waitFor((p) => (p.timePos ?? 0) >= 59 && (p.timePos ?? 0) < 70, 15_000);
  await mpv.setPause(true);
  await sleep(300);
  const pausedAt = state().timePos ?? 0;
  await sleep(2000);
  const held = state().paused && Math.abs((state().timePos ?? 0) - pausedAt) < 0.1;
  await mpv.setPause(false);
  await mpv.setVolume(50);
  await mpv.setMute(true);
  await sleep(500);
  const volumeOk = Math.round(state().volume) === 50 && state().mute;
  await mpv.setMute(false);
  await mpv.setVolume(100);
  check(
    `${name}-controls`,
    seeked && held && volumeOk,
    `seek ${seeked}, pause ${held}, volume+mute ${volumeOk}`,
  );

  const duration = state().duration;
  if (duration) {
    await mpv.seekTo(duration - 4);
    const ended = await waitFor((p) => p.status === "ended", 20_000);
    check(`${name}-end-of-file`, ended, `duration ${Math.round(duration)} s`);
  }
}

async function layoutChecks(
  controls: SuiteControls,
  check: (name: string, pass: boolean, detail: string) => void,
  log: Log,
) {
  const appWindow = getCurrentWindow();
  const loads = state().loads;
  // A provider-side drop reloads through reconnect; that is not a layout reload.
  let reconnects = 0;
  const unsubscribe = usePlayer.subscribe((s, prev) => {
    if (s.status === "reconnecting" && prev.status !== "reconnecting") reconnects++;
  });
  const results: string[] = [];
  const settle = async (label: string) => {
    await sleep(1500);
    const a = await alignment();
    log(`${clock()} ALIGN ${label}: ${a.detail}`);
    results.push(`${label}:${a.ok ? "ok" : "OFF"}`);
    return a.ok;
  };

  let ok = await settle("preview");
  controls.setLayout("full");
  ok = (await settle("fill-window")) && ok;
  await appWindow.setFullscreen(true);
  ok = (await settle("full-screen")) && ok;
  await appWindow.setFullscreen(false);
  controls.setLayout("preview");
  ok = (await settle("preview-again")) && ok;
  await appWindow.setSize(new LogicalSize(1100, 700));
  ok = (await settle("resize-1100x700")) && ok;
  await appWindow.setSize(new LogicalSize(1600, 960));
  ok = (await settle("resize-1600x960")) && ok;
  await appWindow.setSize(new LogicalSize(1440, 900));
  ok = (await settle("resize-1440x900")) && ok;

  unsubscribe();
  const reloads = state().loads - loads - reconnects;
  check(
    "same-instance-no-reload",
    reloads === 0,
    `extra loads not caused by reconnect: ${reloads} (reconnects during step: ${reconnects})`,
  );
  check("aligned", ok, results.join(" "));
}

/**
 * Compares where mpv puts the video with where the hole is in the DOM.
 * mpv's window is the whole client area (`osd-width/height`, device pixels);
 * the video sits inside it at `video-margin-ratio-*`.
 */
async function alignment() {
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
  const webW = Math.round(window.innerWidth * dpr);
  const webH = Math.round(window.innerHeight * dpr);
  // Video box in device pixels, as mpv will place it vs. as the DOM has it.
  const mpvBox = [l! * w!, t! * h!, (1 - r!) * w!, (1 - b!) * h!].map(Math.round);
  const domBox = [rect.left, rect.top, rect.right, rect.bottom].map((v) => Math.round(v * dpr));
  const worst = Math.max(...mpvBox.map((v, i) => Math.abs(v - domBox[i]!)));
  const windowMatches = Math.abs(w! - webW) <= 2 && Math.abs(h! - webH) <= 2;
  return {
    ok: windowMatches && worst <= 2,
    detail: `mpv window ${w}x${h} vs webview ${webW}x${webH}; video box mpv [${mpvBox}] dom [${domBox}] worst ${worst}px (dpr ${dpr})`,
  };
}
