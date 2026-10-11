import { EmptyState } from "../components/EmptyState";
import { Screen } from "../components/Screen";
import { useSession } from "../data/session";

const count = new Intl.NumberFormat();

/**
 * Home is built in M5 (hero, favorite channels, continue watching). Until then
 * it shows what the cached library holds, straight from the local database.
 */
export function Home() {
  const counts = useSession((s) => s.counts);
  const syncState = useSession((s) => s.syncState);
  const lastSync = Math.max(0, ...syncState.map((s) => s.syncedAt));
  const stats = counts
    ? [
        ["Channels", counts.live],
        ["Movies", counts.vod],
        ["Series", counts.series],
      ]
    : [];

  return (
    <Screen title="Home">
      {counts && counts.live + counts.vod + counts.series > 0 ? (
        <section className="flex flex-col gap-4" aria-label="Your library">
          <h2 className="text-eyebrow text-text-dim uppercase">Your library</h2>
          <div className="grid max-w-180 grid-cols-3 gap-3.5">
            {stats.map(([label, value]) => (
              <div
                key={label}
                className="flex flex-col gap-1 rounded-card border border-line bg-surface p-5"
              >
                <span className="font-mono text-title text-text">
                  {count.format(Number(value))}
                </span>
                <span className="text-small text-text-muted">{label}</span>
              </div>
            ))}
          </div>
          {lastSync > 0 && (
            <p className="text-caption text-text-dim">
              Updated{" "}
              {new Date(lastSync).toLocaleString(undefined, {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </p>
          )}
        </section>
      ) : (
        <EmptyState message="Your channels, movies and series show up here after the first sync." />
      )}
    </Screen>
  );
}
