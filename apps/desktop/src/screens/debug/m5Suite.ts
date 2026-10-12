/**
 * M5 acceptance suite (docs/ROADMAP.md "M5"), dev builds only.
 *
 * `TUNER_M5_SUITE="live=<id>,movie=<id>,series=<id>[,query=telefoot]"` runs
 * Home, search and favorites through the real screens and prints `RESULT`
 * lines (ids, counts and timings only; no names, no URLs). `live` is a
 * channel with a guide, `movie` a movie, `series` a series with episodes;
 * `query` must find an accented title when typed without accents.
 * `,phase=cold` only measures a cold start (Home painted, index from disk).
 *
 * The suite changes the library (favorites, history, resume points, hidden
 * categories, account settings) to show Home full. Before that it copies
 * those tables into one settings row; at the end, step failure or not, it
 * puts them back exactly and deletes the copy. A run that crashed is undone
 * by the next one before it starts.
 */

import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import {
  foldText,
  recordHistory,
  setFavorite,
  splitTitleYear,
  writeResume,
  type SqlAdapter,
  type SqlValue,
} from "@tuner/core";
import type { NavigateFunction } from "react-router";
import { movies, series } from "../../data/catalog";
import { useFavorites } from "../../data/favorites";
import { injectFreshAccount, loadHome, useHome } from "../../data/home";
import { loadLive, useLive } from "../../data/live";
import { rebuildSearch, prepareSearch, useSearch } from "../../data/search";
import { activeClient, activeLibrary, useSession } from "../../data/session";
import { setPlayerTrace } from "../../player/controller";
import { useFullscreen } from "../../player/fullscreen";
import { stopPlayback, useTuner } from "../../player/tuner";
import {
  $,
  afterPaint,
  click,
  clock,
  nextTiming,
  player,
  press,
  round,
  sleep,
  stats,
  until,
  waitFor,
  type Check,
  type Log,
} from "./suiteKit";

export interface M5Plan {
  live: number;
  movie: number;
  series: number;
  query: string;
  phase: "full" | "cold";
}

/** `live=1,movie=2,series=3[,query=telefoot][,phase=cold]` */
export function parseM5Plan(value: string): M5Plan | null {
  const entries = Object.fromEntries(
    value.split(",").map((part) => part.trim().split("=") as [string, string]),
  );
  const plan = {
    live: Number(entries.live),
    movie: Number(entries.movie),
    series: Number(entries.series),
    query: entries.query || "telefoot",
    phase: entries.phase === "cold" ? ("cold" as const) : ("full" as const),
  };
  if (plan.phase === "cold") return plan;
  return plan.live > 0 && plan.movie > 0 && plan.series > 0 ? plan : null;
}

/** Personal tables the suite may change, and the settings row that backs them up. */
const PERSONAL = ["favorites", "history", "resume", "hidden_categories", "settings"] as const;
const BACKUP_KEY = "dev.m5Suite.backup";

type Backup = Record<(typeof PERSONAL)[number], Record<string, SqlValue>[]>;

async function readBackup(db: SqlAdapter): Promise<Backup | null> {
  const [row] = await db.select<{ value: string }>("SELECT value FROM settings WHERE key = ?", [
    BACKUP_KEY,
  ]);
  return row ? (JSON.parse(row.value) as Backup) : null;
}

/** Copies the personal tables into one settings row (written before anything changes). */
async function backUp(db: SqlAdapter): Promise<Backup> {
  const backup = {} as Backup;
  for (const table of PERSONAL) {
    backup[table] = await db.select<Record<string, SqlValue>>(
      `SELECT * FROM ${table}${table === "settings" ? " WHERE key <> ?" : ""}`,
      table === "settings" ? [BACKUP_KEY] : [],
    );
  }
  await db.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [
    BACKUP_KEY,
    JSON.stringify(backup),
  ]);
  return backup;
}

