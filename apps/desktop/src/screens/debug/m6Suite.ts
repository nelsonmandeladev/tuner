/**
 * M6 acceptance suite (docs/ROADMAP.md "M6"), dev builds only.
 *
 * `TUNER_M6_SUITE="live=<id>,movie=<id>,series=<id>"` checks Settings,
 * playback options, the light theme, several accounts, background refresh
 * and account removal through the real screens, and prints `RESULT` lines
 * (ids, counts, sizes and timings only; no names, no URLs, no credentials).
 * `SNAPSHOT <name>` lines hold the screen for a window capture.
 * `,only=settings|theme|accounts` runs one part.
 *
 * What it changes, and how it is undone:
 * - App settings (theme, playback, refresh interval): the stored value is
 *   kept in `dev.m6Suite.state` in app.db and written back at the end.
 * - The account in use: its personal tables are copied first and restored
 *   exactly (as in the M5 suite); a hidden category is shown again.
 * - A second, throw-away account made from the `.env.local` login: it is
 *   switched to, synced, edited, cleared and removed through Settings, and
 *   the suite proves nothing of it is left (files, keychain).
 * - The image cache is cleared twice (a cache; it fills again).
 * A run that crashed leaves `dev.m6Suite.state`; the next run undoes it first.
 */

import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import {
  getSetting,
  insertAccount,
  listAccounts,
  recordHistory,
  searchIndexKey,
  secretKey,
  setSetting,
  type Account,
  type SqlAdapter,
} from "@tuner/core";
import type { NavigateFunction } from "react-router";
import { chooseAccount, leaveActiveAccount } from "../../data/accounts";
import { movies } from "../../data/catalog";
import { loadFavorites, setFavoriteOf, useFavorites } from "../../data/favorites";
import { loadHome, useHome } from "../../data/home";
import { loadLive, revealChannel, setHidden, useLive } from "../../data/live";
import { openSearch, closeSearch, setQuery, useSearch } from "../../data/search";
import { keychain } from "../../data/secrets";
import {
  activeClient,
  activeLibrary,
  appDatabase,
  refreshIfStale,
  removeAccount,
  useSession,
} from "../../data/session";
import { loadSettings, settingsKey, updateSettings, useSettings } from "../../data/settings";
import { setPlayerTrace, startPlayer } from "../../player/controller";
import { mpv, rejectedOptions } from "../../player/mpv";
import { stopPlayback } from "../../player/tuner";
import { personalBackup } from "./personalBackup";
import {
  $,
  afterPaint,
  click,
  clock,
  nextTiming,
  rafLoop,
  round,
  sleep,
  until,
  type Check,
  type Log,
} from "./suiteKit";

export interface M6Plan {
  live: number;
  movie: number;
  series: number;
  only: "settings" | "theme" | "accounts" | null;
}

/** `live=1,movie=2,series=3[,only=accounts]` */
export function parseM6Plan(value: string): M6Plan | null {
  const entries = Object.fromEntries(
    value.split(",").map((part) => part.trim().split("=") as [string, string]),
  );
  const only = ["settings", "theme", "accounts"].includes(entries.only ?? "")
    ? (entries.only as M6Plan["only"])
    : null;
  const plan = {
    live: Number(entries.live),
    movie: Number(entries.movie),
    series: Number(entries.series),
    only,
  };
  return plan.live > 0 && plan.movie > 0 && plan.series > 0 ? plan : null;
}

const STATE_KEY = "dev.m6Suite.state";
const BACKUP_KEY = "dev.m6Suite.backup";
const TEST_NAME = "M6 test account";

interface SuiteState {
  /** The app settings row as it was (null: not stored yet). */
  settings: string | null;
  activeId: string;
  testAccount: string | null;
}

interface DevCredentials {
  server: string;
  username: string;
  password: string;
}

interface Traces {
  files: string[];
  images: number;
  secret: boolean;
}

