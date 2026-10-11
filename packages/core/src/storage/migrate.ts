import type { SqlAdapter } from "../adapters";
import type { Migration } from "./migrations";

/**
 * Brings a database up to the latest migration. The schema version lives in
 * SQLite's `user_version`, updated in the same transaction as each migration,
 * so a crash mid-way leaves the previous version intact. Returns the version.
 */
export async function migrate(db: SqlAdapter, migrations: Migration[]): Promise<number> {
  const [row] = await db.select<{ user_version: number }>("PRAGMA user_version");
  let current = Number(row?.user_version ?? 0);
  const pending = [...migrations]
    .filter((m) => m.version > current)
    .sort((a, b) => a.version - b.version);
  for (const migration of pending) {
    if (!Number.isInteger(migration.version) || migration.version <= current) {
      throw new Error(`Migration versions must increase: ${migration.version}`);
    }
    await db.transaction(async (tx) => {
      for (const statement of migration.statements) tx.execute(statement);
      // PRAGMA takes no parameters; the version is a checked integer.
      tx.execute(`PRAGMA user_version = ${migration.version}`);
    });
    current = migration.version;
  }
  return current;
}