/** Puts every personal table back as it was, in one transaction, then drops the copy. */
async function restore(db: SqlAdapter, backup: Backup) {
  await db.transaction(async (tx) => {
    for (const table of PERSONAL) {
      tx.execute(`DELETE FROM ${table}${table === "settings" ? " WHERE key <> ?" : ""}`, [
        ...(table === "settings" ? [BACKUP_KEY] : []),
      ]);
      for (const row of backup[table]) {
        const columns = Object.keys(row);
        tx.execute(
          `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`,
          columns.map((c) => row[c] ?? null),
        );
      }
    }
    tx.execute("DELETE FROM settings WHERE key = ?", [BACKUP_KEY]);
  });
}

/** A stable fingerprint of the personal tables, to prove the restore. */
async function fingerprint(db: SqlAdapter): Promise<string> {
  const parts: string[] = [];
  for (const table of PERSONAL) {
    const rows = await db.select<Record<string, SqlValue>>(
      `SELECT * FROM ${table}${table === "settings" ? " WHERE key <> ?" : ""}`,
      table === "settings" ? [BACKUP_KEY] : [],
    );
    const lines = rows.map((r) => JSON.stringify(Object.entries(r).sort())).sort();
    parts.push(`${table}:${rows.length}:${hash(lines.join("\n"))}`);
  }
  return parts.join(" ");
}

function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** Sets an input's value the way typing does, so React's onChange runs. */
function typeInto(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function ctrlK() {
  window.dispatchEvent(
    new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true, cancelable: true }),
  );
}

/** Milliseconds from setting the query to its results painted. */
async function timedQuery(input: HTMLInputElement, value: string): Promise<number | null> {
  const t0 = performance.now();
  const answered = new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => {
      unsubscribe();
      resolve(false);
    }, 3000);
    const unsubscribe = useSearch.subscribe((s) => {
      if (s.resultsFor !== value) return;
      clearTimeout(timer);
      unsubscribe();
      resolve(true);
    });
  });
  typeInto(input, value);
  if (!(await answered)) return null;
  await until(() => $("[data-search-results]")?.dataset.resultsFor === value, 1000, 1);
  return (await afterPaint()) - t0;
}

const box = (element: Element | null) => element?.getBoundingClientRect() ?? null;
const css = (element: Element | null, property: string) =>
  element ? getComputedStyle(element).getPropertyValue(property) : "";
const near = (a: number | undefined, b: number, tolerance = 1) =>
  a !== undefined && Math.abs(a - b) <= tolerance;

