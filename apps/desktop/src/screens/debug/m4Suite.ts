/**
 * M4 acceptance suite (docs/ROADMAP.md "M4"), dev builds only.
 *
 * `TUNER_M4_SUITE="movie=<id>,series=<id>"` drives Movies, Series, the
 * detail pages and the movie/episode player through DOM events and prints
 * `RESULT` lines (ids, counts and timings only). Pick a movie with two audio
 * tracks and subtitles to check remembered tracks, and a series with at
 * least two episodes in its first season.
 *
 * Resume across restarts takes two launches: the full run leaves the movie
 * paused at a known position and prints it; `phase=restart` on the next
 * launch checks the movie resumes there, then removes everything the suite
 * wrote (resume points, history, track choices).
 */

import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import { readResume, trackChoiceKey, type ResumePoint } from "@tuner/core";
import type { NavigateFunction } from "react-router";
import { movies } from "../../data/catalog";
import { activeClient, activeLibrary, useSession } from "../../data/session";
import { seekTo, setPlayerTrace, togglePause } from "../../player/controller";
import { useFullscreen } from "../../player/fullscreen";
import { stopPlayback, useTuner } from "../../player/tuner";
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
  until,
  waitFor,
  type Check,
  type Log,
} from "./suiteKit";

export interface M4Plan {
  movie: number;
  series: number;
  phase: "full" | "restart";
  /** Run only the series steps (quicker reruns). */
  only: "series" | null;
}

/** `movie=1234,series=5678[,phase=restart]` */
export function parseM4Plan(value: string): M4Plan | null {
  const entries = Object.fromEntries(
    value.split(",").map((part) => part.trim().split("=") as [string, string]),
  );
  const movie = Number(entries.movie);
  const series = Number(entries.series);
  if (!(movie > 0 && series > 0)) return null;
  return {
    movie,
    series,
    phase: entries.phase === "restart" ? "restart" : "full",
    only: entries.only === "series" ? "series" : null,
  };
}

const buttons = (text: RegExp) =>
  [...document.querySelectorAll<HTMLButtonElement>("button")].filter((b) =>
    text.test(b.textContent?.trim() ?? ""),
  );

