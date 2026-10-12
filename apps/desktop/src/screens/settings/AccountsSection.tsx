import { PlusSignIcon } from "@hugeicons/core-free-icons";
import type { Account } from "@tuner/core";
import { useState } from "react";
import { useNavigate } from "react-router";
import { formatAgo } from "../../app/format";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { chooseAccount, deleteAccount } from "../../data/accounts";
import { refreshNow, useSession } from "../../data/session";
import { syncErrorMessage } from "../connect/messages";
import { EditAccountSheet } from "./EditAccountSheet";
import { Note, Section } from "./parts";

const date = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "long", year: "numeric" });

/**
 * Settings → Accounts (SPEC §9): every subscription on this computer, the
 * one in use first marked "In use". Refresh the one in use, switch to
 * another, edit or remove any, or add one through Connect.
 */
export function AccountsSection() {
  const navigate = useNavigate();
  const accounts = useSession((s) => s.accounts);
  const activeId = useSession((s) => s.active?.id);
  const [editing, setEditing] = useState<Account | null>(null);
  const ordered = [
    ...accounts.filter((a) => a.id === activeId),
    ...accounts.filter((a) => a.id !== activeId),
  ];

  return (
    <Section id="accounts" title="Accounts">
      {ordered.map((account) => (
        <AccountRow
          key={account.id}
          account={account}
          active={account.id === activeId}
          onEdit={() => setEditing(account)}
        />
      ))}
      <div className="px-6 py-4">
        <button
          type="button"
          onClick={() => void navigate("/connect?add=1")}
          className="flex h-10 items-center gap-3 rounded-full pr-4.5 pl-1 text-small font-semibold text-text-2 transition-colors duration-(--duration-hover) ease-out hover:text-text"
          data-add-account
        >
          <span className="flex size-8 items-center justify-center rounded-full border border-dashed border-line-strong text-accent-ink">
            <Icon icon={PlusSignIcon} size={16} />
          </span>
          Add a subscription
        </button>
      </div>
      <EditAccountSheet account={editing} onClose={() => setEditing(null)} />
    </Section>
  );
}

function AccountRow({
  account,
  active,
  onEdit,
}: {
  account: Account;
  active: boolean;
  onEdit: () => void;
}) {
  const sync = useSession((s) => s.sync);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState<"switch" | "remove" | null>(null);
  const [failed, setFailed] = useState(false);
  const syncing = active && sync.running;

  const facts = [
    account.status ?? "Active",
    account.expiresAt ? `expires ${date.format(account.expiresAt)}` : "no expiry date",
    account.maxConnections !== null
      ? `${account.maxConnections} ${account.maxConnections === 1 ? "connection" : "connections"}`
      : null,
    syncing
      ? "updating lists…"
      : account.lastSyncAt
        ? `lists updated ${formatAgo(account.lastSyncAt)}`
        : "lists not loaded yet",
  ].filter(Boolean);

  const remove = async () => {
    setBusy("remove");
    setFailed(false);
    try {
      await deleteAccount(account.id);
    } catch {
      setFailed(true);
      setBusy(null);
    }
  };
  const use = async () => {
    setBusy("switch");
    try {
      await chooseAccount(account.id);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-4 px-6 py-4.5" data-account-row={account.id}>
      <div className="flex items-center gap-4">
        <span className="flex size-10 flex-none items-center justify-center rounded-full bg-avatar font-display text-body text-accent-ink">
          {account.name.trim().charAt(0).toUpperCase() || "?"}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex items-center gap-2.5">
            <span className="truncate text-small font-semibold text-text">{account.name}</span>
            {active && (
              <span className="rounded-full border border-line-outline px-2 text-badge text-text-2">
                In use
              </span>
            )}
          </span>
          <span className="truncate font-mono text-mono text-text-dim">
            {new URL(account.server).host}
          </span>
          <span className="text-caption text-text-muted">{facts.join(" · ")}</span>
        </div>
        {!confirming && (
          <div className="flex flex-none items-center gap-2">
            {active ? (
              <Button
                size="sm"
                variant="ghost"
                busy={syncing}
                onClick={() => void refreshNow()}
                data-refresh
              >
                {syncing ? "Updating…" : "Refresh now"}
              </Button>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                busy={busy === "switch"}
                onClick={() => void use()}
                data-switch
              >
                Switch to this
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={onEdit} data-edit>
              Edit
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(true)} data-remove>
              Remove
            </Button>
          </div>
        )}
      </div>
      {active && sync.error && !sync.running && <Note>{syncErrorMessage(sync.error)}</Note>}
      {confirming && (
        <div
          className="flex items-center justify-between gap-6 rounded-field border border-line-strong px-4 py-3"
          role="alertdialog"
          aria-label={`Remove ${account.name}`}
        >
          <p className="text-small text-text-2">
            Remove {account.name}? Its lists, favorites, history and saved password are deleted from
            this computer. Your subscription itself is not affected.
          </p>
          <div className="flex flex-none gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setConfirming(false)}
              disabled={busy === "remove"}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              busy={busy === "remove"}
              onClick={() => void remove()}
              data-confirm-remove
            >
              Remove
            </Button>
          </div>
        </div>
      )}
      {failed && <Note>Some of its files could not be deleted. Close the app and try again.</Note>}
    </div>
  );
}
