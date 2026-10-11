import { describe, expect, it } from "vitest";
import {
  deleteAccountRow,
  getSetting,
  insertAccount,
  listAccounts,
  loadCredentials,
  markAccountSynced,
  secretKey,
  setSetting,
  updateAccountInfo,
  type Account,
} from "../../src/storage/accounts";
import { insertRows } from "../../src/storage/insert";
import {
  readCategories,
  readCounts,
  replaceCategories,
  replaceLive,
  replaceVod,
} from "../../src/storage/library";
import { migrate } from "../../src/storage/migrate";
import { accountMigrations, appMigrations, type Migration } from "../../src/storage/migrations";
import { memoryDb } from "../sqlite";

const account: Account = {
  id: "a1",
  name: "Main subscription",
  server: "http://provider.example:8080",
  username: "alice",
  createdAt: 1,
  status: "Active",
  expiresAt: null,
  maxConnections: 1,
  allowedFormats: ["ts"],
  timezone: "Europe/Paris",
  lastSyncAt: null,
};

describe("migrations", () => {
  it("create both schemas and record the version", async () => {
    for (const migrations of [appMigrations, accountMigrations]) {
      const db = memoryDb();
      const version = await migrate(db, migrations);
      expect(version).toBe(migrations.at(-1)!.version);
      const [row] = await db.select<{ user_version: number }>("PRAGMA user_version");
      expect(row!.user_version).toBe(version);
    }
  });

  it("are idempotent", async () => {
    const db = memoryDb();
    await migrate(db, accountMigrations);
    await expect(migrate(db, accountMigrations)).resolves.toBe(accountMigrations.at(-1)!.version);
  });

  it("leave the previous version intact when one fails", async () => {
    const db = memoryDb();
    const broken: Migration[] = [
      { version: 1, name: "ok", statements: ["CREATE TABLE a (x)"] },
      { version: 2, name: "broken", statements: ["CREATE TABLE b (x)", "NOT SQL"] },
    ];
    await expect(migrate(db, broken)).rejects.toThrow();
    const [row] = await db.select<{ user_version: number }>("PRAGMA user_version");
    expect(row!.user_version).toBe(1);
    const tables = await db.select<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table'",
    );
    expect(tables.map((t) => t.name)).toEqual(["a"]);
  });

  it("index lists by category and name", async () => {
    const db = memoryDb();
    await migrate(db, accountMigrations);
    const indexes = await db.select<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'index'",
    );
    const names = indexes.map((i) => i.name);
    expect(names).toContain("category_items_by_position");
    for (const table of ["live", "vod", "series"]) expect(names).toContain(`${table}_by_name`);
  });
});

describe("accounts", () => {
  it("store everything but the password", async () => {
    const db = memoryDb();
    await migrate(db, appMigrations);
    await insertAccount(db, account);
    await insertAccount(db, { ...account, id: "a2", name: "Second" });
    const accounts = await listAccounts(db);
    expect(accounts.map((a) => a.id)).toEqual(["a1", "a2"]);
    expect(accounts[0]).toEqual(account);
    const columns = await db.select<{ name: string }>("PRAGMA table_info(accounts)");
    expect(columns.map((c) => c.name).some((c) => /pass/i.test(c))).toBe(false);
  });

  it("update provider info and sync time, and delete", async () => {
    const db = memoryDb();
    await migrate(db, appMigrations);
    await insertAccount(db, account);
    await updateAccountInfo(db, "a1", {
      auth: true,
      status: "Expired",
      expiresAt: 5,
      isTrial: false,
      activeConnections: 0,
      maxConnections: 2,
      createdAt: null,
      message: null,
      allowedFormats: ["m3u8"],
      timezone: "UTC",
      serverTime: null,
    });
    await markAccountSynced(db, "a1", 42);
    expect((await listAccounts(db))[0]).toMatchObject({
      status: "Expired",
      expiresAt: 5,
      maxConnections: 2,
      allowedFormats: ["m3u8"],
      lastSyncAt: 42,
    });
    await deleteAccountRow(db, "a1");
    expect(await listAccounts(db)).toEqual([]);
  });

  it("read the password from the secret store only", async () => {
    const secrets = new Map([[secretKey("a1"), "s3cret"]]);
    const store = {
      get: async (k: string) => secrets.get(k) ?? null,
      set: async () => {},
      delete: async () => {},
    };
    expect(await loadCredentials(store, account)).toEqual({
      server: account.server,
      username: "alice",
      password: "s3cret",
    });
    expect(await loadCredentials(store, { ...account, id: "gone" })).toBeNull();
  });

  it("keep settings", async () => {
    const db = memoryDb();
    await migrate(db, appMigrations);
    expect(await getSetting(db, "theme")).toBeNull();
    await setSetting(db, "theme", "dark");
    await setSetting(db, "theme", "light");
    expect(await getSetting(db, "theme")).toBe("light");
  });
});

