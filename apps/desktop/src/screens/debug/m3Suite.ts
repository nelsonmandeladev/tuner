/**
 * M3 acceptance suite (docs/ROADMAP.md "M3"), dev builds only.
 *
 * Runs when the app starts with `TUNER_M3_SUITE="live=<id>,archive=<id>"`
 * (stream ids from the synced library; never in code, CLAUDE.md rule 4). It
 * drives the real screens the way a user would, through DOM clicks and key
 * events, and prints `RESULT` lines (ids, counts and timings only) to the
 * `tauri dev` terminal through the redacting trace.
 *
 * One stream at a time: every step waits for the previous load to settle,
 * and `active_cons` is checked before the first stream and sampled all along.
 */

import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import { appCacheDir, join } from "@tauri-apps/api/path";
import type { NavigateFunction } from "react-router";
import { PANES, setPaneWidth, useLayout } from "../../app/layout";
import { useEpg } from "../../data/epg";
import {
  ALL_CHANNELS,
  FAVORITES,
  categoriesOfChannel,
  selectCategory,
  setHidden,
  useLive,
} from "../../data/live";
import { activeClient, activeLibrary, useSession } from "../../data/session";
import { open } from "../../player/controller";
import { useFullscreen } from "../../player/fullscreen";
import { mpv } from "../../player/mpv";
import { catchupPosition, stopPlayback, tune, useTuner } from "../../player/tuner";
import { summarize } from "./benchmark";
import { personalBackup } from "./personalBackup";
import {
  $,
  afterPaint,
  alignment,
  click,
  clock,
  median,
  nextTiming,
  player,
  press,
  rafLoop,
  round,
  sleep,
  stats,
  until,
  untilChanged,
  waitFor,
  type Check,
  type Log,
} from "./suiteKit";

export interface M3Plan {
  live: number;
  archive: number;
  zaps: number;
  firsts: number;
}

/** `live=1234,archive=1240[,zaps=6][,firsts=5]` */
export function parseM3Plan(value: string): M3Plan | null {
  const entries = Object.fromEntries(
    value.split(",").map((part) => part.trim().split("=") as [string, string]),
  );
  const live = Number(entries.live);
  const archive = Number(entries.archive);
  if (!(live > 0 && archive > 0)) return null;
  return {
    live,
    archive,
    zaps: Number(entries.zaps) > 0 ? Number(entries.zaps) : 6,
    firsts: Number(entries.firsts) > 0 ? Number(entries.firsts) : 5,
  };
}