/** Sets an input's value the way typing does, so React's onChange runs. */
function typeInto(input: HTMLInputElement | null, value: string) {
  if (!input) throw new Error("no input");
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

const box = (element: Element | null) => element?.getBoundingClientRect() ?? null;
const css = (element: Element | null, property: string) =>
  element ? getComputedStyle(element).getPropertyValue(property).trim() : "";
const near = (a: number | undefined, b: number, tolerance = 1) =>
  a !== undefined && Math.abs(a - b) <= tolerance;

// --- contrast (WCAG 2) -------------------------------------------------------------

function rgb(color: string): [number, number, number, number] | null {
  const m = color.match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const [r, g, b, a = "1"] = m[1]!.split(/[ ,/]+/).filter(Boolean);
  return [Number(r), Number(g), Number(b), Number(a)];
}
function luminance([r, g, b]: [number, number, number, number]) {
  const f = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
/**
 * The first opaque background behind an element. With none, the page's own
 * `--bg`: the Backdrop SVG paints it under every screen (player/Backdrop.tsx).
 */
function backgroundOf(element: Element): [number, number, number, number] | null {
  for (let e: Element | null = element; e; e = e.parentElement) {
    const c = rgb(getComputedStyle(e).backgroundColor);
    if (c && c[3] >= 0.99) return c;
  }
  const hex = getComputedStyle(element).getPropertyValue("--bg").trim().replace("#", "");
  return hex.length === 6
    ? ([0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)).concat(1) as [
        number,
        number,
        number,
        number,
      ])
    : null;
}

/**
 * Every visible element with its own text under `root`: the lowest text
 * contrast against its background, and how many fall under 4.5:1.
 */
function contrastAudit(root: Element) {
  const ratios: { ratio: number; text: string; size: number }[] = [];
  for (const element of root.querySelectorAll<HTMLElement>("*")) {
    const own = [...element.childNodes].some(
      (n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim(),
    );
    // Text on video and artwork (dark scopes inside the page) is not measured here.
    const scope = element.closest("[data-theme]");
    if (!own || element.offsetParent === null) continue;
    if (scope && scope !== document.documentElement && scope.getAttribute("data-theme") === "dark")
      continue;
    const style = getComputedStyle(element);
    const fg = rgb(style.color);
    const bg = backgroundOf(element);
    if (!fg || !bg) continue;
    // Blend a translucent text colour over its background.
    const a = fg[3];
    const mixed: [number, number, number, number] = [
      fg[0] * a + bg[0] * (1 - a),
      fg[1] * a + bg[1] * (1 - a),
      fg[2] * a + bg[2] * (1 - a),
      1,
    ];
    const [l1, l2] = [luminance(mixed), luminance(bg)].sort((x, y) => y - x) as [number, number];
    ratios.push({
      ratio: (l1 + 0.05) / (l2 + 0.05),
      text: element.textContent!.trim().slice(0, 24),
      size: parseFloat(style.fontSize),
    });
  }
  ratios.sort((x, y) => x.ratio - y.ratio);
  const low = ratios.filter((r) => r.ratio < 4.5);
  return {
    count: ratios.length,
    min: ratios[0]?.ratio ?? 0,
    low,
    detail: `${ratios.length} text elements, lowest ${ratios[0]?.ratio.toFixed(2)}:1 (${ratios[0]?.size}px), ${low.length} under 4.5:1${
      low.length ? ` [${low.map((l) => `${l.ratio.toFixed(2)}@${l.size}px`).join(", ")}]` : ""
    }`,
  };
}

// --- the suite ---------------------------------------------------------------------

export async function runM6Suite(plan: M6Plan, navigate: NavigateFunction, log: Log) {
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
  // winapp's capture lands 3.5–4 s after the line: hold longer than that.
  const snapshot = async (name: string, ms = 6000) => {
    await afterPaint();
    log(`${clock()} SNAPSHOT ${name} (holding ${ms / 1000} s)`);
    await sleep(ms);
  };
  const runs = (part: NonNullable<M6Plan["only"]>) => plan.only === null || plan.only === part;

  const app = await appDatabase();
  const traces = (id: string) => invoke<Traces>("debug_account_traces", { account: id });

  // --- undo a crashed run --------------------------------------------------------------
  const leftover = await getSetting(app, STATE_KEY);
  if (leftover) {
    const state = JSON.parse(leftover) as SuiteState;
    await undo(state);
    info("leftover-restored", "a previous run's changes were found and undone first");
  }

  const first = useSession.getState().active;
  const db = activeLibrary();
  if (!first || !db || useSession.getState().phase !== "ready") {
    check("setup", false, "no active account");
    return;
  }
  const personal = personalBackup(db, BACKUP_KEY);
  const personalLeftover = await personal.read();
  if (personalLeftover) await personal.restore(personalLeftover);
  const before = await personal.fingerprint();
  await personal.backUp();
  const state: SuiteState = {
    settings: await getSetting(app, settingsKey),
    activeId: first.id,
    testAccount: null,
  };
  await setSetting(app, STATE_KEY, JSON.stringify(state));
  info("backed-up", `personal data (${before}); app settings stored ${state.settings !== null}`);

  const appWindow = getCurrentWindow();
  await appWindow.setFullscreen(false);
  await appWindow.setSize(new LogicalSize(1440, 900));
  setPlayerTrace(log);
  const client = await activeClient();
  const consFree = async () => {
    for (let i = 0; i < 10; i++) {
      let cons: number;
      try {
        cons = (await client?.accountInfo())?.activeConnections ?? -1;
      } catch {
        cons = -1;
      }
      if (cons === 0) return true;
      log(`${clock()} active_cons=${cons}, waiting 10 s`);
      await sleep(10_000);
    }
    return false;
  };

  try {
    if (runs("settings")) await settingsSteps();
    if (runs("theme")) await themeSteps();
    if (runs("accounts")) await accountSteps();
  } finally {
    await guarded("restore", async () => {
      await stopPlayback();
      await undo(state);
      const back = activeLibrary();
      const now =
        back && useSession.getState().active?.id === first.id
          ? await personalBackup(back, BACKUP_KEY).fingerprint()
          : "account not active";
      const settingsNow = await getSetting(app, settingsKey);
      const accounts = await listAccounts(app);
      check(
        "restored",
        now === before &&
          settingsNow === state.settings &&
          accounts.every((a) => !a.name.startsWith(TEST_NAME)) &&
          useSession.getState().active?.id === first.id,
        `personal data ${now === before ? "identical" : `differs: ${now}`}; app settings ${settingsNow === state.settings ? "identical" : "differ"}; ${accounts.length} account(s), active is the original ${useSession.getState().active?.id === first.id}`,
      );
    });
    log(`${clock()} SUITE DONE ${JSON.stringify(results)}`);
  }

  /** Puts everything back: test account removed, original account active, settings and personal data as they were. */
  async function undo(saved: SuiteState) {
    const accounts = await listAccounts(app);
    for (const account of accounts.filter(
      (a) => a.name.startsWith(TEST_NAME) || a.id === saved.testAccount,
    )) {
      if (useSession.getState().active?.id === account.id) await leaveActiveAccount();
      await removeAccount(account.id);
    }
    if (useSession.getState().active?.id !== saved.activeId) await chooseAccount(saved.activeId);
    const library = activeLibrary();
    if (library) {
      const p = personalBackup(library, BACKUP_KEY);
      const copy = await p.read();
      if (copy) await p.restore(copy);
    }
    if (saved.settings === null)
      await app.execute("DELETE FROM settings WHERE key = ?", [settingsKey]);
    else await setSetting(app, settingsKey, saved.settings);
    await loadSettings();
    await app.execute("DELETE FROM settings WHERE key = ?", [STATE_KEY]);
  }

  // --- Settings screen and playback options ----------------------------------------------
  async function settingsSteps() {
    await guarded("settings-layout", async () => {
      await navigate("/settings");
      await until(() => $("[data-screen=settings]") !== null, 5000);
      await sleep(600);
      const sections = [...document.querySelectorAll("[data-settings]")];
      const panel = sections[0]?.querySelector(":scope > div");
      const column = $("[data-screen=settings] > div");
      const sw = $("[role=switch]");
      const select = $("[role=combobox]");
      const segment = $("[data-screen=settings] [role=radiogroup]");
      const small = $("[data-refresh]") ?? $("[data-switch]");
      const title = $("[data-screen=settings] h1");
      const checks: [string, boolean][] = [
        [
          `sections ${sections.map((s) => (s as HTMLElement).dataset.settings).join("/")}`,
          sections.length === 6,
        ],
        [`column ${round(box(column)?.width ?? 0)} px`, near(box(column)?.width, 800)],
        [
          `panel radius ${css(panel ?? null, "border-radius")}`,
          css(panel ?? null, "border-radius") === "18px",
        ],
        [
          `switch ${round(box(sw)?.width ?? 0)}×${round(box(sw)?.height ?? 0)}`,
          near(box(sw)?.width, 44) && near(box(sw)?.height, 26),
        ],
        [
          `select ${round(box(select)?.height ?? 0)} px, radius ${css(select, "border-radius")}`,
          near(box(select)?.height, 40) && css(select, "border-radius") === "9999px",
        ],
        [
          `segmented radius ${css(segment, "border-radius")}`,
          css(segment, "border-radius") === "9999px",
        ],
        [
          `small button ${round(box(small)?.height ?? 0)} px, radius ${css(small, "border-radius")}`,
          near(box(small)?.height, 40) && css(small, "border-radius") === "9999px",
        ],
        [
          `title top ${round(box(title)?.top ?? 0)} px (under the 40-px bar)`,
          (box(title)?.top ?? 0) >= 40,
        ],
      ];
      check(
        "settings-layout",
        checks.every(([, ok]) => ok),
        checks.map(([d, ok]) => `${ok ? "" : "✗ "}${d}`).join("; "),
      );
      const audit = contrastAudit($("[data-screen=settings]")!);
      check("settings-contrast-dark", audit.low.length === 0, audit.detail);
      await snapshot("settings-dark");
      $("main")?.scrollTo({ top: 10_000 });
      await snapshot("settings-dark-bottom");
      $("main")?.scrollTo({ top: 0 });
    });

    await guarded("account-menu", async () => {
      click($("[data-account-button]"));
      const open = await until(() => $("[data-account-menu]") !== null, 2000);
      const items = document.querySelectorAll("[data-account-menu] [role^=menuitem]").length;
      await sleep(300);
      check(
        "account-menu",
        open && items >= 3,
        `menu opens over the account button with ${items} items (accounts + Add + Manage)`,
      );
      await snapshot("account-menu", 8000);
      info("account-menu-held", `still open after the hold: ${$("[data-account-menu]") !== null}`);
      window.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      await until(() => $("[data-account-menu]") === null, 2000);
    });

    await guarded("playback-options", async () => {
      await startPlayer();
      const original = { ...useSettings.getState() };
      const read = async () => ({
        hwdec: await mpv.getString("hwdec"),
        max: await mpv.getString("demuxer-max-bytes"),
        deint: await mpv.getString("deinterlace"),
        alang: await mpv.getString("alang"),
        slang: await mpv.getString("slang"),
      });
      const initial = await read();
      await updateSettings({
        hardwareDecoding: false,
        buffer: "large",
        deinterlace: "on",
        audioLanguage: "fr",
        subtitleLanguage: "en",
      });
      await sleep(400);
      const changed = await read();
      await updateSettings({
        hardwareDecoding: original.hardwareDecoding,
        buffer: original.buffer,
        deinterlace: original.deinterlace,
        audioLanguage: original.audioLanguage,
        subtitleLanguage: original.subtitleLanguage,
      });
      await sleep(400);
      const back = await read();
      const ok =
        changed.hwdec === "no" &&
        Number(changed.max) === 400 * 1024 * 1024 &&
        changed.deint === "yes" &&
        changed.alang === "fr,fra,fre" &&
        changed.slang === "en,eng" &&
        JSON.stringify(back) === JSON.stringify(initial) &&
        rejectedOptions.size === 0;
      check(
        "playback-options",
        ok,
        `default ${JSON.stringify(initial)}; changed ${JSON.stringify(changed)}; back ${JSON.stringify(back)}; rejected by mpv: [${[...rejectedOptions].join(", ")}]`,
      );
    });

    await guarded("hidden-categories", async () => {
      await loadLive();
      const category = useLive.getState().categories.find((c) => !c.builtIn);
      if (!category) throw new Error("no provider category");
      await setHidden(category.id, true);
      await navigate("/");
      await sleep(200);
      await navigate("/settings");
      const listed = await until(
        () =>
          [...document.querySelectorAll("[data-hidden-categories] li")].some((li) =>
            li.textContent?.includes(category.name),
          ),
        4000,
      );
      const row = [...document.querySelectorAll("[data-hidden-categories] li")].find((li) =>
        li.textContent?.includes(category.name),
      );
      click(row?.querySelector("button") ?? null);
      const gone = await until(
        () => !useLive.getState().hiddenCategories.some((c) => c.id === category.id),
        3000,
      );
      check(
        "hidden-categories",
        listed && gone,
        `a hidden Live TV category is listed in Settings → Content ${listed}; "Show" brings it back to Live TV ${gone}`,
      );
    });
  }

  // --- light theme ----------------------------------------------------------------------
  async function themeSteps() {
    await guarded("theme-light", async () => {
      await navigate("/settings");
      await until(() => $("[data-screen=settings]") !== null, 5000);
      const t0 = performance.now();
      click(
        [...document.querySelectorAll("[data-settings=appearance] [role=radio]")].find(
          (b) => b.textContent === "Light",
        ) ?? null,
      );
      await until(() => document.documentElement.dataset.theme === "light", 2000);
      const paintMs = (await afterPaint()) - t0;
      const root = getComputedStyle(document.documentElement);
      const stored = JSON.parse((await getSetting(app, settingsKey)) ?? "{}") as { theme?: string };
      check(
        "theme-switch",
        root.getPropertyValue("--bg").trim() === "#f3f4f3" && stored.theme === "light",
        `--bg ${root.getPropertyValue("--bg").trim()}, --text ${root.getPropertyValue("--text").trim()}, accent ink ${root.getPropertyValue("--accent-ink").trim()}; stored ${stored.theme}; painted ${round(paintMs)} ms after the click`,
      );
      // Buttons and segments fade their colours for 120 ms: measure after.
      await sleep(400);
      const audit = contrastAudit($("[data-screen=settings]")!);
      check("settings-contrast-light", audit.low.length === 0, audit.detail);
      await snapshot("settings-light");
      $("main")?.scrollTo({ top: 10_000 });
      await snapshot("settings-light-bottom");
      $("main")?.scrollTo({ top: 0 });
    });

    await guarded("light-screens", async () => {
      await navigate("/");
      await loadHome();
      await until(() => useHome.getState().status === "ready", 5000);
      await sleep(1200);
      const heroScope = $("[data-hero] , section[data-theme=dark]");
      const logo = $("[data-theme=dark].rounded-field");
      const audit = contrastAudit($("main")!);
      check(
        "home-light",
        audit.low.length === 0,
        `${audit.detail}; hero keeps dark tokens ${css(heroScope, "--bg") === "#0a0b0c"}; logo tiles dark ${css(logo, "--surface") === "#121417"}`,
      );
      await snapshot("home-light");

      await navigate("/movies");
      await until(() => movies.use.getState().status === "ready", 10_000);
      await sleep(1500);
      await snapshot("movies-light");
      await navigate(`/movies/${plan.movie}`);
      await sleep(2500);
      const movieAudit = contrastAudit($("main")!);
      check("movie-light", movieAudit.low.length === 0, movieAudit.detail);
      await snapshot("movie-light");
      await navigate(`/series/${plan.series}`);
      await sleep(2500);
      const seriesAudit = contrastAudit($("main")!);
      check("series-light", seriesAudit.low.length === 0, seriesAudit.detail);
      await snapshot("series-light");

      await navigate("/");
      await sleep(400);
      openSearch();
      await until(() => useSearch.getState().status === "ready", 20_000);
      setQuery("news");
      await until(() => useSearch.getState().resultsFor === "news", 3000);
      await sleep(600);
      await snapshot("search-light");
      closeSearch();

      if (await consFree()) {
        await navigate("/live");
        await until(() => useLive.getState().status === "ready", 10_000);
        await sleep(6000);
        const liveAudit = contrastAudit($("main")!);
        check("live-light", liveAudit.low.length === 0, liveAudit.detail);
        await snapshot("live-light", 6000);
        await navigate("/");
        await stopPlayback();
      } else {
        info("live-light", "skipped: the subscription's connection is in use");
      }
    });

    await guarded("theme-dark-again", async () => {
      await updateSettings({ theme: "dark" });
      await afterPaint();
      check(
        "theme-dark-again",
        css(document.documentElement, "--bg") === "#0a0b0c",
        `--bg ${css(document.documentElement, "--bg")}`,
      );
    });
  }

  // --- several accounts, background refresh, removal ------------------------------------------
  async function accountSteps() {
    const creds = await invoke<DevCredentials | null>("debug_m6_credentials");
    if (!creds) {
      check("accounts", false, "no .env.local credentials");
      return;
    }
    const id = crypto.randomUUID();
    state.testAccount = id;
    await setSetting(app, STATE_KEY, JSON.stringify(state));
    let second: SqlAdapter | null = null;
    const firstBefore = await personal.fingerprint();

    await guarded("account-add", async () => {
      const before = await traces(id);
      const account: Account = {
        ...first!,
        id,
        name: TEST_NAME,
        createdAt: Date.now(),
        lastSyncAt: null,
      };
      // The same subscription a second time: the Connect form would update the
      // existing account instead (same server and username), so the row and
      // keychain entry are written as connect() writes them.
      await keychain.set(secretKey(id), creds.password);
      await insertAccount(app, account);
      useSession.setState({ accounts: await listAccounts(app) });
      const after = await traces(id);
      check(
        "account-add",
        before.files.length === 0 && !before.secret && after.secret,
        `before: ${before.files.length} files, keychain ${before.secret}; after: keychain ${after.secret}, ${useSession.getState().accounts.length} accounts`,
      );
    });

    await guarded("account-switch", async () => {
      await navigate("/");
      await sleep(500);
      click($("[data-account-button]"));
      await until(() => $(`[data-account="${id}"]`) !== null, 2000);
      const t0 = performance.now();
      click($(`[data-account="${id}"]`));
      const switched = await until(
        () =>
          useSession.getState().active?.id === id &&
          useHome.getState().accountId === id &&
          useHome.getState().status === "ready",
        10_000,
      );
      const homeMs = (await afterPaint()) - t0;
      const syncStarted = await until(() => useSession.getState().sync.running, 5000);
      check(
        "account-switch",
        switched && useLive.getState().accountId !== first!.id && syncStarted,
        `sidebar menu → new account's Home painted ${round(homeMs)} ms; old Live TV data dropped ${useLive.getState().accountId !== first!.id}; never-synced lists start loading in the background ${syncStarted}`,
      );
      const t1 = performance.now();
      const synced = await until(
        () => !useSession.getState().sync.running && useSession.getState().syncState.length === 4,
        300_000,
        250,
      );
      const counts = useSession.getState().counts;
      check(
        "account-first-sync",
        synced && (counts?.live ?? 0) > 0,
        `background sync of the new account ${round((performance.now() - t1) / 1000)} s: ${counts?.live} channels, ${counts?.vod} movies, ${counts?.series} series; error ${useSession.getState().sync.error}`,
      );
      second = activeLibrary();
    });

    await guarded("background-refresh", async () => {
      await navigate("/");
      await loadLive();
      const v0 = useSession.getState().libraryVersion;
      const statuses = new Set<string>();
      const unsubscribe = useLive.subscribe((s) => statuses.add(s.status));
      const frames: number[] = [];
      const keyBefore = useSearch.getState().key;
      const started = refreshIfStale(Date.now() + 13 * 3_600_000);
      await until(() => useSession.getState().sync.running, 3000);
      const t0 = performance.now();
      let measuring = true;
      void (async () => {
        while (measuring) await rafLoop(1000, (dt) => frames.push(dt));
      })();
      // Live TV reads its list again while the rest still loads.
      await until(() => useSession.getState().libraryVersion > v0 + 1, 120_000);
      await loadLive();
      await started;
      measuring = false;
      const syncMs = performance.now() - t0;
      await loadLive();
      unsubscribe();
      const indexed = await until(
        () =>
          useSearch.getState().key === searchIndexKey(useSession.getState().syncState) &&
          useSearch.getState().status === "ready",
        60_000,
      );
      const long = frames.filter((f) => f > 50);
      const worst = Math.max(...frames);
      check(
        "background-refresh",
        useSession.getState().lastRefresh?.reason === "stale" &&
          useLive.getState().version === useSession.getState().libraryVersion &&
          !statuses.has("loading") &&
          indexed &&
          useHome.getState().status === "ready",
        `lists 13 h old → refreshed in the background in ${round(syncMs / 1000)} s while Home stayed up; Live TV read again quietly (statuses ${[...statuses].join("/") || "none"}, version ${useLive.getState().version}/${useSession.getState().libraryVersion}); search index rebuilt ${indexed} (key changed ${keyBefore !== useSearch.getState().key}); frames ${frames.length}, worst ${round(worst)} ms, ${long.length} over 50 ms (${((long.length / Math.max(1, frames.length)) * 100).toFixed(1)}%)`,
      );
      const skipped = await refreshIfStale();
      check(
        "refresh-skipped-when-fresh",
        !skipped && useSession.getState().lastRefresh?.reason === "skipped",
        "fresh lists: no refresh on launch",
      );
    });

    await guarded("account-isolation", async () => {
      const channel = useLive.getState().list[0];
      if (!channel || !second) throw new Error("no channel in the test account");
      await setFavoriteOf("live", channel, true);
      const db2Favorites = (
        await second.select<{ n: number }>("SELECT COUNT(*) AS n FROM favorites")
      )[0]?.n;
      await chooseAccount(first!.id);
      await until(() => useSession.getState().active?.id === first!.id, 5000);
      await loadFavorites();
      const firstPrint = await personal.fingerprint();
      const firstFav = useFavorites.getState().live;
      check(
        "account-isolation",
        Number(db2Favorites) === 1 &&
          firstPrint === firstBefore &&
          useFavorites.getState().accountId === first!.id &&
          !firstFav.includes(channel),
        `a favorite set in the test account is stored there (${db2Favorites} row); back on the original account: ${firstFav.length} favorites without it, personal tables unchanged by the test account (switch, sync, favorite) ${firstPrint === firstBefore}`,
      );
      await chooseAccount(id);
      await until(() => useSession.getState().active?.id === id, 5000);
    });

    await guarded("account-play", async () => {
      if (!(await consFree())) {
        info("account-play", "skipped: the subscription's connection is in use");
        return;
      }
      await navigate("/live");
      await until(() => useLive.getState().status === "ready", 10_000);
      const timing = nextTiming(30_000);
      revealChannel(plan.live);
      const t = await timing;
      check(
        "account-play",
        t !== null,
        `the switched-to account plays live ${plan.live}: first frame ${t?.totalMs ?? "none"} ms (app ${t?.issuedMs ?? "?"} ms)`,
      );
      await navigate("/");
      await stopPlayback();
    });

    await guarded("account-edit", async () => {
      await navigate("/settings");
      const row = () => $(`[data-account-row="${id}"]`);
      await until(() => row() !== null, 4000);
      // A name alone: no network.
      click(row()!.querySelector("[data-edit]"));
      await until(() => $("[data-edit-account]") !== null, 2000);
      typeInto($<HTMLInputElement>("#edit-name"), `${TEST_NAME} (renamed)`);
      click($("[data-edit-account] button[type=submit]"));
      const closed = await until(() => $("[data-edit-account]") === null, 4000);
      const renamed = (await listAccounts(app)).find((a) => a.id === id)?.name;
      // A password entered again: checked with the provider (one account-info
      // request with the right login). Never submit a made-up login: the
      // provider answers wrong ones with 429 and can block the address.
      click(row()!.querySelector("[data-edit]"));
      await until(() => $("[data-edit-account]") !== null, 2000);
      typeInto($<HTMLInputElement>("#edit-password"), creds.password);
      const t0 = performance.now();
      click($("[data-edit-account] button[type=submit]"));
      const saved = await until(() => $("[data-edit-account]") === null, 15_000);
      const account = (await listAccounts(app)).find((a) => a.id === id);
      check(
        "account-edit",
        closed && renamed === `${TEST_NAME} (renamed)` && saved && account?.status !== null,
        `rename saved without a request ${closed && renamed === `${TEST_NAME} (renamed)`}; password entered again and checked with the provider, saved in ${round(performance.now() - t0)} ms ${saved}; status ${account?.status}`,
      );
    });

    await guarded("data-clear", async () => {
      if (!second) throw new Error("no test library");
      await recordHistory(second, "live", plan.live, Date.now());
      await navigate("/settings");
      await until(() => $("[data-clear-history]") !== null, 4000);
      $("[data-clear-history]")?.scrollIntoView();
      click($("[data-clear-history]"));
      await until(() => $("[data-confirm-history]") !== null, 2000);
      click($("[data-confirm-history]"));
      const cleared = await until(
        () => document.body.textContent?.includes("History cleared.") ?? false,
        4000,
      );
      const count = async (table: string) =>
        Number((await second!.select<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`))[0]?.n);
      const history = await count("history");
      const favorites = await count("favorites");
      const imagesBefore = await invoke<number>("image_cache_size");
      click($("[data-clear-cache]"));
      await until(() => document.body.textContent?.includes("Cache cleared.") ?? false, 6000);
      const imagesAfter = await invoke<number>("image_cache_size");
      const details = await count("details_cache");
      check(
        "data-clear",
        cleared && history === 0 && favorites === 1 && imagesAfter < imagesBefore && details === 0,
        `history ${history} rows after clearing, favorites kept ${favorites}; image cache ${(imagesBefore / 1e6).toFixed(1)} → ${(imagesAfter / 1e6).toFixed(1)} MB; detail cache ${details} rows`,
      );
    });

    await guarded("account-remove", async () => {
      await navigate("/settings");
      const row = () => $(`[data-account-row="${id}"]`);
      await until(() => row() !== null, 4000);
      const present = await traces(id);
      click(row()!.querySelector("[data-remove]"));
      await until(() => row()?.querySelector("[data-confirm-remove]") != null, 2000);
      const t0 = performance.now();
      click(row()!.querySelector("[data-confirm-remove]"));
      const removed = await until(
        () =>
          !useSession.getState().accounts.some((a) => a.id === id) &&
          useSession.getState().active?.id === first!.id,
        15_000,
      );
      const ms = performance.now() - t0;
      const left = await traces(id);
      check(
        "account-remove",
        removed && left.files.length === 0 && !left.secret,
        `before: ${present.files.length} files [${present.files.map((f) => f.replace(id, "<id>")).join(", ")}], keychain ${present.secret}; removed in ${round(ms)} ms; after: ${left.files.length} files, keychain ${left.secret}, ${left.images} cached images; the original account is active again ${useSession.getState().active?.id === first!.id}`,
      );
      state.testAccount = null;
      await setSetting(app, STATE_KEY, JSON.stringify(state));
    });
  }
}
