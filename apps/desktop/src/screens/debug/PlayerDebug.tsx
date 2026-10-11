/**
 * M1 playback spike: `/debug/player`, dev builds only, not in the sidebar
 * (Ctrl+Shift+D opens it). Plays streams from the dev account in `.env.local`
 * through Rust, and measures first frame and zap times.
 *
 * Two layouts share one mpv instance and one `VideoSurface` element: "Preview"
 * puts the video in a pane like the Live TV preview, "Full" fills the window.
 * The Loads counter (mpv `start-file` events) shows that switching between
 * them, resizing or going full screen never reloads the stream.
 */

import { getCurrentWindow } from "@tauri-apps/api/window";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  open,
  seekBy,
  setPlayerTrace,
  simulateDrop,
  startPlayer,
  stop,
  toggleMute,
  togglePause,
} from "../../player/controller";
import { usePlayer } from "../../player/store";
import { VideoSurface } from "../../player/VideoSurface";
import { devAutorunPlan } from "./autorun";
import { measureFirstFrame, measureZap, summarize } from "./benchmark";
import { DebugOverlay } from "./DebugOverlay";
import { parsePlan, runM1Suite } from "./m1Suite";
import {
  debugSource,
  debugTrace,
  testPattern,
  type DebugKind,
  type DebugPick,
} from "./debugSource";

type Layout = "preview" | "full";

/** The suite runs once per app start, even across StrictMode remounts. */
let suiteStarted = false;