export async function runM3Suite(plan: M3Plan, navigate: NavigateFunction, log: Log) {
  const results: Record<string, string> = {};
  const check: Check = (name, pass, detail) => {
    results[name] = `${pass ? "PASS" : "FAIL"} ${detail}`;
    log(`${clock()} RESULT ${name}: ${results[name]}`);
  };
  const info = (name: string, detail: string) => {
    results[name] = `INFO ${detail}`;
    log(`${clock()} RESULT ${name}: INFO ${detail}`);
  };
  const step = (name: string) => log(`${clock()} STEP ${name}`);
  const guarded = async (name: string, run: () => Promise<void>) => {
    step(name);
    try {
      await run();
    } catch (error) {
      check(name, false, `step error: ${String(error)}`);
    }
  };

  // --- connection sampling ---------------------------------------------------
  const client = await activeClient();
  const consSamples: number[] = [];
  const sampleCons = async () => {
    try {
      const value = (await client?.accountInfo())?.activeConnections ?? -1;
      consSamples.push(value);
      return value;
    } catch (error) {
      log(
        `${clock()} account info failed: ${error instanceof Error ? error.name : "error"} ${(error as { kind?: string }).kind ?? ""}`,
      );
      return -1;
    }
  };
  let sampling = true;
  const sampler = (async () => {
    while (sampling) {
      await sleep(15_000);
      if (sampling) await sampleCons();
    }
  })();

  const appWindow = getCurrentWindow();
  // The user's personal tables (favorites, history, resume points, hidden
  // categories, account settings such as the last channel) are copied first
  // and put back exactly at the end, as in the M5 suite. A run that crashed
  // is undone by the next one before it starts.
  const db = activeLibrary();
  const personal = db ? personalBackup(db, "dev.m3Suite.backup") : null;
  let backedUp = false;
  let before = "";
  try {
    if (!client || !personal || useSession.getState().phase !== "ready") {
      check("setup", false, "no active account");
      return;
    }
    const leftover = await personal.read();
    if (leftover) {
      await personal.restore(leftover);
      info("leftover-restored", "a previous run's backup was found and restored first");
    }
    before = await personal.fingerprint();
    await personal.backUp();
    backedUp = true;
    await appWindow.setFullscreen(false);
    await appWindow.setSize(new LogicalSize(1440, 900));

    // Never open a stream while another device holds the subscription's only slot.
    step("check active_cons before any stream");
    let cons = await sampleCons();
    for (let i = 0; cons !== 0 && i < 9; i++) {
      log(`${clock()} active_cons=${cons}, waiting 10 s`);
      await sleep(10_000);
      cons = await sampleCons();
    }
    if (cons !== 0) {
      check(
        "active-cons-free",
        false,
        `active_cons=${cons} after 90 s: another device holds the slot; stopping`,
      );
      return;
    }
    check("active-cons-free", true, "active_cons=0 before the first stream");

    // --- Live TV loads ---------------------------------------------------------
    await guarded("live-tv-load", async () => {
      const t0 = performance.now();
      void navigate("/live");
      const ready = await until(
        () => useLive.getState().status === "ready" && !!$("[data-live-screen]"),
        10_000,
      );
      const painted = (await afterPaint()) - t0;
      const live = useLive.getState();
      check(
        "live-tv-load",
        ready,
        `${live.channels.size} channels, ${live.categories.length - 2} visible categories; index read in ${live.loadMs} ms, screen painted ${round(painted)} ms after navigation`,
      );
      // The screen auto-plays the remembered channel; let that settle first.
      await waitFor((s) => s.status === "playing" || s.status === "error", 25_000);
    });

    // --- 60 fps scrolling on the full list ---------------------------------------
    await guarded("scroll-fps", async () => {
      selectCategory(ALL_CHANNELS);
      await until(() => !!$("[data-channel-scroller]"), 3000);
      await sleep(800);
      const scroller = $("[data-channel-scroller]")!;
      const count = useLive.getState().list.length;
      // The display's own frame interval, measured while nothing moves.
      const idle: number[] = [];
      await rafLoop(1000, (dt) => idle.push(dt));
      const refreshMs = median(idle);
      const runs: string[] = [];
      let pass = true;
      for (const [label, pxPerSecond, ms] of [
        ["steady 2,000 px/s", 2000, 4000],
        ["fling 12,000 px/s", 12_000, 3000],
        ["jump 120,000 px/s", 120_000, 2000],
      ] as const) {
        const frames: number[] = [];
        await rafLoop(ms, (dt) => {
          frames.push(dt);
          scroller.scrollTop += (pxPerSecond * dt) / 1000;
        });
        const avgFps = (1000 * frames.length) / frames.reduce((a, b) => a + b, 0);
        const sorted = [...frames].sort((a, b) => a - b);
        const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
        const long = frames.filter((f) => f > refreshMs * 1.5).length;
        const ok = avgFps >= (1000 / refreshMs) * 0.95 && long / frames.length <= 0.02;
        // The jump run (a scrollbar drag through the whole list) is a stress figure, not the target.
        if (pxPerSecond < 100_000) pass &&= ok;
        runs.push(
          `${label}: ${avgFps.toFixed(1)} fps, p95 ${p95.toFixed(1)} ms, ${long}/${frames.length} long frames`,
        );
      }
      check(
        "scroll-fps",
        pass,
        `${count} rows, display ${(1000 / refreshMs).toFixed(1)} Hz; ${runs.join("; ")}`,
      );
      scroller.scrollTop = 0;
    });

    // Pick the zap category: the first visible category that lists the start channel.
    const category = categoriesOfChannel(plan.live)[0] ?? ALL_CHANNELS;
    const showChannel = async (id: number, inCategory: string) => {
      selectCategory(inCategory);
      await sleep(200);
      const index = useLive.getState().list.indexOf(id);
      if (index < 0) throw new Error(`channel ${id} is not in category ${inCategory}`);
      const scroller = $("[data-channel-scroller]");
      if (scroller) scroller.scrollTop = Math.max(0, index * 72 - 200);
      await until(() => !!$(`[data-channel="${id}"]`), 2000);
      return $(`[data-channel="${id}"]`)!;
    };

    // --- layout and alignment against LiveTV.dc.html ----------------------------------
    await guarded("live-tv-layout", async () => {
      await showChannel(plan.live, category);
      click($(`[data-channel="${plan.live}"]`));
      await waitFor((s) => s.status === "playing" || s.status === "error", 25_000);
      // The panes are resizable (M5 review): measure the mockup at the default
      // widths, then put the user's widths back (neither is saved).
      const saved = { ...useLayout.getState().panes };
      setPaneWidth("live.categories", PANES["live.categories"].initial);
      setPaneWidth("live.preview", PANES["live.preview"].initial);
      await sleep(1200);
      const measured = layoutNumbers();
      const expected: Record<string, number> = {
        sidebar: 248,
        categories: 264,
        preview: 460,
        "video-w": 424,
        "video-h": 238.5,
        row: 70,
        "row-pitch": 72,
        filter: 44,
        watch: 48,
        heart: 48,
        logo: 40,
      };
      const off = Object.entries(expected)
        .filter(([key, value]) => Math.abs((measured[key] ?? -1) - value) > 1)
        .map(([key, value]) => `${key} ${measured[key]} (mockup ${value})`);
      check(
        "live-tv-layout",
        off.length === 0,
        `${Object.entries(measured)
          .map(([k, v]) => `${k}=${v}`)
          .join(" ")}${off.length ? `; off: ${off.join(", ")}` : ""}`,
      );
      const a = await alignment();
      check("preview-aligned", a.ok, a.detail);
      useLayout.setState({ panes: saved });
      log(`${clock()} SNAPSHOT live-tv (holding 12 s)`);
      await sleep(12_000);
    });

    // --- click to first frame, from a stopped player ------------------------------
    await guarded(`first-frame x${plan.firsts}`, async () => {
      const app: number[] = [];
      const switching: number[] = [];
      const stream: number[] = [];
      const total: number[] = [];
      const infoMs: number[] = [];
      const other = useLive.getState().list.find((id) => id !== plan.live)!;
      for (let i = 0; i < plan.firsts; i++) {
        // Select a neighbour first without playing it, so the click below changes the info.
        await stopPlayback();
        useLive.setState({ selectedId: other });
        await sleep(2500);
        const row = await showChannel(plan.live, category);
        const before = $("[data-preview-title]")?.textContent ?? null;
        const timing = nextTiming();
        const t0 = performance.now();
        click(row);
        const paint = await untilChanged(
          () => `${$("[data-preview-channel]")?.textContent}`,
          `${before}`,
          t0,
        );
        if (paint !== null) infoMs.push(paint);
        const t = await timing;
        if (t?.startMs != null && t.issuedMs != null) {
          app.push(t.issuedMs);
          switching.push(t.startMs - t.issuedMs);
          stream.push(t.totalMs - t.startMs);
          total.push(t.totalMs);
        }
        await sleep(3000);
      }
      check(
        "first-frame",
        total.length === plan.firsts,
        `click→first frame ${stats(total)}; app (click→load command accepted) ${stats(app)}; mpv starting the file ${stats(switching)}; stream (start-file→first frame) ${stats(stream)}`,
      );
      check(
        "first-frame-info",
        Math.max(...infoMs) < 100,
        `click→channel info painted ${stats(infoMs)}`,
      );
    });

    // --- Enter opens the player on the same stream --------------------------------
    await guarded("enter-player", async () => {
      const row = await showChannel(plan.live, category);
      row.focus();
      await waitFor((s) => s.status === "playing", 20_000);
      const loads = player().loads;
      const t0 = press("Enter");
      const opened = await until(() => !!$("[data-player]"), 3000, 2);
      const paintedMs = (await afterPaint()) - t0;
      await sleep(1500);
      const muted = player().mute;
      check(
        "enter-player",
        opened && player().loads === loads && !muted && useFullscreen.getState().on,
        `player painted ${round(paintedMs)} ms after Enter; reloads ${player().loads - loads}; muted ${muted}; full screen ${useFullscreen.getState().on}`,
      );
      const a = await alignment();
      check("player-aligned", a.ok, a.detail);
      // Leave the overlay up for the screenshot.
      document
        .querySelector("[data-player]")
        ?.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
      log(`${clock()} SNAPSHOT player (holding 12 s)`);
      for (let i = 0; i < 6; i++) {
        await sleep(2000);
        $("[data-player]")?.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
      }
    });

    // --- zapping ----------------------------------------------------------------
    await guarded(`zap x${plan.zaps}`, async () => {
      const app: number[] = [];
      const switching: number[] = [];
      const stream: number[] = [];
      const total: number[] = [];
      const infoMs: number[] = [];
      const held: string[] = [];
      const failures: string[] = [];
      const dir = await appCacheDir();
      for (let i = 0; i < plan.zaps; i++) {
        const before = $("[data-player-channel]")?.textContent ?? null;
        const timing = nextTiming();
        const t0 = press("ArrowDown");
        const paint = await untilChanged(
          () => $("[data-player-channel]")?.textContent ?? null,
          before,
          t0,
        );
        if (paint !== null) infoMs.push(paint);
        // Mid-zap: is a picture still on screen? (`window` screenshots what the video output would redraw.)
        await sleep(400);
        if (player().status === "loading") {
          const shot = await join(dir, `m3-zap-${i}.png`);
          const ok = await mpv.screenshotToFile(shot, "window").then(
            () => true,
            () => false,
          );
          held.push(`${ok && player().shown ? "frame" : "none"}`);
        }
        const t = await timing;
        if (t?.startMs != null && t.issuedMs != null) {
          app.push(t.issuedMs);
          switching.push(t.startMs - t.issuedMs);
          stream.push(t.totalMs - t.startMs);
          total.push(t.totalMs);
        } else {
          failures.push(
            `#${i + 1} ${useTuner.getState().channelId}: ${player().error ?? "no frame in 25 s"}`,
          );
        }
        await sleep(4000);
      }
      const ok = failures.length === 0;
      check(
        "zap",
        ok,
        `key→first frame ${stats(total)}; app (key→load command accepted) ${stats(app)}; mpv closing the old stream and starting the new ${stats(switching)}; stream (start-file→first frame) ${stats(stream)}${failures.length ? `; failed: ${failures.join(", ")}` : ""}`,
      );
      check(
        "zap-info",
        infoMs.length > 0 && Math.max(...infoMs) < 100,
        `key→channel info painted ${stats(infoMs)}`,
      );
      check(
        "zap-holds-frame",
        held.length > 0 && held.every((h) => h === "frame"),
        `picture during loading: ${held.join(" ")}`,
      );
    });

    // --- the last frame stays up while the next stream starts (visual proof) -------
    await guarded("hold-frame", async () => {
      await waitFor((s) => s.status === "playing", 20_000);
      // An address that never answers: the open hangs for network-timeout (10 s),
      // without touching the provider. The screenshot must still show the last picture.
      void open({
        label: "blackhole",
        live: false,
        load: () => mpv.loadfile("http://10.255.255.1/hold.ts"),
      });
      await sleep(1500);
      log(`${clock()} SNAPSHOT hold-frame (holding 7 s, last picture should be on screen)`);
      await sleep(7000);
      check(
        "hold-frame",
        player().shown,
        `shown=${player().shown} status=${player().status} (see screenshot)`,
      );
      await waitFor((s) => s.status === "error", 15_000);
      tune(useTuner.getState().channelId ?? plan.live);
      await waitFor((s) => s.status === "playing", 25_000);
    });

    // --- number entry -----------------------------------------------------------------
    await guarded("number-entry", async () => {
      const target = useLive.getState().channels.get(plan.live)!;
      const digits = String(target.num);
      const t0 = performance.now();
      for (const d of digits) press(d);
      const buffered = await until(
        () => $("[data-number-entry]")?.textContent?.includes(digits) ?? false,
        1000,
        2,
      );
      const bufferMs = (await afterPaint()) - t0;
      const before = $("[data-player-channel]")?.textContent ?? null;
      const t1 = press("Enter");
      const paint = await untilChanged(
        () => $("[data-player-channel]")?.textContent ?? null,
        before,
        t1,
      );
      await waitFor((s) => s.status === "playing", 25_000);
      check(
        "number-entry",
        buffered && useTuner.getState().channelId === plan.live,
        `typed ${digits.length} digits: buffer on screen after ${round(bufferMs)} ms; Enter→channel info ${paint === null ? "unchanged" : `${round(paint)} ms`}; tuned ${useTuner.getState().channelId}`,
      );
    });

    // --- shortcuts ---------------------------------------------------------------------
    await guarded("shortcuts", async () => {
      const out: string[] = [];
      let ok = true;
      const expect = (name: string, pass: boolean) => {
        out.push(`${name} ${pass ? "ok" : "FAIL"}`);
        ok &&= pass;
      };
      press("m");
      await sleep(400);
      expect("M mute", player().mute && useTuner.getState().userMuted);
      press("m");
      await sleep(400);
      expect("M unmute", !player().mute);
      press(" ");
      await sleep(500);
      expect("Space pause", player().paused);
      press(" ");
      await sleep(500);
      expect("Space resume", !player().paused);
      press("i");
      await sleep(1500);
      expect(
        "I stats",
        !!$("[data-stats]") && /\d+×\d+/.test($("[data-stats]")?.textContent ?? ""),
      );
      press("i");
      await sleep(200);
      expect("I close", !$("[data-stats]"));
      press("g");
      await sleep(300);
      const guideOpen = !!$("[data-guide]");
      press("ArrowDown");
      await sleep(200);
      const tunedBefore = useTuner.getState().channelId;
      expect("G guide", guideOpen && useTuner.getState().channelId === tunedBefore);
      press("Escape");
      await sleep(200);
      expect("Esc closes guide", !$("[data-guide]") && !!$("[data-player]"));
      const audio = player().audioTracks.length;
      const subs = player().subtitleTracks.length;
      const beforeAudio = player().audioTracks.find((t) => t.selected)?.id;
      press("a");
      await sleep(800);
      const afterAudio = player().audioTracks.find((t) => t.selected)?.id;
      expect(`A (${audio} audio)`, audio < 2 || afterAudio !== beforeAudio);
      press("s");
      await sleep(800);
      expect(`S (${subs} subs)`, subs === 0 || player().subtitleTracks.some((t) => t.selected));
      if (subs > 0) press("s");
      // Leaving or entering full screen resizes the window (and on a screen
      // shorter than 900 px Windows adjusts it again): give the video up to
      // 3 s to follow, and report how long it took.
      const settled = async () => {
        const t0 = performance.now();
        let a = await alignment();
        while (!a.ok && performance.now() - t0 < 3000) {
          await sleep(100);
          a = await alignment();
        }
        return { ...a, detail: `${a.detail}, aligned after ${round(performance.now() - t0)} ms` };
      };
      press("f");
      await sleep(1500);
      const windowed = !useFullscreen.getState().on && !(await appWindow.isFullscreen());
      const a1 = await settled();
      press("f");
      await sleep(1500);
      const a2 = await settled();
      const fOk = windowed && useFullscreen.getState().on && a1.ok && a2.ok;
      expect("F leave/enter full screen + aligned", fOk);
      log(
        `${clock()} F detail: windowed ${windowed}, full screen again ${useFullscreen.getState().on}; windowed ${a1.detail}; full screen ${a2.detail}`,
      );
      // Auto-hide: 3 s without input hides the overlay and the cursor.
      await sleep(3600);
      const overlay = $("[data-player-overlay]");
      const hidden =
        overlay?.dataset.visible === "false" &&
        !!$("[data-player]")?.className.includes("cursor-none");
      $("[data-player]")?.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
      await sleep(300);
      expect(
        "auto-hide 3 s with cursor",
        hidden && $("[data-player-overlay]")?.dataset.visible === "true",
      );
      check("shortcuts", ok, out.join(", "));
    });

    // --- remembered tracks -----------------------------------------------------------
    await guarded("track-memory", async () => {
      const { audioTracks, subtitleTracks } = player();
      if (audioTracks.length < 2 && subtitleTracks.length === 0) {
        info(
          "track-memory",
          `n/a on live ${useTuner.getState().channelId}: ${audioTracks.length} audio, ${subtitleTracks.length} subtitle tracks (matching is unit-tested in core)`,
        );
        return;
      }
      info(
        "track-memory",
        `${audioTracks.length} audio, ${subtitleTracks.length} subs: not exercised on live yet`,
      );
    });

    // --- back to Live TV ---------------------------------------------------------------
    await guarded("back-to-live", async () => {
      const loads = player().loads;
      press("Escape");
      const back = await until(() => !!$("[data-live-screen]"), 3000);
      await sleep(1500);
      const a = await alignment();
      check(
        "back-to-live",
        back && player().loads === loads && player().mute && !useFullscreen.getState().on && a.ok,
        `reloads ${player().loads - loads}, preview muted ${player().mute}, full screen ${useFullscreen.getState().on}; ${a.detail}`,
      );
    });

    // --- favorites ---------------------------------------------------------------------------
    await guarded("favorites", async () => {
      await showChannel(plan.live, category);
      click($(`[data-channel="${plan.live}"]`));
      await sleep(300);
      const wasFavorite = useLive.getState().favorites.includes(plan.live);
      click($("[data-favorite]"));
      await until(() => useLive.getState().favorites.includes(plan.live) !== wasFavorite, 2000);
      selectCategory(FAVORITES);
      await sleep(300);
      const listed = useLive.getState().list.includes(plan.live);
      const countShown = useLive.getState().categories.find((c) => c.id === FAVORITES)?.count;
      click($("[data-favorite]"));
      await until(() => useLive.getState().favorites.includes(plan.live) === wasFavorite, 2000);
      check(
        "favorites",
        !wasFavorite && listed,
        `heart → in Favorites ${listed} (count ${countShown}); heart again → removed ${!useLive.getState().favorites.includes(plan.live)}`,
      );
      selectCategory(category);
    });

    // --- hide and unhide a category ------------------------------------------------------
    await guarded("hide-category", async () => {
      const live = useLive.getState();
      const hiddenBefore = new Set(live.hiddenCategories.map((c) => c.id));
      const target = live.categories.find((c) => !c.builtIn && c.id !== category)!;
      const allBefore = live.categories.find((c) => c.id === ALL_CHANNELS)!.count;
      const byLabel = (label: string) =>
        [...document.querySelectorAll("button")].find(
          (b) => b.getAttribute("aria-label") === label,
        ) ?? null;
      const categoryList = () => $("[aria-label=Categories] [role=list]");
      try {
        // Bring the category into the virtual list's rendered window.
        selectCategory(target.id);
        await sleep(300);
        click(byLabel(`Hide ${target.name}`));
        await until(
          () => useLive.getState().hiddenCategories.some((c) => c.id === target.id),
          2000,
        );
        const s = useLive.getState();
        const gone = !s.categories.some((c) => c.id === target.id);
        const allAfter = s.categories.find((c) => c.id === ALL_CHANNELS)!.count;
        // Unhide through the "Hidden" section at the end of the list.
        categoryList()!.scrollTop = 1e9;
        await until(() => !!$("[aria-label=Categories] button[aria-expanded]"), 2000);
        click($("[aria-label=Categories] button[aria-expanded]"));
        await sleep(200);
        categoryList()!.scrollTop = 1e9;
        await until(() => !!byLabel(`Show ${target.name}`), 2000);
        click(byLabel(`Show ${target.name}`));
        await until(() => useLive.getState().categories.some((c) => c.id === target.id), 2000);
        const back = useLive.getState().categories.some((c) => c.id === target.id);
        check(
          "hide-category",
          gone && back,
          `category ${target.id} (${target.count} channels): hidden ${gone}, All channels ${allBefore}→${allAfter}, shown again ${back}`,
        );
      } finally {
        // Leave the user's library as it was, whatever happened above.
        for (const c of useLive.getState().hiddenCategories)
          if (!hiddenBefore.has(c.id)) await setHidden(c.id, false);
        selectCategory(category);
      }
    });

    // --- EPG for visible rows, cached ---------------------------------------------------------
    await guarded("epg", async () => {
      selectCategory(category);
      await sleep(4000);
      const live = useLive.getState();
      const rows = [...document.querySelectorAll<HTMLElement>("[data-channel]")].map((r) =>
        Number(r.dataset.channel),
      );
      const schedules = useEpg.getState().schedules;
      const withGuide = rows.filter((id) => live.channels.get(id)?.epgChannelId);
      const filled = withGuide.filter((id) => (schedules.get(id)?.length ?? 0) > 0);
      const fetches = useEpg.getState().fetches;
      // Leave and come back: everything comes from memory or the epg_cache table.
      void navigate("/");
      await sleep(800);
      void navigate("/live");
      await until(() => !!$("[data-live-screen]"), 3000);
      await sleep(2500);
      const refetched = useEpg.getState().fetches - fetches;
      check(
        "epg",
        filled.length > 0 && refetched === 0,
        `${rows.length} rows on screen, ${withGuide.length} with a guide id, ${filled.length} with now/next; ${fetches} provider requests so far, ${refetched} after leaving and returning; source ${useEpg.getState().source}`,
      );
      await waitFor((s) => s.status === "playing" || s.status === "error", 25_000);
    });

    // --- catch-up --------------------------------------------------------------------------
    await guarded("catch-up", async () => {
      const archiveCategory = categoriesOfChannel(plan.archive)[0] ?? ALL_CHANNELS;
      const row = await showChannel(plan.archive, archiveCategory);
      click(row);
      await waitFor((s) => s.status === "playing" || s.status === "error", 25_000);
      click(
        [...document.querySelectorAll("[role=tab]")].find((t) => t.textContent === "Catch-up") ??
          null,
      );
      const listed = await until(() => !!$("[data-catchup]"), 15_000);
      if (!listed) {
        check("catch-up", false, "no recorded programmes listed");
        return;
      }
      const entries = document.querySelectorAll("[data-catchup]").length;
      // A full-length programme (the newest are sometimes 5-minute fillers).
      const pickRow =
        [...document.querySelectorAll<HTMLElement>("[data-catchup]")].find(
          (b) => Number(b.dataset.minutes) >= 30,
        ) ?? $("[data-catchup]");
      const timing = nextTiming(40_000);
      click(pickRow);
      await until(() => !!$("[data-player]"), 3000);
      const t = await timing;
      await sleep(2000);
      const position = () =>
        catchupPosition(player().timePos, useTuner.getState().catchupOrigin) ?? -1;
      const programme = useTuner.getState().programme;
      const minutes = programme ? Math.round((programme.end - programme.start) / 60_000) : 0;
      const posBefore = position();
      press("ArrowRight");
      await sleep(3000);
      const posAfter = position();
      press("ArrowLeft");
      await sleep(3000);
      const posBack = position();
      const shown = $("[data-catchup-position]")?.textContent;
      check(
        "catch-up",
        !!t &&
          useTuner.getState().mode === "catchup" &&
          posBefore >= 0 &&
          posAfter - posBefore >= 8 &&
          posBack < posAfter,
        `${entries} recordings listed; ${minutes}-min programme; first frame ${t ? `${t.totalMs} ms (app ${t.issuedMs} ms)` : "none"}; position ${posBefore.toFixed(0)} s, after → (+10 s) ${posAfter.toFixed(0)} s, after ← ${posBack.toFixed(0)} s (bar shows ${shown}); ${player().label}`,
      );
      press("Escape");
      await until(() => !!$("[data-live-screen]"), 3000);
    });

    const zapTimings = summarize(player().timings, "zap");
    info("timings-recorded", JSON.stringify(zapTimings));
  } catch (error) {
    log(`${clock()} SUITE ERROR ${String(error)}`);
  } finally {
    await stopPlayback();
    sampling = false;
    await sleep(3000);
    const after = await sampleCons();
    // The provider keeps counting a closed stream for a while, so its count is
    // not proof of sockets: the external socket monitor checks "one at a time".
    info(
      "provider-active-cons",
      `samples every 15 s [${consSamples.join(",")}] (counts closed sessions for a while)`,
    );
    check("released-after-stop", after === 0, `active_cons ${after} 3 s after stop`);
    void sampler;
    if (personal && backedUp) {
      const copy = await personal.read();
      if (copy) await personal.restore(copy);
      const restored = await personal.fingerprint();
      check(
        "personal-data-restored",
        restored === before,
        `after restore: ${restored}${restored === before ? "" : ` (before: ${before})`}`,
      );
    }
    void navigate("/");
    log(`${clock()} SUITE DONE ${JSON.stringify(results)}`);
  }
}

