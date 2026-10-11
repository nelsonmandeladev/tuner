import { Navigate, Outlet } from "react-router";
import { Button } from "../components/Button";
import { boot, useSession } from "../data/session";

/**
 * Screens of the app shell need an account. While booting it paints the app
 * background (the window is transparent: an empty frame would show the
 * desktop); with no account it goes to Connect.
 */
export function RequireAccount() {
  const phase = useSession((s) => s.phase);
  const bootError = useSession((s) => s.bootError);

  if (phase === "booting") return <div className="h-full bg-bg" />;
  if (phase === "no-account") return <Navigate to="/connect" replace />;
  if (phase === "boot-error") {
    return (
      <div className="flex h-full flex-col items-start justify-center gap-4 bg-bg px-16 text-text">
        <h1 className="text-title">Your library could not be opened</h1>
        <p className="max-w-140 text-body text-text-muted">
          The local database did not open. Restart the app; if it keeps happening, the cache may be
          damaged.
        </p>
        {import.meta.env.DEV && bootError && (
          <p className="font-mono text-mono text-text-dim">{bootError}</p>
        )}
        <Button onClick={() => void boot()}>Try again</Button>
      </div>
    );
  }
  return <Outlet />;
}
