import { DatabaseSync } from "node:sqlite";
import type { SqlAdapter, SqlValue } from "../src/adapters";

/**
 * A real SQLite database (Node's built-in node:sqlite) behind the SqlAdapter
 * contract, for tests. Like the desktop adapter, a transaction collects its
 * writes and applies them all or none.
 */
export function memoryDb(): SqlAdapter & { raw: DatabaseSync } {
  const raw = new DatabaseSync(":memory:");
  const bind = (params: SqlValue[] = []) =>
    params.map((p) => (typeof p === "boolean" ? (p ? 1 : 0) : p));
  const run = (sql: string, params?: SqlValue[]) => raw.prepare(sql).run(...bind(params));
  return {
    raw,
    async execute(sql, params) {
      run(sql, params);
    },
    async select<T>(sql: string, params?: SqlValue[]) {
      return raw.prepare(sql).all(...bind(params)) as T[];
    },
    async transaction(fn) {
      const queued: [string, SqlValue[] | undefined][] = [];
      await fn({ execute: (sql, params) => void queued.push([sql, params]) });
      raw.exec("BEGIN");
      try {
        for (const [sql, params] of queued) run(sql, params);
        raw.exec("COMMIT");
      } catch (error) {
        raw.exec("ROLLBACK");
        throw error;
      }
    },
  };
}
