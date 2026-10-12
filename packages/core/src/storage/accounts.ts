/**
 * Accounts and app settings in `app.db`. The password is never here: it lives
 * in the SecretStore under `secretKey(id)` (docs/DECISIONS.md D5).
 */

import type { SecretStore, SqlAdapter } from "../adapters";
import type { AccountInfo } from "../xtream/schemas";
import type { Credentials } from "../xtream/urls";

export interface Account {
  id: string;
  name: string;
  server: string;
  username: string;
  createdAt: number;
  status: string | null;
  expiresAt: number | null;
  maxConnections: number | null;
  allowedFormats: string[];
  timezone: string | null;
  lastSyncAt: number | null;
}

interface AccountRow {
  id: string;
  name: string;
  server: string;
  username: string;
  created_at: number;
  status: string | null;
  expires_at: number | null;
  max_connections: number | null;
  allowed_formats: string;
  timezone: string | null;
  last_sync_at: number | null;
}

const nullableNumber = (v: number | null) => (v === null ? null : Number(v));

function fromRow(r: AccountRow): Account {
  let allowedFormats: string[] = [];
  try {
    const parsed: unknown = JSON.parse(r.allowed_formats);
    if (Array.isArray(parsed))
      allowedFormats = parsed.filter((f): f is string => typeof f === "string");
  } catch {
    // Keep [] for a damaged value.
  }
  return {
    id: r.id,
    name: r.name,
    server: r.server,
    username: r.username,
    createdAt: Number(r.created_at),
    status: r.status,
    expiresAt: nullableNumber(r.expires_at),
    maxConnections: nullableNumber(r.max_connections),
    allowedFormats,
    timezone: r.timezone,
    lastSyncAt: nullableNumber(r.last_sync_at),
  };
}

/** The keychain key for an account's password. */
export const secretKey = (accountId: string) => `xtream:${accountId}`;

/** The SQLite file name for an account's library (one file per account, D4). */
export const accountDbName = (accountId: string) => `account-${accountId}.db`;

export async function listAccounts(db: SqlAdapter): Promise<Account[]> {
  const rows = await db.select<AccountRow>(
    `SELECT id, name, server, username, created_at, status, expires_at, max_connections,
       allowed_formats, timezone, last_sync_at
     FROM accounts ORDER BY position, created_at`,
  );
  return rows.map(fromRow);
}

export async function insertAccount(db: SqlAdapter, account: Account): Promise<void> {
  await db.execute(
    `INSERT INTO accounts (id, name, server, username, position, created_at, status, expires_at,
       max_connections, allowed_formats, timezone, last_sync_at)
     VALUES (?, ?, ?, ?, (SELECT COALESCE(MAX(position), -1) + 1 FROM accounts), ?, ?, ?, ?, ?, ?, ?)`,
    [
      account.id,
      account.name,
      account.server,
      account.username,
      account.createdAt,
      account.status,
      account.expiresAt,
      account.maxConnections,
      JSON.stringify(account.allowedFormats),
      account.timezone,
      account.lastSyncAt,
    ],
  );
}

/** Refreshes what the provider reported about the account (status, expiry, limits). */
export async function updateAccountInfo(
  db: SqlAdapter,
  id: string,
  info: AccountInfo,
): Promise<void> {
  await db.execute(
    `UPDATE accounts SET status = ?, expires_at = ?, max_connections = ?, allowed_formats = ?, timezone = ?
     WHERE id = ?`,
    [
      info.status,
      info.expiresAt,
      info.maxConnections,
      JSON.stringify(info.allowedFormats),
      info.timezone,
      id,
    ],
  );
}

/** What the user can edit in Settings → Accounts (the password lives in the SecretStore). */
export interface AccountDetails {
  name: string;
  server: string;
  username: string;
}

export async function updateAccountDetails(
  db: SqlAdapter,
  id: string,
  details: AccountDetails,
): Promise<void> {
  await db.execute("UPDATE accounts SET name = ?, server = ?, username = ? WHERE id = ?", [
    details.name,
    details.server,
    details.username,
    id,
  ]);
}

export async function markAccountSynced(db: SqlAdapter, id: string, at: number): Promise<void> {
  await db.execute("UPDATE accounts SET last_sync_at = ? WHERE id = ?", [at, id]);
}

export async function deleteAccountRow(db: SqlAdapter, id: string): Promise<void> {
  await db.execute("DELETE FROM accounts WHERE id = ?", [id]);
}

/** Credentials for an account, with the password from the SecretStore. Null if the secret is gone. */
export async function loadCredentials(
  secrets: SecretStore,
  account: Account,
): Promise<Credentials | null> {
  const password = await secrets.get(secretKey(account.id));
  return password === null
    ? null
    : { server: account.server, username: account.username, password };
}

export async function getSetting(db: SqlAdapter, key: string): Promise<string | null> {
  const [row] = await db.select<{ value: string }>("SELECT value FROM settings WHERE key = ?", [
    key,
  ]);
  return row?.value ?? null;
}

export async function setSetting(db: SqlAdapter, key: string, value: string): Promise<void> {
  await db.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [key, value]);
}
