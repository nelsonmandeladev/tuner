/**
 * Dev suites only: copies an account's personal tables (favorites, history,
 * resume points, hidden categories, account settings) into one settings row
 * before a suite changes them, and puts them back exactly afterwards. A run
 * that crashed leaves the row behind, and the next run restores it first.
 * Shared by the M5 and M6 suites.
 */

import type { SqlAdapter, SqlValue } from "@tuner/core";

const PERSONAL = ["favorites", "history", "resume", "hidden_categories", "settings"] as const;

type Backup = Record<(typeof PERSONAL)[number], Record<string, SqlValue>[]>;

export function personalBackup(db: SqlAdapter, key: string) {
  const otherSettings = (table: string) => (table === "settings" ? " WHERE key <> ?" : "");
  const otherParams = (table: string) => (table === "settings" ? [key] : []);

  async function read(): Promise<Backup | null> {
    const [row] = await db.select<{ value: string }>("SELECT value FROM settings WHERE key = ?", [
      key,
    ]);
    return row ? (JSON.parse(row.value) as Backup) : null;
  }

  /** Copies the personal tables into the backup row (written before anything changes). */
  async function backUp(): Promise<Backup> {
    const backup = {} as Backup;
    for (const table of PERSONAL) {
      backup[table] = await db.select<Record<string, SqlValue>>(
        `SELECT * FROM ${table}${otherSettings(table)}`,
        otherParams(table),
      );
    }
    await db.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [
      key,
      JSON.stringify(backup),
    ]);
    return backup;
  }

  /** Puts every personal table back as it was, in one transaction, then drops the backup row. */
  async function restore(backup: Backup) {
    await db.transaction(async (tx) => {
      for (const table of PERSONAL) {
        tx.execute(`DELETE FROM ${table}${otherSettings(table)}`, otherParams(table));
        for (const row of backup[table]) {
          const columns = Object.keys(row);
          tx.execute(
            `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`,
            columns.map((c) => row[c] ?? null),
          );
        }
      }
      tx.execute("DELETE FROM settings WHERE key = ?", [key]);
    });
  }

  /** A stable fingerprint of the personal tables, to prove the restore. */
  async function fingerprint(): Promise<string> {
    const parts: string[] = [];
    for (const table of PERSONAL) {
      const rows = await db.select<Record<string, SqlValue>>(
        `SELECT * FROM ${table}${otherSettings(table)}`,
        otherParams(table),
      );
      const lines = rows.map((r) => JSON.stringify(Object.entries(r).sort())).sort();
      parts.push(`${table}:${rows.length}:${hash(lines.join("\n"))}`);
    }
    return parts.join(" ");
  }

  return { read, backUp, restore, fingerprint };
}

export function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(16).padStart(8, "0");
}
