import { LockIcon } from "@hugeicons/core-free-icons";
import { useRef, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { APP_NAME } from "../app/brand";
import { Button } from "../components/Button";
import { Icon } from "../components/Icon";
import { Logo } from "../components/Logo";
import { TextField } from "../components/TextField";
import { leaveActiveAccount } from "../data/accounts";
import { connect, syncActive, useSession, type ConnectError } from "../data/session";
import { connectErrorMessage } from "./connect/messages";
import { SyncProgress } from "./connect/SyncProgress";

/**
 * Connect your subscription (SPEC §1, design/screens/Connect.dc.html): an art
 * panel and the Xtream login. After a valid login the right side shows the
 * first sync. With `?add=1` (Settings, the sidebar switcher) it adds another
 * subscription and can be cancelled.
 */
export function Connect() {
  const [stage, setStage] = useState<"form" | "sync">("form");
  return (
    <div className="flex h-full flex-wrap overflow-y-auto bg-bg text-text">
      <ArtPanel />
      <section className="flex min-w-0 flex-[1_1_480px] items-center justify-center px-8 py-12">
        {stage === "form" ? (
          <ConnectForm
            onConnected={() => {
              setStage("sync");
              void syncActive();
            }}
          />
        ) : (
          <SyncProgress />
        )}
      </section>
    </div>
  );
}

function ArtPanel() {
  return (
    <section className="relative flex min-w-0 flex-[1_1_480px] flex-col justify-between gap-12 overflow-hidden bg-art-panel px-16 py-12">
      <div
        aria-hidden
        className="absolute -right-80 -bottom-75 size-190 rounded-full bg-art-shape-1"
      />
      <div
        aria-hidden
        className="absolute -right-20 -bottom-30 size-105 rounded-full bg-art-shape-2"
      />
      <div aria-hidden className="absolute right-52.5 bottom-75 size-30 rounded-full bg-accent" />
      <div className="relative -mx-2.5">
        <Logo />
      </div>
      <div className="relative flex max-w-130 flex-col gap-5">
        <h1 className="font-display text-display-l text-balance">
          Your subscription. A player that keeps up.
        </h1>
        <p className="max-w-110 text-body-l text-text-soft">
          Sign in once with the details your provider gave you. Live TV, movies and series load in
          seconds after that.
        </p>
      </div>
      <p className="relative max-w-105 text-caption text-text-faint">
        {APP_NAME} includes no channels. It plays the subscription you already have.
      </p>
    </section>
  );
}

function ConnectForm({ onConnected }: { onConnected: () => void }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const hasAccount = useSession((s) => s.accounts.length > 0);
  const adding = hasAccount && params.get("add") === "1";
  const [server, setServer] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ kind: ConnectError; status?: string | null } | null>(null);
  const abort = useRef<AbortController | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    abort.current = new AbortController();
    // The new subscription becomes the one in use: leave the current one cleanly first.
    if (useSession.getState().active) await leaveActiveAccount();
    const result = await connect({ server, username, password, name }, abort.current.signal);
    setBusy(false);
    if (result.ok) onConnected();
    else setError({ kind: result.error, status: result.status });
  }

  const fieldError = (kinds: ConnectError[]) => error !== null && kinds.includes(error.kind);

  return (
    <form
      className="flex w-full max-w-110 flex-col gap-7"
      onSubmit={(e) => void submit(e)}
      noValidate
    >
      <div className="flex flex-col gap-2">
        <h2 className="text-title">
          {adding ? "Add a subscription" : "Connect your subscription"}
        </h2>
        <p className="text-body text-text-muted">Use your Xtream Codes login.</p>
      </div>

      <div className="flex gap-1 rounded-full border border-line bg-surface p-1" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected
          className="h-10 flex-1 rounded-full bg-surface-raised text-small font-semibold text-text"
        >
          Xtream Codes
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={false}
          disabled
          className="h-10 flex-1 rounded-full text-small text-text-dim"
        >
          M3U playlist · later
        </button>
      </div>

      <div className="flex flex-col gap-4.5">
        <TextField
          id="server"
          label="Server URL"
          type="url"
          inputMode="url"
          autoComplete="url"
          placeholder="http://host:8080"
          mono
          value={server}
          onChange={(e) => setServer(e.target.value)}
          invalid={fieldError(["invalid-server", "unreachable", "bad-response"])}
          disabled={busy}
          autoFocus
          required
        />
        <div className="grid grid-cols-2 gap-3">
          <TextField
            id="username"
            label="Username"
            autoComplete="username"
            spellCheck={false}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            invalid={
              fieldError(["missing-fields", "wrong-credentials"]) &&
              (!username || error?.kind === "wrong-credentials")
            }
            disabled={busy}
            required
          />
          <TextField
            id="password"
            label="Password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            invalid={
              fieldError(["missing-fields", "wrong-credentials"]) &&
              (!password || error?.kind === "wrong-credentials")
            }
            disabled={busy}
            required
          />
        </div>
        <TextField
          id="nickname"
          label={
            <>
              Name this subscription <span className="font-normal text-text-faint">(optional)</span>
            </>
          }
          placeholder="Main subscription"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={busy}
        />
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-field border border-line-strong bg-surface px-4 py-3 text-small text-text-2"
        >
          {connectErrorMessage(error.kind, error.status)}
        </p>
      )}

      <div className="flex flex-col gap-3.5">
        <Button type="submit" size="lg" busy={busy}>
          {busy ? "Connecting…" : "Connect"}
        </Button>
        {adding && (
          <Button size="lg" variant="ghost" disabled={busy} onClick={() => void navigate(-1)}>
            Cancel
          </Button>
        )}
        <p className="flex items-center gap-2 text-caption text-text-faint">
          <Icon icon={LockIcon} size={14} />
          Your password stays in this computer’s keychain.
        </p>
      </div>
    </form>
  );
}
