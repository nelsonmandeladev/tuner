import { Alert02Icon, CheckmarkCircle02Icon, CircleIcon } from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import { SYNC_STEPS, type AccountInfo, type SyncStep } from "@tuner/core";
import { useNavigate } from "react-router";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { syncActive, useSession, type StepStatus } from "../../data/session";
import { syncErrorMessage } from "./messages";

const STEP_LABEL: Record<SyncStep, string> = {
  categories: "Categories",
  live: "Live TV",
  vod: "Movies",
  series: "Series",
};

const ITEM_NAME: Record<SyncStep, [string, string]> = {
  categories: ["category", "categories"],
  live: ["channel", "channels"],
  vod: ["movie", "movies"],
  series: ["series", "series"],
};

const number = new Intl.NumberFormat();
const date = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "long", year: "numeric" });

/** First sync after Connect (SPEC §1): what the provider said, then each list as it loads. */
export function SyncProgress() {
  const navigate = useNavigate();
  const sync = useSession((s) => s.sync);
  const account = useSession((s) => s.active);
  const steps = SYNC_STEPS.map((step) => ({ step, ...sync.steps[step] }));
  const done = steps.filter((s) => s.status === "done").length;
  const liveReady = sync.steps.live.status === "done";
  const finished = done === steps.length;
  const startWatching = () => void navigate("/", { replace: true });

  return (
    <div className="flex w-full max-w-110 flex-col gap-7" aria-live="polite">
      <div className="flex flex-col gap-2">
        <h2 className="text-title">
          {finished ? "You're all set" : `Loading ${account?.name ?? "your subscription"}`}
        </h2>
        {sync.info && <AccountSummary info={sync.info} />}
      </div>

      <div
        className="h-1 overflow-hidden rounded-full bg-track"
        role="progressbar"
        aria-label="Sync progress"
        aria-valuemin={0}
        aria-valuemax={steps.length}
        aria-valuenow={done}
      >
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-(--duration-in) ease-panel"
          style={{ width: `${(done / steps.length) * 100}%` }}
        />
      </div>

      <ol className="flex flex-col gap-1">
        {steps.map(({ step, status, count }) => (
          <li key={step} className="flex h-12 items-center gap-3 rounded-field px-3 odd:bg-surface">
            <StepIcon status={status} />
            <span className="flex-1 text-small font-medium">{STEP_LABEL[step]}</span>
            <span className="font-mono text-mono text-text-dim">
              {stepDetail(step, status, count)}
            </span>
          </li>
        ))}
      </ol>

      {sync.error && (
        <p
          role="alert"
          className="rounded-field border border-line-strong bg-surface px-4 py-3 text-small text-text-2"
        >
          {syncErrorMessage(sync.error)}
        </p>
      )}

      <div className="flex flex-col gap-3">
        {sync.error && (
          <Button size="lg" onClick={() => void syncActive()}>
            Try again
          </Button>
        )}
        {!sync.error && (
          <Button size="lg" disabled={!liveReady} busy={!liveReady} onClick={startWatching}>
            {liveReady ? "Start watching" : "Loading your channels…"}
          </Button>
        )}
        {sync.error && liveReady && (
          <Button size="lg" variant="ghost" onClick={startWatching}>
            Continue with what loaded
          </Button>
        )}
        {liveReady && !finished && !sync.error && (
          <p className="text-caption text-text-faint">
            Movies and series keep loading while you watch.
          </p>
        )}
      </div>
    </div>
  );
}

function AccountSummary({ info }: { info: AccountInfo }) {
  const parts = [
    info.status ?? "Active",
    info.expiresAt ? `expires ${date.format(info.expiresAt)}` : "no expiry date",
    info.maxConnections !== null
      ? `${info.maxConnections} ${info.maxConnections === 1 ? "connection" : "connections"}`
      : null,
  ].filter(Boolean);
  const busy =
    info.maxConnections !== null &&
    info.activeConnections !== null &&
    info.activeConnections >= info.maxConnections;
  return (
    <div className="flex flex-col gap-1">
      <p className="text-body text-text-muted">{parts.join(" · ")}</p>
      {busy && (
        <p className="text-caption text-text-faint">
          Another device is using{" "}
          {info.maxConnections === 1 ? "your only connection" : "all your connections"} right now.
          Playback can fail until it stops.
        </p>
      )}
    </div>
  );
}

const STATUS_ICON: Record<StepStatus, IconSvgElement> = {
  waiting: CircleIcon,
  fetching: CircleIcon,
  saving: CircleIcon,
  done: CheckmarkCircle02Icon,
  failed: Alert02Icon,
};

/** No spinners outside buttons (DESIGN.md "States"): a step at work pulses softly instead. */
function StepIcon({ status }: { status: StepStatus }) {
  const working = status === "fetching" || status === "saving";
  const tone =
    status === "done" || working
      ? "text-accent-ink"
      : status === "failed"
        ? "text-text-2"
        : "text-text-dim";
  return (
    <span className={`${tone} ${working ? "animate-pulse motion-reduce:animate-none" : ""}`}>
      <Icon icon={STATUS_ICON[status]} size={18} />
    </span>
  );
}

function stepDetail(step: SyncStep, status: StepStatus, count: number | null): string {
  const [one, many] = ITEM_NAME[step];
  switch (status) {
    case "waiting":
      return "Waiting";
    case "fetching":
      return "Downloading…";
    case "saving":
      return count === null ? "Saving…" : `Saving ${number.format(count)}…`;
    case "done":
      return `${number.format(count ?? 0)} ${count === 1 ? one : many}`;
    case "failed":
      return "Not loaded";
  }
}