export async function runM5Suite(plan: M5Plan, navigate: NavigateFunction, log: Log) {
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
  const snapshot = async (name: string) => {
    log(`${clock()} SNAPSHOT ${name} (holding 6 s)`);
    await sleep(6000);
  };

  const db = activeLibrary();
  const client = await activeClient();
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
  /** One connection per subscription: wait until the provider counts none. */
  const consFree = async () => {
    let cons = await sampleCons();
    for (let i = 0; cons !== 0 && i < 9; i++) {
      log(`${clock()} active_cons=${cons}, waiting 10 s`);
      await sleep(10_000);
      cons = await sampleCons();
    }
    return cons === 0;
  };

  if (!db || !client || useSession.getState().phase !== "ready") {
    check("setup", false, "no active account");
    return;
  }

  // --- cold start ---------------------------------------------------------------------
  await guarded("cold-start", async () => {
    const painted = await until(() => useHome.getState().paintedAt !== null, 10_000);
    const processNow = await invoke<number>("debug_process_ms");
    const home = useHome.getState();
    const sinceProcess = processNow - (performance.now() - (home.paintedAt ?? 0));
    const session = useSession.getState();
    check(
      "cold-start-home",
      painted && sinceProcess < 2000,
      `process start → Home painted with data ${round(sinceProcess)} ms (dev build, Vite serving modules); webview start → painted ${round(home.paintedAt ?? -1)} ms; boot (cached library) done at ${round(session.bootMs ?? -1)} ms; Home reads ${home.loadMs} ms`,
    );
  });

  await guarded("search-index", async () => {
    const t0 = performance.now();
    await prepareSearch();
    const ready = useSearch.getState().status === "ready";
    const s = useSearch.getState().stats;
    check(
      "search-index-load",
      ready,
      s.source === "disk"
        ? `from disk: read ${round(s.readMs ?? -1)} ms, parsed in the worker ${round(s.loadMs ?? -1)} ms, ${s.docs} documents (ready ${round(performance.now() - t0)} ms after asking)`
        : `built (nothing usable on disk): library read ${round(s.docsMs ?? -1)} ms, build ${round(s.buildMs ?? -1)} ms, serialise ${round(s.serializeMs ?? -1)} ms, ${((s.bytes ?? 0) / 1e6).toFixed(1)} MB, ${s.docs} documents`,
    );
  });

  if (plan.phase === "cold") {
    log(`${clock()} SUITE DONE ${JSON.stringify(results)}`);
    return;
  }

  // --- set up: copy the personal tables first, undo a crashed run --------------------------
  const leftover = await readBackup(db);
  if (leftover) {
    await restore(db, leftover);
    info("leftover-restored", "a previous run's backup was found and restored first");
  }
  const before = await fingerprint(db);
  const backup = await backUp(db);
  info("personal-data", `backed up (${before})`);

  const appWindow = getCurrentWindow();
  await appWindow.setFullscreen(false);
  await appWindow.setSize(new LogicalSize(1440, 900));
  setPlayerTrace(log);

  try {
    await guarded("search-build", async () => {
      await rebuildSearch();
      const s = useSearch.getState().stats;
      const counts = useSession.getState().counts;
      check(
        "search-build",
        useSearch.getState().status === "ready" &&
          s.docs === (counts?.live ?? 0) + (counts?.vod ?? 0) + (counts?.series ?? 0),
        `${s.docs} documents (${counts?.live} channels + ${counts?.vod} movies + ${counts?.series} series): library read ${round(s.docsMs ?? -1)} ms, build ${round(s.buildMs ?? -1)} ms in the worker, serialise ${round(s.serializeMs ?? -1)} ms, ${((s.bytes ?? 0) / 1e6).toFixed(1)} MB on disk`,
      );
    });

    await searchSteps();
    await favoriteSteps();
    await homeSteps();
    await playerSteps();
  } catch (error) {
    log(`${clock()} SUITE ERROR ${String(error)}`);
  } finally {
    setPlayerTrace(null);
    useSearch.setState({ open: false });
    await stopPlayback();
    await sleep(3000);
    const after = await sampleCons();
    info("provider-active-cons", `samples [${consSamples.join(",")}]`);
    check(
      "released-after-stop",
      after === 0 || after === -1,
      `active_cons ${after} 3 s after stop`,
    );
    await restore(db, backup);
    const restored = await fingerprint(db);
    check("personal-data-restored", restored === before, `after restore: ${restored}`);
    log(`${clock()} SUITE DONE ${JSON.stringify(results)}`);
    // Every store reloads from the restored tables.
    await sleep(500);
    window.location.replace("/");
  }

  // --- search ---------------------------------------------------------------------------
  async function openOverlay() {
    if (!useSearch.getState().open) ctrlK();
    await until(() => !!$("[data-search-input]"), 2000);
    await sleep(250);
    return $<HTMLInputElement>("[data-search-input]")!;
  }

  async function searchSteps() {
    void navigate("/");
    await until(() => !!$("[data-home]"), 5000);

    await guarded("search-open", async () => {
      const t0 = performance.now();
      ctrlK();
      const shown = await until(() => !!$("[data-search-input]"), 2000, 1);
      const ms = (await afterPaint()) - t0;
      const focused = document.activeElement === $("[data-search-input]");
      check(
        "search-open",
        shown && focused,
        `Ctrl+K → overlay painted ${round(ms)} ms, input focused ${focused}`,
      );
      await sleep(300);
      press("Escape");
      await sleep(400);
      const closed = !$("[data-search-overlay]");
      ctrlK();
      await sleep(400);
      ctrlK();
      await sleep(400);
      check("search-close", closed && !$("[data-search-overlay]"), "Esc closes, Ctrl+K toggles");
    });

    const keystrokes: number[] = [];
    const typeWord = async (input: HTMLInputElement, word: string) => {
      for (let i = 1; i <= word.length; i++) {
        const ms = await timedQuery(input, word.slice(0, i));
        if (ms !== null) keystrokes.push(ms);
        await sleep(90);
      }
    };

    await guarded("search-accents-typo", async () => {
      const input = await openOverlay();
      await typeWord(input, plan.query);
      const hits = useSearch.getState().results;
      const all = hits ? [...hits.live, ...hits.vod, ...hits.series] : [];
      const folded = foldText(plan.query);
      const exact = all.filter((h) => foldText(h.title).includes(folded));
      // Written with accents: decomposing the title shows combining marks.
      const accented = exact.filter((h) => /\p{M}/u.test(h.title.normalize("NFD")));
      await snapshot("search-results");
      // A typo: drop one letter from the middle.
      const typo = plan.query.slice(0, 4) + plan.query.slice(5);
      await timedQuery(input, typo);
      const typoHits = useSearch.getState().results;
      const typoAll = typoHits ? [...typoHits.live, ...typoHits.vod, ...typoHits.series] : [];
      const sameFound = accented.some((a) =>
        typoAll.some((t) => t.kind === a.kind && t.id === a.id),
      );
      check(
        "search-accents",
        accented.length > 0,
        `"${plan.query}" typed without accents: ${all.length} results shown (${hits?.total.live} channels, ${hits?.total.vod} movies, ${hits?.total.series} series), ${exact.length} contain the word, ${accented.length} of them written with accents`,
      );
      check(
        "search-typo",
        sameFound,
        `"${typo}" (one letter missing) finds the same accented title(s): ${sameFound}; ${typoAll.length} results`,
      );
    });

    await guarded("search-latency", async () => {
      const input = await openOverlay();
      // Titles from the library, typed letter by letter, then with one typo.
      const sample = await db!.select<{ kind: string; id: number; name: string }>(
        `SELECT * FROM (SELECT 'live' AS kind, id, name FROM live ORDER BY random() LIMIT 8)
         UNION ALL SELECT * FROM (SELECT 'vod', id, name FROM vod ORDER BY random() LIMIT 8)
         UNION ALL SELECT * FROM (SELECT 'series', id, name FROM series ORDER BY random() LIMIT 8)`,
      );
      let typoTried = 0;
      let typoFound = 0;
      for (const item of sample) {
        const words = foldText(splitTitleYear(item.name).title).split(" ").filter(Boolean);
        if (words.length === 0) continue;
        typeInto(input, "");
        await sleep(120);
        await typeWord(input, words.slice(0, 2).join(" ").slice(0, 12));
        const longest = [...words].sort((a, b) => b.length - a.length)[0]!;
        if (longest.length >= 5 && !/^\d+$/.test(longest)) {
          const broken = longest.slice(0, 2) + longest.slice(3);
          const query = words.map((w) => (w === longest ? broken : w)).join(" ");
          await timedQuery(input, query);
          const hits = useSearch.getState().results;
          const group = hits ? hits[item.kind as "live" | "vod" | "series"] : [];
          typoTried++;
          // The same title can exist more than once (other ids): a match on the title counts.
          if (
            group.some(
              (h) =>
                h.id === Number(item.id) ||
                foldText(h.title) === foldText(splitTitleYear(item.name).title),
            )
          )
            typoFound++;
        }
      }
      const sorted = [...keystrokes].sort((a, b) => a - b);
      const worst = sorted[sorted.length - 1] ?? Infinity;
      const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? Infinity;
      check(
        "search-latency",
        worst < 100,
        `keystroke → results painted: ${stats(keystrokes)}, p95 ${round(p95)} ms; last query ${round(useSearch.getState().workerMs ?? -1)} ms in the worker`,
      );
      info(
        "search-typo-sample",
        `${typoFound}/${typoTried} random titles found with one letter missing from their longest word (top ${6} of their kind)`,
      );
    });

    await guarded("search-keyboard", async () => {
      const input = await openOverlay();
      const movieName = await db!.select<{ name: string }>("SELECT name FROM vod WHERE id = ?", [
        plan.movie,
      ]);
      const title = foldText(splitTitleYear(movieName[0]?.name ?? "").title);
      await timedQuery(input, title);
      const groups = useSearch.getState().results;
      const flat = groups ? [...groups.live, ...groups.vod, ...groups.series] : [];
      const target = flat.findIndex((h) => h.kind === "vod" && h.id === plan.movie);
      if (target < 0) {
        check("search-keyboard", false, `movie ${plan.movie} not in the results for its own title`);
        return;
      }
      for (let i = 0; i < target; i++) {
        press("ArrowDown");
        await sleep(60);
      }
      const selected = $("[role=option][aria-selected=true]")?.getAttribute("data-result");
      press("Enter");
      const opened = await until(
        () => !!$(`[data-movie="${plan.movie}"] [data-detail-title]`),
        15_000,
      );
      // The overlay fades out (150 ms) after closing.
      await until(() => !$("[data-search-overlay]"), 1000);
      check(
        "search-keyboard",
        selected === `vod:${plan.movie}` && opened && !$("[data-search-overlay]"),
        `↓×${target} selects vod:${plan.movie} (${selected}); Enter opens its page ${opened}, overlay closed ${!$("[data-search-overlay]")}`,
      );
    });

    await guarded("search-hidden", async () => {
      // Hide every category the movie is in: search must leave it out, then show it again.
      await movies.load();
      const cats = (
        await db!.select<{ c: string }>(
          "SELECT category_id AS c FROM category_items WHERE kind = 'vod' AND item_id = ?",
          [plan.movie],
        )
      ).map((r) => String(r.c));
      const movieName = await db!.select<{ name: string }>("SELECT name FROM vod WHERE id = ?", [
        plan.movie,
      ]);
      const title = foldText(splitTitleYear(movieName[0]?.name ?? "").title);
      for (const c of cats) await movies.setHidden(c, true);
      // Opening search reads the hidden categories again.
      const input2 = await openOverlay();
      typeInto(input2, "");
      await sleep(100);
      await timedQuery(input2, title);
      const hiddenOut = !useSearch.getState().results?.vod.some((h) => h.id === plan.movie);
      for (const c of cats) await movies.setHidden(c, false);
      useSearch.setState({ open: false });
      await sleep(300);
      const input3 = await openOverlay();
      typeInto(input3, "");
      await sleep(100);
      await timedQuery(input3, title);
      const back = !!useSearch.getState().results?.vod.some((h) => h.id === plan.movie);
      useSearch.setState({ open: false });
      check(
        "search-hidden",
        cats.length > 0 && hiddenOut && back,
        `${cats.length} categories hidden: left out ${hiddenOut}; shown again: ${back}`,
      );
    });
  }

  // --- favorites ------------------------------------------------------------------------
  async function favoriteSteps() {
    await guarded("favorites-movies", async () => {
      void navigate(`/movies/${plan.movie}`);
      const detail = await until(() => !!$(`[data-movie="${plan.movie}"] [data-favorite]`), 15_000);
      if (!detail) log(`${clock()} favorites-movies: no heart at ${window.location.pathname}`);
      const heart = $(`[data-movie="${plan.movie}"] [data-favorite]`);
      const wasOn = heart?.getAttribute("aria-pressed") === "true";
      if (!wasOn) click(heart);
      await sleep(400);
      const pressed = heart?.getAttribute("aria-pressed") === "true";
      // The rail is virtualised and keeps the active category in view: start from the top.
      movies.selectCategory("all");
      void navigate("/movies");
      await until(() => movies.use.getState().status === "ready", 15_000);
      const shown = await until(() => !!$('[data-catalog="vod"] [data-category="fav"]'), 15_000);
      if (!shown) {
        log(
          `${clock()} favorites-movies: at ${window.location.pathname}, catalog ${!!$("[data-catalog]")}, movies ${movies.use.getState().status}, categories ${movies.use.getState().categories.length}`,
        );
      }
      click($('[data-category="fav"]'));
      await sleep(600);
      const s = movies.use.getState();
      const inList = s.categoryId === "fav" && s.list.includes(plan.movie);
      const poster = !!$(`[data-poster="${plan.movie}"]`);
      check(
        "favorites-movies",
        pressed && inList && poster,
        `heart on the detail page → Favorites category (${s.categories.find((c) => c.id === "fav")?.count} movies) lists it ${inList}, poster shown ${poster}; was already a favorite ${wasOn}`,
      );
      await snapshot("movies-favorites");
      movies.selectCategory("all");
    });

    await guarded("favorites-series", async () => {
      void navigate(`/series/${plan.series}`);
      await until(() => !!$(`[data-series="${plan.series}"] [data-favorite]`), 20_000);
      const heart = $(`[data-series="${plan.series}"] [data-favorite]`);
      if (heart?.getAttribute("aria-pressed") !== "true") click(heart);
      await sleep(400);
      void navigate("/series");
      await until(() => series.use.getState().status === "ready", 15_000);
      await until(() => !!$('[data-catalog="series"] [data-category="fav"]'), 15_000);
      click($('[data-category="fav"]'));
      await sleep(600);
      const s = series.use.getState();
      check(
        "favorites-series",
        s.categoryId === "fav" &&
          s.list.includes(plan.series) &&
          !!$(`[data-poster="${plan.series}"]`),
        `Favorites category lists series ${plan.series}: ${s.list.includes(plan.series)} (${s.list.length} favorites)`,
      );
      series.selectCategory("all");
    });

    await guarded("favorites-empty", async () => {
      // Movies' Favorites with none: the empty line, in the States language.
      const favs = useFavorites.getState().vod;
      useFavorites.setState({ vod: [] });
      void navigate("/movies");
      await sleep(300);
      movies.selectCategory("fav");
      await sleep(500);
      const text =
        document.querySelector('[data-catalog="vod"] section[aria-label="Movies"]')?.textContent ??
        "";
      const ok = /No favorite movies yet\. Press the heart on any movie\./.test(text);
      useFavorites.setState({ vod: favs });
      movies.selectCategory("all");
      check("favorites-empty", ok, `Favorites with none shows the empty line: ${ok}`);
    });
  }

  // --- Home -------------------------------------------------------------------------------
  async function homeSteps() {
    await guarded("home-setup", async () => {
      // A full Home: five favorite channels, three watched, a movie and an episode in progress.
      const channels = await db!.select<{ id: number }>(
        "SELECT id FROM live WHERE epg_channel_id IS NOT NULL AND id <> ? ORDER BY position LIMIT 4",
        [plan.live],
      );
      const ids = [plan.live, ...channels.map((c) => Number(c.id))];
      const t = Date.now();
      for (const [i, id] of ids.entries()) await setFavorite(db!, "live", id, true, t + i);
      for (const [i, id] of ids.slice(0, 3).reverse().entries())
        await recordHistory(db!, "live", id, t - 60_000 + i);
      useFavorites.setState({ accountId: null });
      // The series page stores its episodes (episode → series for Home).
      void navigate(`/series/${plan.series}`);
      await until(() => !!$(`[data-series="${plan.series}"] [data-episode]`), 20_000);
      const episode = Number($(`[data-series="${plan.series}"] [data-episode]`)!.dataset.episode);
      await writeResume(db!, "vod", plan.movie, {
        positionSecs: 1500,
        durationSecs: 6000,
        watched: false,
        updatedAt: t - 1000,
      });
      await writeResume(db!, "episode", episode, {
        positionSecs: 600,
        durationSecs: 2400,
        watched: false,
        updatedAt: t,
      });
      info(
        "home-setup",
        `favorites ${ids.length}, history 3, resume: movie ${plan.movie} at 1500 s, episode ${episode} at 600 s`,
      );
    });

    await guarded("home-layout", async () => {
      const t0 = performance.now();
      void navigate("/");
      await loadHome();
      await until(() => !!$("[data-hero]") && !!$('[data-row="favorite-channels"]'), 8000);
      const ms = (await afterPaint()) - t0;
      await sleep(1500);
      const home = $("[data-home]")!;
      const hero = $("[data-hero]");
      const heroBox = box(hero)!;
      const heroInner = hero?.querySelector(":scope > div:last-child") ?? null;
      const title = $("[data-hero-title]");
      const resume = $("[data-hero-resume]");
      const sections = [...home.children].map((c) => box(c)!);
      const gaps = sections.slice(1).map((b, i) => round(b.top - sections[i]!.bottom));
      const cards = [...document.querySelectorAll('[data-row="favorite-channels"] > button')];
      const cardBox = box(cards[0]!)!;
      const cardGap = cards.length > 1 ? box(cards[1]!)!.left - cardBox.right : -1;
      const posters = [
        ...document.querySelectorAll('[data-row="recent-movies"] [data-poster] > span:first-child'),
      ].map((p) => box(p)!);
      const poster = posters[0];
      const sidebar = box($("nav[aria-label=Main]"))!;
      // The mockup has no scrollbar; the app's main area shows a thin one when Home is
      // taller than the window, so sizes are checked against the width left for content.
      const main = $("main")!;
      const scrollbar = main.offsetWidth - main.clientWidth;
      const content = main.clientWidth - 80;
      const cardWidth = (content - 4 * 14) / 5;
      const posterWidth = (content - 5 * 14) / 6;
      const checks: [string, boolean][] = [
        [
          `content ${content} px (mockup 1112, scrollbar ${scrollbar} px)`,
          content + scrollbar === 1112,
        ],
        [`sidebar ${round(sidebar.width)}`, near(sidebar.width, 248)],
        [`padding ${css(home, "padding")}`, css(home, "padding") === "32px 40px 48px"],
        [
          `hero ${round(heroBox.width)}×${round(heroBox.height)}`,
          near(heroBox.height, 380) && near(heroBox.width, content),
        ],
        [`hero radius ${css(hero, "border-radius")}`, css(hero, "border-radius") === "24px"],
        [`hero padding ${css(heroInner, "padding")}`, css(heroInner, "padding") === "40px 44px"],
        [
          `title ${css(title, "font-size")} ${css(title, "font-weight")}`,
          css(title, "font-size") === "60px" && css(title, "font-weight") === "800",
        ],
        [
          `resume ${round(box(resume)?.height ?? 0)} px, radius ${css(resume, "border-radius")}, sides ${css(resume, "padding-left")}`,
          near(box(resume)?.height, 48) &&
            css(resume, "border-radius") === "14px" &&
            css(resume, "padding-left") === "22px",
        ],
        [`row gaps ${gaps.join("/")}`, gaps.every((g) => near(g, 40))],
        [
          `${cards.length} channel cards ${round(cardBox.width)}×${round(cardBox.height)}, gap ${cardGap.toFixed(1)}`,
          cards.length === 5 && near(cardBox.width, cardWidth) && near(cardGap, 14),
        ],
        [
          `card padding ${css(cards[0]!, "padding")}, radius ${css(cards[0]!, "border-radius")}`,
          css(cards[0]!, "padding") === "16px" && css(cards[0]!, "border-radius") === "18px",
        ],
        [
          `${posters.length} posters ${poster?.width.toFixed(1)}×${poster?.height.toFixed(1)}`,
          posters.length === 6 &&
            near(poster?.width, posterWidth) &&
            near((poster?.height ?? 0) / (poster?.width ?? 1), 1.5, 0.01),
        ],
      ];
      check(
        "home-layout",
        checks.every(([, ok]) => ok),
        `painted ${round(ms)} ms after navigation; ${checks.map(([d, ok]) => `${d}${ok ? "" : " ✗"}`).join("; ")}`,
      );
      const rows = [...home.querySelectorAll("[data-row]")].map(
        (r) => (r as HTMLElement).dataset.row,
      );
      info(
        "home-rows",
        `${$("[data-hero]")?.getAttribute("data-hero")} hero; rows ${rows.join(", ")}`,
      );
      await snapshot("home");
    });

    await guarded("home-epg", async () => {
      await sleep(4000);
      const cards = [...document.querySelectorAll('[data-row="favorite-channels"] > button')];
      const withNow = cards.filter(
        (c) => (c.querySelector(".line-clamp-2")?.textContent ?? "").trim() !== "",
      );
      check(
        "home-epg",
        withNow.length > 0,
        `${withNow.length}/${cards.length} favorite cards show what is on now`,
      );
      const main = $("main")!;
      main.scrollTop = main.scrollHeight;
      await snapshot("home-rows");
      main.scrollTop = 0;
    });

    await guarded("home-fresh", async () => {
      injectFreshAccount();
      await sleep(600);
      const text = $("[data-home]")?.textContent ?? "";
      const ok =
        text.includes("Movies and episodes you start show up here, ready to resume.") &&
        text.includes("No favorite channels yet. Press the heart on any channel in Live TV.") &&
        !$("[data-hero]") &&
        !$('[data-row="continue-watching"]') &&
        !$('[data-row="recent-channels"]');
      check(
        "home-fresh",
        ok,
        "fresh account: empty lines for in progress and favorites, no history rows",
      );
      $("main")!.scrollTop = 0;
      await snapshot("home-fresh");
      await loadHome();
    });
  }

  // --- the player: Resume from Home, then search over the player ------------------------------
  async function playerSteps() {
    await guarded("home-resume", async () => {
      if (!(await consFree())) {
        check("home-resume", false, "active_cons stayed above 0 for 90 s; no stream opened");
        return;
      }
      void navigate("/");
      await until(() => !!$("[data-hero-resume]"), 8000);
      const [kind, id] = ($("[data-hero]")?.getAttribute("data-hero") ?? ":").split(":");
      // Trace route and tuner changes while the player opens.
      let route = window.location.pathname;
      const routeTimer = setInterval(() => {
        if (window.location.pathname === route) return;
        route = window.location.pathname;
        const tuner = useTuner.getState();
        log(`${clock()} route ${route} (tuner ${tuner.mode}, media ${tuner.media?.id ?? "-"})`);
      }, 20);
      const timing = nextTiming(40_000);
      click($("[data-hero-resume]"));
      const t = await timing;
      clearInterval(routeTimer);
      await waitFor((s) => s.timePos !== null, 5000);
      const pos = player().timePos ?? -1;
      const media = useTuner.getState().media;
      check(
        "home-resume",
        !!t &&
          media?.kind === kind &&
          media?.id === Number(id) &&
          Math.abs(pos - 600) <= 5 &&
          useFullscreen.getState().on,
        `Resume plays ${media?.kind}:${media?.id} from ${pos.toFixed(0)} s (saved 600 s); click → first frame ${t?.totalMs} ms`,
      );
      press("Escape");
      const back = await until(() => window.location.pathname === "/" && !!$("[data-home]"), 8000);
      check("home-resume-back", back, `Esc returns to Home: ${back}`);
      await stopPlayback();
      await sleep(1500);
    });

    await guarded("search-in-player", async () => {
      if (!(await consFree())) {
        check("search-in-player", false, "active_cons stayed above 0 for 90 s; no stream opened");
        return;
      }
      await loadLive();
      void navigate("/");
      await until(() => !!$(`[data-channel-card="${plan.live}"]`), 8000);
      const timing = nextTiming(30_000);
      click($(`[data-channel-card="${plan.live}"]`));
      const t = await timing;
      await until(() => !!$("[data-player]"), 5000);
      const loadsBefore = player().loads;
      const mutedBefore = useTuner.getState().userMuted;
      const fullscreenBefore = useFullscreen.getState().on;
      const input = await openOverlay();
      const center = document.elementFromPoint(window.innerWidth / 2, window.innerHeight * 0.3);
      const onTop = !!center?.closest("[data-search-overlay]");
      // Letters the player maps to shortcuts (m, f, space) go to the field.
      const name = foldText(
        splitTitleYear(useLive.getState().channels.get(plan.live)?.name ?? "").title,
      );
      input.focus();
      for (const key of ["m", "f", " "]) press(key);
      await timedQuery(input, name);
      const keysIsolated =
        useTuner.getState().userMuted === mutedBefore &&
        useFullscreen.getState().on === fullscreenBefore;
      await snapshot("search-over-player");
      const groups = useSearch.getState().results;
      const index = groups?.live.findIndex((h) => h.id === plan.live) ?? -1;
      for (let i = 0; i < index; i++) press("ArrowDown");
      press("Enter");
      await sleep(1500);
      const tuner = useTuner.getState();
      check(
        "search-in-player",
        !!t &&
          onTop &&
          keysIsolated &&
          index >= 0 &&
          tuner.channelId === plan.live &&
          window.location.pathname === "/watch" &&
          !$("[data-search-overlay]") &&
          player().loads === loadsBefore,
        `card → player first frame ${t?.totalMs} ms; Ctrl+K over the player: on top ${onTop}; M/F/Space typed into the field, not the player ${keysIsolated}; choosing the playing channel keeps it (no new load ${player().loads === loadsBefore}), still in the player ${window.location.pathname === "/watch"}`,
      );
      press("Escape");
      await sleep(1000);
    });
  }
}