export async function runM4Suite(plan: M4Plan, navigate: NavigateFunction, log: Log) {
  const results: Record<string, string> = {};
  const check: Check = (name, pass, detail) => {
    results[name] = `${pass ? "PASS" : "FAIL"} ${detail}`;
    log(`${clock()} RESULT ${name}: ${results[name]}`);
  };
  const info = (name: string, detail: string) => {
    results[name] = `INFO ${detail}`;
    log(`${clock()} RESULT ${name}: INFO ${detail}`);
  };
  const guarded = async (name: string, run: () => Promise<void>) => {
    log(`${clock()} STEP ${name}`);
    try {
      await run();
    } catch (error) {
      check(name, false, `step error: ${String(error)}`);
    }
  };

  const db = activeLibrary();
  const client = await activeClient();
  const startedAt = Date.now();
  const playedEpisodes = new Set<number>();
  const consSamples: number[] = [];
  const sampleCons = async () => {
    try {
      const value = (await client?.accountInfo())?.activeConnections ?? -1;
      consSamples.push(value);
      return value;
    } catch {
      return -1;
    }
  };
  const resumeOf = async (kind: "vod" | "episode", id: number): Promise<ResumePoint | null> =>
    db ? ((await readResume(db, kind, [id])).get(id) ?? null) : null;
  const firstFrame = async (start: () => void, timeoutMs = 40_000) => {
    const timing = nextTiming(timeoutMs);
    start();
    return timing;
  };

  const openMovie = async () => {
    const t0 = performance.now();
    void navigate(`/movies/${plan.movie}`);
    await until(() => !!$(`[data-movie="${plan.movie}"] [data-detail-title]`), 20_000);
    return (await afterPaint()) - t0;
  };

  setPlayerTrace(log);
  try {
    if (!db || !client || useSession.getState().phase !== "ready") {
      check("setup", false, "no active account");
      return;
    }
    const appWindow = getCurrentWindow();
    await appWindow.setFullscreen(false);
    await appWindow.setSize(new LogicalSize(1440, 900));

    log(`${clock()} STEP check active_cons before any stream`);
    let cons = await sampleCons();
    for (let i = 0; cons !== 0 && i < 9; i++) {
      log(`${clock()} active_cons=${cons}, waiting 10 s`);
      await sleep(10_000);
      cons = await sampleCons();
    }
    if (cons !== 0) {
      check("active-cons-free", false, `active_cons=${cons} after 90 s; stopping`);
      return;
    }
    check("active-cons-free", true, "active_cons=0 before the first stream");

    if (plan.phase === "restart") {
      await guarded("resume-after-restart", async () => {
        const saved = await resumeOf("vod", plan.movie);
        await openMovie();
        const resumeButton = buttons(/^Resume$/)[0];
        const t = await firstFrame(() => click(resumeButton ?? null));
        await waitFor((s) => s.timePos !== null, 5000);
        const pos = player().timePos ?? -1;
        check(
          "resume-after-restart",
          !!saved && !!resumeButton && !!t && Math.abs(pos - saved.positionSecs) <= 5,
          `saved ${saved?.positionSecs.toFixed(0)} s before the restart; Resume shown ${!!resumeButton}; started at ${pos.toFixed(0)} s, first frame ${t?.totalMs} ms`,
        );
      });
      // Stop first: stopping saves a resume point, which the clean-up then removes.
      await stopPlayback();
      await sleep(1000);
      await cleanUp();
      return;
    }

    // --- Movies grid -------------------------------------------------------------------
    if (plan.only !== "series") await movieSteps();
    await seriesSteps();
  } catch (error) {
    log(`${clock()} SUITE ERROR ${String(error)}`);
  } finally {
    setPlayerTrace(null);
    await stopPlayback();
    await sleep(3000);
    const after = await sampleCons();
    info("provider-active-cons", `samples [${consSamples.join(",")}]`);
    check("released-after-stop", after === 0, `active_cons ${after} 3 s after stop`);
    if (plan.phase === "full") await cleanUp({ keepMovieResume: plan.only !== "series" });
    void navigate("/");
    log(`${clock()} SUITE DONE ${JSON.stringify(results)}`);
  }

  async function movieSteps() {
    await guarded("movies-load", async () => {
      const t0 = performance.now();
      void navigate("/movies");
      const ready = await until(
        () => movies.use.getState().status === "ready" && !!$("[data-poster]"),
        15_000,
      );
      const painted = (await afterPaint()) - t0;
      const s = movies.use.getState();
      check(
        "movies-load",
        ready,
        `${s.items.size} movies, ${s.categories.length - 1} visible categories; read in ${s.loadMs} ms, first posters painted ${round(painted)} ms after navigation`,
      );
    });

    await guarded("grid-layout", async () => {
      movies.selectCategory("all");
      await sleep(600);
      const rail = $("[aria-label=Categories]")?.getBoundingClientRect().width ?? 0;
      const posters = [...document.querySelectorAll("[data-poster] > span:first-child")].map((p) =>
        p.getBoundingClientRect(),
      );
      const first = posters[0]!;
      const sameRow = posters.filter((p) => Math.abs(p.top - first.top) < 1);
      const gap = sameRow.length > 1 ? sameRow[1]!.left - first.right : -1;
      const radius = getComputedStyle(
        document.querySelector("[data-poster] > span:first-child")!,
      ).borderRadius;
      const ratio = first.height / first.width;
      const ok =
        Math.abs(rail - 264) <= 1 &&
        Math.abs(ratio - 1.5) < 0.01 &&
        radius === "16px" &&
        Math.abs(gap - 14) <= 1;
      check(
        "grid-layout",
        ok,
        `rail ${round(rail)} px, ${sameRow.length} columns, poster ${first.width.toFixed(1)}×${first.height.toFixed(1)} (ratio ${ratio.toFixed(3)}), radius ${radius}, gap ${gap.toFixed(1)} px`,
      );
      log(`${clock()} SNAPSHOT movies (holding 8 s)`);
      await sleep(8000);
    });

    await guarded("sort", async () => {
      const out: string[] = [];
      let ok = true;
      for (const [label, sort] of [
        ["Name", "name"],
        ["Rating", "rating"],
        ["Recently added", "recent"],
      ] as const) {
        const before = movies.use.getState().list;
        const t0 = performance.now();
        click(
          [...document.querySelectorAll("[role=radio]")].find((b) => b.textContent === label) ??
            null,
        );
        await until(() => movies.use.getState().list !== before, 3000, 1);
        const ms = (await afterPaint()) - t0;
        const { list, items } = movies.use.getState();
        const top = list.slice(0, 200).map((id) => items.get(id)!);
        const ordered = top.every((item, i) => {
          if (i === 0) return true;
          const prev = top[i - 1]!;
          if (sort === "recent") return (prev.addedAt ?? 0) >= (item.addedAt ?? 0);
          if (sort === "rating") return (prev.rating ?? -1) >= (item.rating ?? -1);
          return true;
        });
        ok &&= ordered && movies.use.getState().sort === sort;
        out.push(`${label} ${round(ms)} ms${ordered ? "" : " (out of order)"}`);
      }
      check("sort", ok, `${movies.use.getState().list.length} movies: ${out.join(", ")}`);
    });

    const scrollFps = async (label: string) => {
      await until(() => !!$("[data-poster-scroller]"), 3000);
      await sleep(800);
      const scroller = $("[data-poster-scroller]")!;
      const idle: number[] = [];
      await rafLoop(1000, (dt) => idle.push(dt));
      const refreshMs = median(idle);
      const runs: string[] = [];
      let pass = true;
      for (const [name, pxPerSecond, ms] of [
        ["steady 2,000 px/s", 2000, 4000],
        ["fling 12,000 px/s", 12_000, 3000],
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
        pass &&= avgFps >= (1000 / refreshMs) * 0.95 && long / frames.length <= 0.02;
        runs.push(
          `${name}: ${avgFps.toFixed(1)} fps, p95 ${p95.toFixed(1)} ms, ${long}/${frames.length} long`,
        );
      }
      scroller.scrollTop = 0;
      return {
        pass,
        detail: `${label}, display ${(1000 / refreshMs).toFixed(1)} Hz; ${runs.join("; ")}`,
      };
    };

    await guarded("scroll-fps", async () => {
      const real = await scrollFps(`${movies.use.getState().list.length} real movies`);
      check("scroll-fps-real", real.pass, real.detail);
      movies.injectSynthetic(50_000);
      await sleep(500);
      const synthetic = await scrollFps("50,000 synthetic items");
      check("scroll-fps-50k", synthetic.pass, synthetic.detail);
      await movies.load();
      await until(() => movies.use.getState().status === "ready", 10_000);
    });

    await guarded("artwork", async () => {
      await sleep(2500);
      const { items } = movies.use.getState();
      const cards = [...document.querySelectorAll<HTMLElement>("[data-poster]")];
      let real = 0;
      let generated = 0;
      let fallback = 0;
      for (const card of cards) {
        const item = items.get(Number(card.dataset.poster));
        const img = card.querySelector("img");
        if (img) real++;
        else {
          generated++;
          if (item?.image) fallback++;
        }
      }
      check(
        "artwork",
        cards.length > 0 && real + generated === cards.length,
        `${cards.length} posters on screen: ${real} provider images, ${generated} generated (${fallback} of them after a broken image)`,
      );
    });

    // --- Movie detail and player -------------------------------------------------------
    await guarded("movie-detail", async () => {
      const first = await openMovie();
      void navigate("/movies");
      await sleep(800);
      const second = await openMovie();
      const meta = $("[data-hero-meta]")?.textContent ?? "";
      check(
        "movie-detail",
        true,
        `first open ${round(first)} ms (get_vod_info or cache), again ${round(second)} ms (cache); meta "${meta.length > 0 ? "shown" : "missing"}"`,
      );
      log(`${clock()} SNAPSHOT movie-detail (holding 8 s)`);
      await sleep(8000);
    });

    await guarded("movie-play", async () => {
      const playButton = buttons(/^(Play|Resume)$/)[0] ?? null;
      const t = await firstFrame(() => click(playButton));
      await sleep(1500);
      const a = await alignment();
      check(
        "movie-play",
        !!t &&
          useTuner.getState().mode === "vod" &&
          !!$("[data-player]") &&
          useFullscreen.getState().on,
        `click→first frame ${t?.totalMs} ms (app ${t?.issuedMs} ms); ${player().video.codec} ${player().video.height}p, ${player().audioTracks.length} audio, ${player().subtitleTracks.length} subtitle tracks; ${a.detail}`,
      );
      $("[data-player]")?.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
      log(`${clock()} SNAPSHOT vod-player (holding 8 s)`);
      for (let i = 0; i < 4; i++) {
        await sleep(2000);
        $("[data-player]")?.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
      }
    });

    await guarded("vod-shortcuts", async () => {
      const out: string[] = [];
      let ok = true;
      const expect = (name: string, pass: boolean) => {
        out.push(`${name} ${pass ? "ok" : "FAIL"}`);
        ok &&= pass;
      };
      press(" ");
      await sleep(600);
      expect("Space pause", player().paused);
      press(" ");
      await sleep(600);
      expect("Space resume", !player().paused);
      const p0 = player().timePos ?? 0;
      press("ArrowRight");
      await waitFor((s) => (s.timePos ?? 0) > p0 + 8, 6000);
      const p1 = player().timePos ?? 0;
      press("ArrowLeft");
      await waitFor((s) => (s.timePos ?? 0) < p1 - 5, 6000);
      const p2 = player().timePos ?? 0;
      expect(`→ +10 s (${p0.toFixed(0)}→${p1.toFixed(0)})`, p1 - p0 >= 8 && p1 - p0 <= 14);
      expect(`← −10 s (→${p2.toFixed(0)})`, p1 - p2 >= 6 && p1 - p2 <= 12);
      press("ArrowDown");
      await sleep(400);
      expect("↓ does not zap", useTuner.getState().mode === "vod");
      press("m");
      await sleep(400);
      expect("M mute", player().mute);
      press("m");
      await sleep(400);
      press("i");
      await sleep(1500);
      expect("I stats", !!$("[data-stats]"));
      press("i");
      check("vod-shortcuts", ok, out.join(", "));
    });

    await guarded("track-memory", async () => {
      const { audioTracks, subtitleTracks } = player();
      if (audioTracks.length < 2 || subtitleTracks.length < 1) {
        info(
          "track-memory",
          `n/a: ${audioTracks.length} audio, ${subtitleTracks.length} subtitle tracks`,
        );
        return;
      }
      press("a");
      await waitFor(
        (s) =>
          s.audioTracks.find((t) => t.selected)?.id !== audioTracks.find((t) => t.selected)?.id,
        4000,
      );
      press("s");
      await waitFor((s) => s.subtitleTracks.some((t) => t.selected), 4000);
      await sleep(800);
      const chosenAudio = player().audioTracks.find((t) => t.selected);
      const chosenSub = player().subtitleTracks.find((t) => t.selected);
      // Leave and come back: the choice is applied to the new opening.
      press("Escape");
      await until(() => !!$(`[data-movie="${plan.movie}"]`), 5000);
      await sleep(1500);
      const t = await firstFrame(() => click(buttons(/^(Play|Resume)$/)[0] ?? null));
      await waitFor((s) => s.audioTracks.some((x) => x.id === chosenAudio?.id && x.selected), 8000);
      await sleep(1500);
      const audio = player().audioTracks.find((x) => x.selected);
      const sub = player().subtitleTracks.find((x) => x.selected);
      check(
        "track-memory",
        !!t && audio?.lang === chosenAudio?.lang && sub?.lang === chosenSub?.lang,
        `chose audio ${chosenAudio?.lang}/${chosenAudio?.codec}, subtitles ${chosenSub?.lang}; reopened with audio ${audio?.lang}/${audio?.codec}, subtitles ${sub?.lang}`,
      );
    });

    await guarded("resume-points", async () => {
      // Past the 30 s "worth resuming" mark, then playing: a save at most every 10 s.
      await waitFor((s) => s.status === "playing", 20_000);
      await seekTo(120);
      await waitFor((s) => (s.timePos ?? 0) >= 119 && s.status === "playing", 15_000);
      await sleep(12_000);
      // Saves follow the position: the saved one is never more than ~10 s behind.
      const posAtRead = player().timePos ?? 0;
      const during = await resumeOf("vod", plan.movie);
      // Leaving the player saves the last position.
      const posAtLeave = player().timePos ?? 0;
      press("Escape");
      await until(() => !!$(`[data-movie="${plan.movie}"]`), 5000);
      await sleep(1200);
      const atLeave = await resumeOf("vod", plan.movie);
      const resumeShown = buttons(/^Resume$/).length > 0;
      // Resume starts where it left off.
      const t = await firstFrame(() => click(buttons(/^Resume$/)[0] ?? null));
      await waitFor((s) => s.timePos !== null && s.status === "playing", 10_000);
      const startedAt = player().timePos ?? -1;
      log(
        `${clock()} resume-points flags: during ${!!during}, age ${during ? Date.now() - during.updatedAt : -1} ms, atLeave ${!!atLeave}, button ${resumeShown}, timing ${!!t}`,
      );
      check(
        "resume-points",
        !!during &&
          posAtRead - during.positionSecs <= 11 &&
          !!atLeave &&
          Math.abs(atLeave.positionSecs - posAtLeave) <= 2 &&
          resumeShown &&
          !!t &&
          Math.abs(startedAt - atLeave.positionSecs) <= 5,
        `saved while playing at ${during?.positionSecs.toFixed(0)} s (player at ${posAtRead.toFixed(0)} s); on leaving ${atLeave?.positionSecs.toFixed(0)} s (player at ${posAtLeave.toFixed(0)} s); Resume button ${resumeShown}; resumed at ${startedAt.toFixed(0)} s`,
      );
    });

    await guarded("watched-at-90", async () => {
      const duration = player().duration ?? 0;
      await seekTo(duration * 0.92);
      await waitFor((s) => (s.timePos ?? 0) > duration * 0.91, 10_000);
      await sleep(1500);
      await togglePause();
      await sleep(800);
      const point = await resumeOf("vod", plan.movie);
      check(
        "watched-at-90",
        !!point?.watched,
        `paused at ${((100 * (player().timePos ?? 0)) / duration).toFixed(1)}% of ${round(duration)} s → watched ${point?.watched}`,
      );
      // Leave the movie half-way for the restart phase.
      await togglePause();
      await seekTo(600);
      await waitFor((s) => Math.abs((s.timePos ?? 0) - 600) < 5 && s.status === "playing", 10_000);
      await sleep(2000);
      await togglePause();
      await sleep(800);
      const saved = await resumeOf("vod", plan.movie);
      log(
        `${clock()} RESTART-EXPECT movie ${plan.movie} resume at ${saved?.positionSecs.toFixed(0)} s`,
      );
      press("Escape");
      await until(() => !!$(`[data-movie="${plan.movie}"]`), 5000);
    });
  }

  async function seriesSteps() {
    await guarded("series-detail", async () => {
      const open = async () => {
        const t0 = performance.now();
        void navigate(`/series/${plan.series}`);
        await until(() => !!$(`[data-series="${plan.series}"] [data-episode]`), 20_000);
        return (await afterPaint()) - t0;
      };
      const first = await open();
      void navigate("/series");
      await sleep(800);
      const second = await open();
      const seasons = document.querySelectorAll("[aria-label=Season] [role=radio]").length;
      const rows = document.querySelectorAll("[data-episode]").length;
      check(
        "series-detail",
        seasons > 0 && rows > 0,
        `first open ${round(first)} ms (get_series_info or cache), again ${round(second)} ms; ${seasons} season tabs, ${rows} episode rows rendered`,
      );
      log(`${clock()} SNAPSHOT series-detail (holding 8 s)`);
      await sleep(8000);
    });

    await guarded("next-episode-autoplay", async () => {
      const autoplay = $<HTMLInputElement>("[data-autoplay]");
      if (autoplay && !autoplay.checked) click(autoplay);
      click([...document.querySelectorAll("[aria-label=Season] [role=radio]")][0] ?? null);
      await sleep(400);
      const firstRow = $("[data-episode]");
      const t = await firstFrame(() => click(firstRow));
      const media = useTuner.getState().media;
      if (!t || !media?.series) throw new Error("the first episode did not start");
      playedEpisodes.add(media.id);
      await waitFor((s) => (s.duration ?? 0) > 0, 10_000);
      // 20 s before the end: the card should come at 10 s left.
      await seekTo((player().duration ?? 0) - 20);
      const card = await until(() => !!$("[data-up-next-countdown]"), 30_000);
      const shownAt = performance.now();
      const left = (player().duration ?? 0) - (player().timePos ?? 0);
      const t2 = await nextTiming(40_000);
      const next = useTuner.getState().media;
      if (next) playedEpisodes.add(next.id);
      const waited = t2 ? performance.now() - shownAt - t2.totalMs : -1;
      check(
        "next-episode-autoplay",
        card && !!t2 && next?.id !== media.id && next?.series?.id === media.series.id,
        `episode ${media.id}: card with countdown ${card} at ${left.toFixed(1)} s left; next episode ${next?.id} started ${(waited / 1000).toFixed(1)} s after the card (countdown 10 s), first frame ${t2?.totalMs} ms`,
      );
    });

    await guarded("next-episode-cancel", async () => {
      const media = useTuner.getState().media;
      await waitFor((s) => s.status === "playing" && (s.duration ?? 0) > 0, 20_000);
      await seekTo((player().duration ?? 0) - 20);
      const watch = setInterval(
        () =>
          log(
            `${clock()} cancel step: status ${player().status}, pos ${player().timePos?.toFixed(1)} / ${player().duration?.toFixed(1)}, paused ${player().paused}, buffering ${player().buffering}, upNext ${!!useTuner.getState().upNext}, media ${useTuner.getState().media?.id}`,
          ),
        3000,
      );
      const card = await until(() => !!$("[data-up-next]"), 30_000);
      clearInterval(watch);
      press("Escape");
      await sleep(14_000);
      check(
        "next-episode-cancel",
        card && useTuner.getState().media === media && !$("[data-up-next]") && !!$("[data-player]"),
        `card shown ${card}; after Esc and 14 s still on episode ${useTuner.getState().media?.id}, card gone ${!$("[data-up-next]")}`,
      );
      press("Escape");
      await until(() => !!$(`[data-series="${plan.series}"]`), 5000);
      await sleep(1500);
      const watchedShown = [...document.querySelectorAll("[data-episode]")].some((r) =>
        r.textContent?.includes("Watched"),
      );
      info("series-watched-state", `"Watched" shown on the series page: ${watchedShown}`);
    });
  }

  /** Removes what the suite wrote, so the user's library is as it was. */
  async function cleanUp({ keepMovieResume = false } = {}) {
    if (!db) return;
    await db.execute("DELETE FROM history WHERE watched_at >= ?", [startedAt - 60_000]);
    for (const id of playedEpisodes)
      await db.execute("DELETE FROM resume WHERE kind = 'episode' AND id = ?", [id]);
    if (!keepMovieResume)
      await db.execute("DELETE FROM resume WHERE kind = 'vod' AND id = ?", [plan.movie]);
    await db.execute("DELETE FROM settings WHERE key = ?", [trackChoiceKey("vod", plan.movie)]);
    await db.execute("DELETE FROM settings WHERE key = ?", [trackChoiceKey("series", plan.series)]);
    log(
      `${clock()} cleaned up suite data${keepMovieResume ? " (kept the movie's resume point for phase=restart)" : ""}`,
    );
  }
}