export default function PlayerDebug() {
  const [pick, setPick] = useState<DebugPick>({ kind: "live", id: 0, ext: "ts" });
  const [layout, setLayout] = useState<Layout>("preview");
  const [fullScreen, setFullScreen] = useState(false);
  const [runs, setRuns] = useState(5);
  const [busy, setBusy] = useState<string | null>(null);
  const [initError, setInitError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const source = useMemo(() => debugSource(pick), [pick]);
  const full = layout === "full";

  useEffect(() => {
    setPlayerTrace(debugTrace);
    startPlayer().catch((e: unknown) => setInitError(String(e)));
    return () => {
      abort.current?.abort();
      setPlayerTrace(null);
      // Leave nothing open on the account when the screen goes away.
      void stop();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void devAutorunPlan().then((value) => {
      if (cancelled || !value || suiteStarted) return;
      const plan = parsePlan(value);
      if (!plan) {
        debugTrace(
          "TUNER_M1_SUITE is set but not a valid plan (live=…,hevc=…,ac3=id.ext,eac3=id.ext)",
        );
        return;
      }
      suiteStarted = true;
      setBusy("suite");
      void runM1Suite(plan, { setLayout }, debugTrace).finally(() => setBusy(null));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleFullScreen = useCallback(async () => {
    const next = !(await getCurrentWindow().isFullscreen());
    await getCurrentWindow().setFullscreen(next);
    setFullScreen(next);
    setLayout(next ? "full" : "preview");
  }, []);

  const play = useCallback((next: DebugPick) => {
    setPick(next);
    if (next.id > 0) void open(debugSource(next));
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement)
        return;
      const actions: Record<string, () => void> = {
        " ": () => void togglePause(),
        f: () => void toggleFullScreen(),
        m: () => void toggleMute(),
        ArrowLeft: () => void seekBy(-10),
        ArrowRight: () => void seekBy(10),
        ArrowUp: () => play({ ...pick, id: pick.id - 1 }),
        ArrowDown: () => play({ ...pick, id: pick.id + 1 }),
        Escape: () => {
          if (fullScreen) void toggleFullScreen();
          else setLayout("preview");
        },
      };
      const action = actions[event.key];
      if (!action) return;
      event.preventDefault();
      action();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [pick, fullScreen, play, toggleFullScreen]);

  async function run(name: string, task: (signal: AbortSignal) => Promise<void>) {
    abort.current = new AbortController();
    setBusy(name);
    try {
      await task(abort.current.signal);
    } catch (e) {
      debugTrace(`benchmark stopped: ${String(e)}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    // No background anywhere on the path to the video: mpv shows through here.
    <div className="flex h-full text-text">
      {!full && (
        <aside className="flex w-100 shrink-0 flex-col gap-6 overflow-x-hidden overflow-y-auto border-r border-line bg-bg-sidebar p-6">
          <header>
            <p className="text-eyebrow text-accent uppercase">Dev build only</p>
            <h1 className="mt-1 text-title">Player debug</h1>
          </header>

          {initError && <p className="text-small text-live">mpv failed to start: {initError}</p>}

          <Section title="Source">
            <div className="grid grid-cols-3 gap-2">
              <Field label="Kind">
                <select
                  value={pick.kind}
                  onChange={(e) => setPick({ ...pick, kind: e.target.value as DebugKind })}
                  className={inputClass}
                >
                  <option value="live">Live</option>
                  <option value="movie">Movie</option>
                  <option value="series">Episode</option>
                </select>
              </Field>
              <Field label="Stream id">
                <input
                  inputMode="numeric"
                  value={pick.id || ""}
                  onChange={(e) => setPick({ ...pick, id: Number(e.target.value) || 0 })}
                  className={`${inputClass} font-mono`}
                />
              </Field>
              <Field label="Ext">
                <input
                  value={pick.ext}
                  onChange={(e) => setPick({ ...pick, ext: e.target.value.trim() })}
                  className={`${inputClass} font-mono`}
                />
              </Field>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button primary onClick={() => play(pick)} disabled={pick.id <= 0}>
                Load
              </Button>
              <Button onClick={() => play({ ...pick, id: pick.id - 1 })}>Id −1 (↑)</Button>
              <Button onClick={() => play({ ...pick, id: pick.id + 1 })}>Id +1 (↓)</Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void open(testPattern)}>Test pattern (offline)</Button>
            </div>
          </Section>

          <Section title="Layout">
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setLayout(full ? "preview" : "full")}>
                {full ? "Preview pane" : "Fill window"}
              </Button>
              <Button onClick={() => void toggleFullScreen()}>Full screen (F)</Button>
              <Button onClick={simulateDrop}>Simulate drop</Button>
            </div>
          </Section>

          <Section title="Measure">
            <div className="flex items-end gap-2">
              <Field label="Runs">
                <input
                  inputMode="numeric"
                  value={runs}
                  onChange={(e) => setRuns(Math.max(1, Number(e.target.value) || 1))}
                  className={`${inputClass} w-16 font-mono`}
                />
              </Field>
              <Button
                disabled={!!busy || pick.id <= 0}
                onClick={() => void run("first", (s) => measureFirstFrame(source, runs, s))}
              >
                First frame
              </Button>
              <Button
                disabled={!!busy || pick.id <= 0}
                onClick={() =>
                  void run("zap", (s) =>
                    measureZap(
                      Array.from({ length: runs + 1 }, (_, i) =>
                        debugSource({ ...pick, id: pick.id + i }),
                      ),
                      s,
                    ),
                  )
                }
              >
                Zap id…id+{runs}
              </Button>
              {busy && <Button onClick={() => abort.current?.abort()}>Cancel</Button>}
            </div>
            <Timings />
          </Section>

          <State />
        </aside>
      )}

      <main className="flex min-w-0 flex-1 flex-col">
        {!full && (
          <div className="border-b border-line bg-bg px-8 py-5">
            <p className="text-eyebrow text-text-dim uppercase">Preview</p>
            <p className="mt-1 text-small text-text-muted">
              The same mpv instance as full screen. Loads should not change when you switch.
            </p>
          </div>
        )}
        <div
          className={
            full
              ? "relative flex flex-1 overflow-hidden"
              : "relative flex flex-1 items-start overflow-hidden p-8"
          }
        >
          <div className={full ? "relative h-full w-full" : "relative aspect-video w-full"}>
            {/* The opaque surround is the surface's own spread shadow, so the hole can have rounded corners. */}
            <VideoSurface
              className={
                full
                  ? "absolute inset-0"
                  : "absolute inset-0 rounded-card shadow-[0_0_0_100vmax_var(--bg)]"
              }
            />
            <DebugOverlay
              fullScreen={fullScreen}
              onToggleFullScreen={() => void toggleFullScreen()}
            />
          </div>
        </div>
      </main>
    </div>
  );
}

function Timings() {
  const timings = usePlayer((s) => s.timings);
  const first = summarize(timings, "first");
  const zap = summarize(timings, "zap");
  return (
    <div className="flex flex-col gap-2 font-mono text-mono text-text-2">
      <p>
        first frame{" "}
        {first ? `median ${first.median} ms · worst ${first.worst} ms · n=${first.runs}` : "–"}
      </p>
      <p>zap {zap ? `median ${zap.median} ms · worst ${zap.worst} ms · n=${zap.runs}` : "–"}</p>
      <ol className="flex flex-col gap-0.5 text-text-dim">
        {timings
          .slice(-12)
          .reverse()
          .map((t, i) => (
            <li key={timings.length - i}>
              {t.kind.padEnd(5)} {String(t.totalMs).padStart(5)} ms · open {t.openedMs ?? "–"} ·
              video {t.videoMs ?? "–"} · {t.label}
            </li>
          ))}
      </ol>
    </div>
  );
}

function State() {
  const p = usePlayer();
  const rows: [string, ReactNode][] = [
    ["status", p.status],
    ["paused", String(p.paused)],
    ["buffering", String(p.buffering)],
    ["loads", p.loads],
    ["reconnect", p.reconnectAttempt],
    ["hwdec", p.hwdec ?? "–"],
    ["volume", `${Math.round(p.volume)}${p.mute ? " (muted)" : ""}`],
    ["error", p.error ?? "–"],
  ];
  return (
    <Section title="State">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 font-mono text-mono">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-text-dim">{k}</dt>
            <dd className="text-text-2">{v}</dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}

const inputClass =
  "h-10 w-full rounded-control border border-line-strong bg-surface px-3 text-small text-text";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-eyebrow text-text-dim uppercase">{title}</h2>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-caption font-semibold text-text-2">
      {label}
      {children}
    </label>
  );
}

function Button(props: {
  children: ReactNode;
  onClick: () => void;
  primary?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={props.onClick}
      disabled={props.disabled}
      className={`h-10 rounded-control px-3 text-small font-semibold whitespace-nowrap transition-colors duration-(--duration-hover) disabled:opacity-40 ${
        props.primary
          ? "bg-accent text-on-accent"
          : "bg-surface-raised text-text hover:bg-surface-active"
      }`}
    >
      {props.children}
    </button>
  );
}
