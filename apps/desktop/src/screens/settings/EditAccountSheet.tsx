import { Cancel01Icon, LockIcon } from "@hugeicons/core-free-icons";
import type { Account } from "@tuner/core";
import { useRef, useState, type FormEvent } from "react";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { IconButton } from "../../components/IconButton";
import { Sheet } from "../../components/Sheet";
import { TextField } from "../../components/TextField";
import { editAccount, syncActive, useSession, type EditError } from "../../data/session";
import { connectErrorMessage } from "../connect/messages";

/** Settings → Accounts → Edit: the account's name and login, in the right-hand sheet. */
export function EditAccountSheet({
  account,
  onClose,
}: {
  account: Account | null;
  onClose: () => void;
}) {
  return (
    <Sheet open={account !== null} onClose={onClose} label="Edit subscription">
      {account && <EditForm key={account.id} account={account} onClose={onClose} />}
    </Sheet>
  );
}

function errorMessage(error: EditError, status?: string | null): string {
  return error === "duplicate"
    ? "Another subscription on this computer already uses this server and username."
    : connectErrorMessage(error, status);
}

function EditForm({ account, onClose }: { account: Account; onClose: () => void }) {
  const [name, setName] = useState(account.name);
  const [server, setServer] = useState(account.server);
  const [username, setUsername] = useState(account.username);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ kind: EditError; status?: string | null } | null>(null);
  const abort = useRef<AbortController | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    abort.current = new AbortController();
    const loginChanged = server.trim() !== account.server || username.trim() !== account.username;
    const result = await editAccount(
      account.id,
      { name, server, username, password },
      abort.current.signal,
    );
    setBusy(false);
    if (!result.ok) {
      setError({ kind: result.error, status: result.status });
      return;
    }
    // Another server or login can mean other lists: load them now.
    if (loginChanged && useSession.getState().active?.id === account.id) void syncActive();
    onClose();
  }

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(e) => void submit(e)}
      noValidate
      data-edit-account
    >
      <div className="flex items-center justify-between gap-4 border-b border-line px-6 py-5">
        <h2 className="text-heading">Edit subscription</h2>
        <IconButton icon={Cancel01Icon} aria-label="Close" onClick={onClose} />
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-4.5 overflow-y-auto px-6 py-6">
        <TextField
          id="edit-name"
          label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={busy}
        />
        <TextField
          id="edit-server"
          label="Server URL"
          type="url"
          inputMode="url"
          mono
          value={server}
          onChange={(e) => setServer(e.target.value)}
          invalid={error?.kind === "invalid-server" || error?.kind === "unreachable"}
          disabled={busy}
        />
        <TextField
          id="edit-username"
          label="Username"
          autoComplete="off"
          spellCheck={false}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          invalid={error?.kind === "wrong-credentials" || error?.kind === "duplicate"}
          disabled={busy}
        />
        <TextField
          id="edit-password"
          label="Password"
          type="password"
          autoComplete="new-password"
          placeholder="Leave empty to keep the saved one"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          invalid={error?.kind === "wrong-credentials"}
          disabled={busy}
        />
        <p className="flex items-center gap-2 text-caption text-text-faint">
          <Icon icon={LockIcon} size={14} />A new server, username or password is checked with your
          provider before it is saved.
        </p>
        {error && (
          <p
            role="alert"
            className="rounded-field border border-line-strong bg-bg px-4 py-3 text-small text-text-2"
          >
            {errorMessage(error.kind, error.status)}
          </p>
        )}
      </div>
      <div className="flex gap-3 border-t border-line px-6 py-5">
        <Button type="submit" busy={busy}>
          {busy ? "Checking…" : "Save"}
        </Button>
        <Button variant="ghost" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
