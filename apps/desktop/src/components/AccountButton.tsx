import { PlusSignIcon } from "@hugeicons/core-free-icons";
import { useNavigate } from "react-router";
import { useSession } from "../data/session";
import { Icon } from "./Icon";

const count = new Intl.NumberFormat();

/**
 * The active account at the bottom of the sidebar (avatar letter on dark
 * amber, DESIGN.md "Sidebar"). Switching between accounts arrives in M6.
 */
export function AccountButton() {
  const navigate = useNavigate();
  const active = useSession((s) => s.active);
  const counts = useSession((s) => s.counts);
  const syncing = useSession((s) => s.sync.running);

  if (!active) {
    return (
      <button
        type="button"
        onClick={() => void navigate("/connect")}
        className="flex items-center gap-3 rounded-full border border-line bg-surface px-3 py-2.5 text-left text-text transition-colors duration-(--duration-hover) ease-out hover:border-line-strong"
      >
        <span className="flex size-8 flex-none items-center justify-center rounded-full bg-avatar text-accent">
          <Icon icon={PlusSignIcon} size={16} />
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-small font-semibold">No subscription</span>
          <span className="font-sans text-mono text-text-muted">Xtream · Not connected</span>
        </span>
      </button>
    );
  }

  const detail = syncing
    ? "Updating lists…"
    : counts
      ? `${count.format(counts.live)} channels`
      : (active.status ?? "Xtream");
  return (
    <button
      type="button"
      className="flex items-center gap-3 rounded-full border border-line bg-surface px-3 py-2.5 text-left text-text transition-colors duration-(--duration-hover) ease-out hover:border-line-strong"
    >
      <span className="flex size-8 flex-none items-center justify-center rounded-full bg-avatar font-display text-small text-accent">
        {active.name.trim().charAt(0).toUpperCase() || "?"}
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-small font-semibold">{active.name}</span>
        <span className="truncate font-sans text-mono text-text-muted">Xtream · {detail}</span>
      </span>
    </button>
  );
}
