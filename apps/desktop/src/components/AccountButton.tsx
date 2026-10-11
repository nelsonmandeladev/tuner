import { PlusSignIcon } from "@hugeicons/core-free-icons";
import { Icon } from "./Icon";

/**
 * Account switcher at the bottom of the sidebar. Accounts arrive in M2; until
 * then it shows the "no subscription" state.
 */
export function AccountButton() {
  return (
    <button
      type="button"
      className="flex items-center gap-3 rounded-button border border-line bg-surface px-3 py-2.5 text-left text-text transition-colors duration-(--duration-hover) ease-out hover:border-line-strong"
    >
      <span className="flex size-8 flex-none items-center justify-center rounded-control bg-avatar text-accent">
        <Icon icon={PlusSignIcon} size={16} />
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-small font-semibold">No subscription</span>
        <span className="font-sans text-mono text-text-muted">Xtream · Not connected</span>
      </span>
    </button>
  );
}