describe("library", () => {
  it("replaces a list atomically and keeps favorites and hidden categories", async () => {
    const db = memoryDb();
    await migrate(db, accountMigrations);
    const channel = (id: number, categoryId = "1") => ({
      id,
      num: id,
      name: `Channel ${id}`,
      icon: null,
      epgChannelId: null,
      addedAt: null,
      categoryId,
      tvArchive: id % 2 === 0,
      tvArchiveDays: 0,
    });
    await db.transaction(async (tx) => {
      replaceCategories(tx, "live", [
        { id: "1", name: "News", parentId: null },
        { id: "2", name: "Sport", parentId: null },
      ]);
      replaceLive(tx, [channel(1), channel(2), channel(3, "2")]);
    });
    await db.execute("INSERT INTO favorites (kind, id, added_at) VALUES ('live', 2, 0)");
    await db.execute("INSERT INTO hidden_categories (kind, id) VALUES ('live', '2')");

    // A failing replacement leaves the old list.
    await expect(
      db.transaction(async (tx) => {
        replaceLive(tx, [channel(9)]);
        tx.execute("INSERT INTO live (id) VALUES (NULL, 'bad')");
      }),
    ).rejects.toThrow();
    expect((await readCounts(db)).live).toBe(3);

    await db.transaction(async (tx) => {
      replaceLive(tx, [channel(2), channel(4, "2")]);
    });
    expect(await readCounts(db)).toEqual({ live: 2, vod: 0, series: 0 });
    expect(await db.select("SELECT id FROM favorites")).toEqual([{ id: 2 }]);
    expect(await readCategories(db, "live")).toEqual([
      { id: "1", name: "News", count: 1, hidden: false },
      { id: "2", name: "Sport", count: 1, hidden: true },
    ]);
  });

  it("stores an item listed in several categories once, in each category", async () => {
    const db = memoryDb();
    await migrate(db, accountMigrations);
    const movie = (id: number, categoryId: string) => ({
      id,
      num: id,
      name: `Movie ${id}`,
      icon: null,
      rating: null,
      addedAt: null,
      categoryId,
      ext: "mkv",
    });
    let stored = 0;
    await db.transaction(async (tx) => {
      replaceCategories(tx, "vod", [
        { id: "a", name: "Action", parentId: null },
        { id: "b", name: "New", parentId: null },
        { id: "c", name: "4K", parentId: null },
      ]);
      stored = replaceVod(tx, [
        movie(1, "a"),
        movie(2, "a"),
        movie(1, "b"),
        movie(1, "c"),
        movie(3, "b"),
      ]);
    });
    expect(stored).toBe(3);
    expect((await readCounts(db)).vod).toBe(3);
    expect((await readCategories(db, "vod")).map((c) => [c.id, c.count])).toEqual([
      ["a", 2],
      ["b", 2],
      ["c", 1],
    ]);
    // Position within each category follows the provider's order.
    expect(
      await db.select(
        "SELECT item_id FROM category_items WHERE kind = 'vod' AND category_id = 'b' ORDER BY position",
      ),
    ).toEqual([{ item_id: 1 }, { item_id: 3 }]);
  });

  it("inserts large lists in several statements", async () => {
    const db = memoryDb();
    await db.execute("CREATE TABLE t (a, b)");
    const statements: number[] = [];
    await db.transaction(async (tx) => {
      const counting = {
        execute: (sql: string, params?: (string | number | boolean | null)[]) => {
          statements.push(params?.length ?? 0);
          tx.execute(sql, params);
        },
      };
      insertRows(
        counting,
        "t",
        ["a", "b"],
        Array.from({ length: 450 }, (_, i) => [i, i % 2 === 0]),
      );
    });
    expect(statements).toEqual([400, 400, 100]);
    expect(await db.select("SELECT COUNT(*) AS n, SUM(b) AS trues FROM t")).toEqual([
      { n: 450, trues: 225 },
    ]);
  });
});