/** Sizes on the Live TV screen, in CSS px, to compare with LiveTV.dc.html at 1440×900. */
function layoutNumbers(): Record<string, number> {
  const rect = (selector: string) => document.querySelector(selector)?.getBoundingClientRect();
  const rows = [...document.querySelectorAll("[data-channel]")].map((r) =>
    r.getBoundingClientRect(),
  );
  const r2 = (n: number | undefined) => (n === undefined ? -1 : Math.round(n * 10) / 10);
  const pitch = rows.length > 1 ? Math.abs(rows[1]!.top - rows[0]!.top) : undefined;
  const watch = [...document.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === "Watch",
  );
  return {
    sidebar: r2(rect("nav[aria-label=Main]")?.width),
    categories: r2(rect("[data-pane=categories]")?.width),
    preview: r2(rect("[data-pane=preview]")?.width),
    "video-w": r2(rect("[data-video-surface]")?.width),
    "video-h": r2(rect("[data-video-surface]")?.height),
    row: r2(rows[0]?.height),
    "row-pitch": r2(pitch),
    filter: r2(rect("#channel-filter")?.height),
    watch: r2(watch?.getBoundingClientRect().height),
    heart: r2(rect("[data-favorite]")?.height),
    logo: r2(
      document.querySelector("[data-channel] > span:nth-child(2)")?.getBoundingClientRect().height,
    ),
  };
}
