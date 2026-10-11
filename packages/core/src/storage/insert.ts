import type { SqlTransaction, SqlValue } from "../adapters";

/**
 * SQLite allows 32,766 bound parameters per statement. Rows of up to ~15
 * columns in batches of 200 stay far below that and keep each statement small.
 */
const ROWS_PER_STATEMENT = 200;

/**
 * Queues multi-row INSERTs for `rows` (each an array matching `columns`).
 * Booleans become 0/1 because not every SQLite binding accepts them.
 */
export function insertRows(
  tx: SqlTransaction,
  table: string,
  columns: readonly string[],
  rows: readonly SqlValue[][],
  { orReplace = false } = {},
) {
  const head = `INSERT ${orReplace ? "OR REPLACE " : ""}INTO ${table} (${columns.join(", ")}) VALUES `;
  const tuple = `(${columns.map(() => "?").join(", ")})`;
  for (let start = 0; start < rows.length; start += ROWS_PER_STATEMENT) {
    const chunk = rows.slice(start, start + ROWS_PER_STATEMENT);
    const params: SqlValue[] = [];
    for (const row of chunk) {
      if (row.length !== columns.length)
        throw new Error(`${table}: row has ${row.length} values for ${columns.length} columns`);
      for (const value of row) params.push(typeof value === "boolean" ? (value ? 1 : 0) : value);
    }
    tx.execute(head + chunk.map(() => tuple).join(", "), params);
  }
}
