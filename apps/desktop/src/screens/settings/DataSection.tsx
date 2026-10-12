import { oldestSync } from "@tuner/core";
import { useEffect, useState } from "react";
import { formatAgo, formatBytes } from "../../app/format";
import { Button } from "../../components/Button";
import { Select } from "../../components/Select";
import {
  clearCache,
  clearWatchHistory,
  readCacheSize,
  type CacheSize,
} from "../../data/maintenance";
import { useSession } from "../../data/session";
import { REFRESH_CHOICES, updateSettings, useSettings } from "../../data/settings";
import { Note, Row, Section } from "./parts";

const count = new Intl.NumberFormat();

const refreshOptions = REFRESH_CHOICES.map((hours) => ({
  value: String(hours),
  label: hours === 0 ? "Only when I ask" : `Every ${hours} hours`,
}));

/** Settings → Data (SPEC §9). */
export function DataSection() {
  const refreshHours = useSettings((s) => s.refreshHours);
  const syncState = useSession((s) => s.syncState);
  const accountId = useSession((s) => s.active?.id);
  const [size, setSize] = useState<CacheSize | null>(null);
  const [cleared, setCleared] = useState<"cache" | "history" | null>(null);
  const [busy, setBusy] = useState<"cache" | "history" | null>(null);
  const [confirmHistory, setConfirmHistory] = useState(false);
  const oldest = oldestSync(syncState);

  useEffect(() => {
    let current = true;
    void readCacheSize()
      .then((s) => current && setSize(s))
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [accountId, cleared]);

  const run = async (what: "cache" | "history") => {
    setBusy(what);
    try {
      await (what === "cache" ? clearCache() : clearWatchHistory());
      setCleared(what);
    } finally {
      setBusy(null);
      setConfirmHistory(false);
    }
  };

  return (
    <Section id="data" title="Data">
      <Row
        label="Refresh lists"
        description={
          oldest
            ? `On launch, lists older than this download again in the background. Last updated ${formatAgo(oldest)}.`
            : "On launch, lists older than this download again in the background."
        }
        control={
          <Select
            label="Refresh lists"
            options={refreshOptions}
            value={String(refreshHours)}
            onChange={(v) => void updateSettings({ refreshHours: Number(v) })}
          />
        }
      />
      <Row
        label="Cache"
        description={
          size
            ? `${formatBytes(size.imageBytes)} of artwork, ${count.format(size.entries)} saved pages and guide entries. They download again when needed.`
            : "Artwork, movie and series pages and guide data saved on this computer."
        }
        control={
          <Button
            size="sm"
            variant="ghost"
            busy={busy === "cache"}
            onClick={() => void run("cache")}
            data-clear-cache
          >
            Clear cache
          </Button>
        }
      >
        {cleared === "cache" && <Note>Cache cleared.</Note>}
      </Row>
      <Row
        label="Watch history"
        description="Recently watched channels and the order of Continue watching, for the subscription in use. Favorites and resume points stay."
        control={
          !confirmHistory && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setConfirmHistory(true)}
              data-clear-history
            >
              Clear history
            </Button>
          )
        }
      >
        {confirmHistory && (
          <div
            role="alertdialog"
            aria-label="Clear watch history"
            className="flex items-center justify-between gap-6 rounded-field border border-line-strong px-4 py-3"
          >
            <p className="text-small text-text-2">
              Clear the watch history? This cannot be undone.
            </p>
            <div className="flex flex-none gap-2">
              <Button size="sm" variant="ghost" onClick={() => setConfirmHistory(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                busy={busy === "history"}
                onClick={() => void run("history")}
                data-confirm-history
              >
                Clear history
              </Button>
            </div>
          </div>
        )}
        {cleared === "history" && !confirmHistory && <Note>History cleared.</Note>}
      </Row>
    </Section>
  );
}
