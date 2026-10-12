import { describe, expect, it } from "vitest";
import {
  insertAccount,
  listAccounts,
  setSetting,
  updateAccountDetails,
  type Account,
} from "../../src/storage/accounts";
import type { ListSyncState } from "../../src/storage/library";
import {
  readHiddenCategories,
  setCategoryHidden,
  setFavorite,
  writeEpgCache,
} from "../../src/storage/live";
import {
  clearDetailCaches,
  clearHistory,
  countDetailCaches,
  libraryIsStale,
  oldestSync,
} from "../../src/storage/maintenance";
import { migrate } from "../../src/storage/migrate";
import { accountMigrations, appMigrations } from "../../src/storage/migrations";
import { recordHistory, readResume, writeDetail, writeResume } from "../../src/storage/vod";
import { memoryDb } from "../sqlite";

const HOUR = 3_600_000;
const synced = (at: number): ListSyncState[] =>
  (["categories", "live", "vod", "series"] as const).map((list) => ({
    list,
    syncedAt: at,
    count: 1,
    skipped: 0,
  }));

describe("libraryIsStale", () => {
  const now = 100 * HOUR;

  it("is stale when a list never synced", () => {
    expect(libraryIsStale([], 12, now)).toBe(true);
    expect(libraryIsStale(synced(now).slice(0, 3), 12, now)).toBe(true);
    expect(oldestSync(synced(now).slice(0, 3))).toBeNull();
  });

  it("compares the oldest list with the interval", () => {
    expect(libraryIsStale(synced(now - 11 * HOUR), 12, now)).toBe(false);
    expect(libraryIsStale(synced(now - 12 * HOUR), 12, now)).toBe(true);
    const mixed = synced(now);
    mixed[2] = { ...mixed[2]!, syncedAt: now - 30 * HOUR };
    expect(libraryIsStale(mixed, 24, now)).toBe(true);
    expect(oldestSync(mixed)).toBe(now - 30 * HOUR);
  });

  it("never asks for a refresh when set to manual", () => {
    expect(libraryIsStale([], 0, now)).toBe(false);
    expect(libraryIsStale(synced(0), 0, now)).toBe(false);
  });
});

describe("clearing", () => {
  async function library() {
    const db = memoryDb();
    await migrate(db, accountMigrations);
    await recordHistory(db, "live", 1, 10);
    await recordHistory(db, "vod", 2, 11);
    await writeResume(db, "vod", 2, {
      positionSecs: 600,
      durationSecs: 6000,
      watched: false,
      updatedAt: 11,
    });
    await setFavorite(db, "live", 1, true, 12);
    await setCategoryHidden(db, "live", "c1", true);
    await setSetting(db, "series.autoplayNext", "false");
    await writeDetail(db, "vod", 2, { plot: "…" }, 13);
    await writeEpgCache(db, 1, [], 14);
    return db;
  }

  it("history only drops history", async () => {
    const db = await library();
    await clearHistory(db);
    const count = async (table: string) =>
      (await db.select<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`))[0]!.n;
    expect(await count("history")).toBe(0);
    expect(await count("favorites")).toBe(1);
    expect((await readResume(db, "vod")).get(2)?.positionSecs).toBe(600);
    expect(await readHiddenCategories(db)).toEqual(["live:c1"]);
    expect(await count("settings")).toBe(1);
  });

  it("caches drop details and guide data, nothing personal", async () => {
    const db = await library();
    expect(await countDetailCaches(db)).toBe(2);
    await clearDetailCaches(db);
    expect(await countDetailCaches(db)).toBe(0);
    const count = async (table: string) =>
      (await db.select<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`))[0]!.n;
    expect(await count("history")).toBe(2);
    expect(await count("favorites")).toBe(1);
    expect(await count("resume")).toBe(1);
  });
});

describe("updateAccountDetails", () => {
  it("changes name, server and username only", async () => {
    const db = memoryDb();
    await migrate(db, appMigrations);
    const account: Account = {
      id: "a1",
      name: "Main",
      server: "http://provider.example:8080",
      username: "alice",
      createdAt: 1,
      status: "Active",
      expiresAt: 9,
      maxConnections: 1,
      allowedFormats: ["ts"],
      timezone: "Europe/Paris",
      lastSyncAt: 5,
    };
    await insertAccount(db, account);
    await updateAccountDetails(db, "a1", {
      name: "Living room",
      server: "https://other.example",
      username: "bob",
    });
    expect(await listAccounts(db)).toEqual([
      {
        ...account,
        name: "Living room",
        server: "https://other.example",
        username: "bob",
      },
    ]);
  });
});
