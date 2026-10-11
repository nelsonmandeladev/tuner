import { invoke } from "@tauri-apps/api/core";
import Database from "@tauri-apps/plugin-sql";
import type { SqlAdapter, SqlValue } from "@tuner/core";

/**
 * SqlAdapter on tauri-plugin-sql (D4). Reads and single writes go through the
 * plugin. Transactions go to the `db_batch` Rust command, which runs all the
 * queued statements in one sqlx transaction on the plugin's pool: the plugin's
 * own calls may each use a different pooled connection, so a BEGIN/COMMIT
 * pair through them would not be safe.
 */

const bind = (params: SqlValue[] = []) =>
  params.map((p) => (typeof p === "boolean" ? (p ? 1 : 0) : p));

/** Opens (and creates) a SQLite file in the app's config directory. */
export async function openDatabase(file: string): Promise<SqlAdapter> {
  const name = `sqlite:${file}`;
  const db = await Database.load(name);
  return {
    async execute(sql, params) {
      await db.execute(sql, bind(params));
    },
    select<T>(sql: string, params?: SqlValue[]) {
      return db.select<T[]>(sql, bind(params));
    },
    async transaction(fn) {
      const statements: { sql: string; params: SqlValue[] }[] = [];
      await fn({ execute: (sql, params) => void statements.push({ sql, params: bind(params) }) });
      if (statements.length > 0) await invoke("db_batch", { db: name, statements });
    },
  };
}
