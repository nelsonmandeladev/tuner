/**
 * The signed-in session: accounts, the active account's library database, and
 * sync progress. Screens read `useSession`; everything that touches the
 * provider or the databases goes through @tuner/core here (CLAUDE.md rule 6).
 */

import { invoke } from "@tauri-apps/api/core";
import {
  DEFAULT_REFRESH_HOURS,
  XtreamClient,
  XtreamError,
  accountDbName,
  accountMigrations,
  appMigrations,
  deleteAccountRow,
  getSetting,
  insertAccount,
  libraryIsStale,
  listAccounts,
  loadCredentials,
  markAccountSynced,
  migrate,
  normalizeServer,
  readCounts,
  readLiveIcons,
  readSyncState,
  secretKey,
  setSetting,
  syncLibrary,
  updateAccountDetails,
  updateAccountInfo,
  type Account,
  type AccountInfo,
  type LibraryCounts,
  type ListSyncState,
  type SqlAdapter,
  type SyncStep,
  type XtreamErrorKind,
} from "@tuner/core";
import { create } from "zustand";
import { tauriHttp } from "./http";
import { keychain } from "./secrets";
import { openDatabase } from "./sql";

export type StepStatus = "waiting" | "fetching" | "saving" | "done" | "failed";

export interface SyncView {
  running: boolean;
  steps: Record<SyncStep, { status: StepStatus; count: number | null }>;
  error: XtreamErrorKind | null;
  /** What the provider said at connect time; shown above the progress. */
  info: AccountInfo | null;
}

export interface SessionState {
  phase: "booting" | "no-account" | "ready" | "boot-error";
  bootError: string | null;
  /** Time from app start to cached data in the store (performance.now() at the end of boot). */
  bootMs: number | null;
  accounts: Account[];
  active: Account | null;
  counts: LibraryCounts | null;
  syncState: ListSyncState[];
  sync: SyncView;
  /**
   * Bumped each time a sync step replaces a list: screens holding a list read
   * it again (quietly, keeping what they show until the new one is in).
   */
  libraryVersion: number;
  /** What the last launch check decided (dev checks). */
  lastRefresh: { at: number; reason: "stale" | "manual" | "skipped" } | null;
}

const idleSync = (): SyncView => ({
  running: false,
  steps: {
    categories: { status: "waiting", count: null },
    live: { status: "waiting", count: null },
    vod: { status: "waiting", count: null },
    series: { status: "waiting", count: null },
  },
  error: null,
  info: null,
});

export const useSession = create<SessionState>(() => ({
  // Outside Tauri (pnpm dev:web) there is no database: show Connect for design work.
  phase: "__TAURI_INTERNALS__" in window ? "booting" : "no-account",
  bootError: null,
  bootMs: null,
  accounts: [],
  active: null,
  counts: null,
  syncState: [],
  sync: idleSync(),
  libraryVersion: 0,
  lastRefresh: null,
}));

const set = useSession.setState;
const ACTIVE_ACCOUNT = "activeAccountId";

let appDb: Promise<SqlAdapter> | null = null;
let libraryDb: SqlAdapter | null = null;

/** app.db, opened and migrated once (boot and the settings read it at the same time). */
function app(): Promise<SqlAdapter> {
  appDb ??= openDatabase("app.db")
    .then(async (db) => {
      await migrate(db, appMigrations);
      return db;
    })
    .catch((error: unknown) => {
      appDb = null;
      throw error;
    });
  return appDb;
}

async function openLibrary(account: Account): Promise<SqlAdapter> {
  const db = await openDatabase(accountDbName(account.id));
  await migrate(db, accountMigrations);
  libraryDb = db;
  libraryAccount = account.id;
  return db;
}

/** The account whose database `libraryDb` is. */
let libraryAccount: string | null = null;

/** Closes an account's database pool (another account is now active). */
function closeLibrary(accountId: string) {
  void invoke("account_db_unload", { account: accountId }).catch(() => undefined);
}

async function refreshLibrary() {
  if (!libraryDb) return;
  const [counts, syncState] = await Promise.all([readCounts(libraryDb), readSyncState(libraryDb)]);
  set({ counts, syncState });
}

let clientFor: { accountId: string; client: Promise<XtreamClient | null> } | null = null;

/** The active account's library database, or null before boot or with no account. */
export function activeLibrary(): SqlAdapter | null {
  return libraryDb;
}

/**
 * A client for the active account (password from the keychain, read once per
 * account). Null when there is no account or its password is gone.
 */
export function activeClient(): Promise<XtreamClient | null> {
  const { active } = useSession.getState();
  if (!active) return Promise.resolve(null);
  if (clientFor?.accountId !== active.id) {
    clientFor = {
      accountId: active.id,
      client: loadCredentials(keychain, active).then((creds) =>
        creds ? new XtreamClient(tauriHttp, creds) : null,
      ),
    };
  }
  return clientFor.client;
}

/** An app-wide setting from `app.db` (not tied to an account), or null. */
export async function readAppSetting(key: string): Promise<string | null> {
  return getSetting(await app(), key);
}

export async function writeAppSetting(key: string, value: string): Promise<void> {
  await setSetting(await app(), key, value);
}

/** Dev checks only: channel logo URLs from the active library. */
export async function sampleLiveIcons(limit: number): Promise<string[]> {
  return libraryDb ? readLiveIcons(libraryDb, limit) : [];
}

/**
 * Loads accounts and the active account's cached library. No network: the app
 * shows cached data first (SPEC "Refresh strategy").
 */
export async function boot(): Promise<void> {
  try {
    const db = await app();
    const accounts = await listAccounts(db);
    if (accounts.length === 0) {
      set({ phase: "no-account", accounts, active: null, bootMs: performance.now() });
      return;
    }
    const activeId = await getSetting(db, ACTIVE_ACCOUNT);
    const active = accounts.find((a) => a.id === activeId) ?? accounts[0]!;
    await openLibrary(active);
    set({ accounts, active });
    await refreshLibrary();
    set({ phase: "ready", bootMs: performance.now() });
  } catch (error) {
    set({ phase: "boot-error", bootError: String(error) });
  }
}

export interface ConnectForm {
  server: string;
  username: string;
  password: string;
  name: string;
}

export type ConnectError = XtreamErrorKind | "invalid-server" | "missing-fields" | "storage";

export type ConnectResult =
  { ok: true; account: Account } | { ok: false; error: ConnectError; status?: string | null };

/**
 * Validates the login with the provider (account info), then stores the
 * account (password in the keychain only) and makes it active. Connecting the
 * same server and username again updates that account instead of adding one.
 */
export async function connect(form: ConnectForm, signal?: AbortSignal): Promise<ConnectResult> {
  const previous = libraryAccount;
  const server = normalizeServer(form.server);
  if (!server) return { ok: false, error: "invalid-server" };
  const username = form.username.trim();
  if (!username || !form.password) return { ok: false, error: "missing-fields" };
  const creds = { server, username, password: form.password };

  let info: AccountInfo;
  try {
    info = await new XtreamClient(tauriHttp, creds).accountInfo(signal);
  } catch (error) {
    if (error instanceof XtreamError) return { ok: false, error: error.kind, status: error.status };
    return { ok: false, error: "bad-response" };
  }

  try {
    const db = await app();
    const existing = (await listAccounts(db)).find(
      (a) => a.server === server && a.username === username,
    );
    const account: Account = existing ?? {
      id: crypto.randomUUID(),
      name: form.name.trim() || new URL(server).hostname,
      server,
      username,
      createdAt: Date.now(),
      status: info.status,
      expiresAt: info.expiresAt,
      maxConnections: info.maxConnections,
      allowedFormats: info.allowedFormats,
      timezone: info.timezone,
      lastSyncAt: null,
    };
    // Keychain first: an account row without its password would be unusable.
    // If the row then fails to save, remove the new secret so none is orphaned.
    await keychain.set(secretKey(account.id), form.password);
    clientFor = null;
    try {
      if (existing) await updateAccountInfo(db, account.id, info);
      else await insertAccount(db, account);
    } catch (error) {
      if (!existing) await keychain.delete(secretKey(account.id)).catch(() => undefined);
      throw error;
    }
    await setSetting(db, ACTIVE_ACCOUNT, account.id);
    await openLibrary(account);
    if (previous && previous !== account.id) closeLibrary(previous);
    const accounts = await listAccounts(db);
    set({
      accounts,
      active: accounts.find((a) => a.id === account.id) ?? account,
      sync: { ...idleSync(), info },
    });
    await refreshLibrary();
    return { ok: true, account };
  } catch {
    return { ok: false, error: "storage" };
  }
}

let syncing: Promise<void> | null = null;

/**
 * Syncs the active account's library. Keeps running when the user leaves
 * the progress view; a second call joins the running sync.
 */
export function syncActive(): Promise<void> {
  syncing ??= runSync().finally(() => {
    syncing = null;
  });
  return syncing;
}

async function runSync() {
  const { active } = useSession.getState();
  if (!active || !libraryDb) return;
  const creds = await loadCredentials(keychain, active);
  if (!creds) {
    set((s) => ({ sync: { ...s.sync, error: "wrong-credentials" } }));
    return;
  }
  const db = libraryDb;
  set((s) => ({ sync: { ...idleSync(), info: s.sync.info, running: true } }));
  try {
    await syncLibrary(new XtreamClient(tauriHttp, creds), db, {
      onProgress: (event) => {
        set((s) => ({
          sync: {
            ...s.sync,
            steps: {
              ...s.sync.steps,
              [event.step]: {
                status: event.phase,
                count: "count" in event ? event.count : s.sync.steps[event.step].count,
              },
            },
          },
        }));
        if (event.phase === "done") {
          set((s) => ({ libraryVersion: s.libraryVersion + 1 }));
          void refreshLibrary();
        }
      },
    });
    const at = Date.now();
    await markAccountSynced(await app(), active.id, at);
    set((s) => ({
      active: s.active ? { ...s.active, lastSyncAt: at } : s.active,
      sync: { ...s.sync, running: false },
    }));
  } catch (error) {
    const kind: XtreamErrorKind = error instanceof XtreamError ? error.kind : "bad-response";
    set((s) => ({
      sync: {
        ...s.sync,
        running: false,
        error: kind,
        steps: Object.fromEntries(
          Object.entries(s.sync.steps).map(([step, state]) => [
            step,
            state.status === "done" || state.status === "waiting"
              ? state
              : { ...state, status: "failed" },
          ]),
        ) as SyncView["steps"],
      },
    }));
  } finally {
    await refreshLibrary();
  }
}

// --- several accounts (SPEC §1, Settings → Accounts) ---------------------------

/**
 * Makes another account the active one: its library opens, the previous one
 * closes, and every screen reads the new account (stores key their data by
 * account id). The caller stops playback first: the stream belongs to the
 * old account (CLAUDE.md rule 5).
 */
export async function switchAccount(id: string): Promise<void> {
  const { active } = useSession.getState();
  if (active?.id === id) return;
  await syncing;
  const db = await app();
  const accounts = await listAccounts(db);
  const next = accounts.find((a) => a.id === id);
  if (!next) return;
  const previous = libraryAccount;
  await setSetting(db, ACTIVE_ACCOUNT, next.id);
  clientFor = null;
  await openLibrary(next);
  set({ accounts, active: next, counts: null, syncState: [], sync: idleSync() });
  if (previous && previous !== next.id) closeLibrary(previous);
  await refreshLibrary();
  void refreshIfStale();
}

export type EditError = ConnectError | "duplicate";

export type EditResult = { ok: true } | { ok: false; error: EditError; status?: string | null };

/**
 * Saves Settings → Accounts → Edit. A new server, username or password is
 * checked with the provider first (account info), with the password from
 * the form or, when left empty, the keychain. A new name alone needs no network.
 */
export async function editAccount(
  id: string,
  form: ConnectForm,
  signal?: AbortSignal,
): Promise<EditResult> {
  const db = await app();
  const accounts = await listAccounts(db);
  const account = accounts.find((a) => a.id === id);
  if (!account) return { ok: false, error: "storage" };
  const server = normalizeServer(form.server);
  if (!server) return { ok: false, error: "invalid-server" };
  const username = form.username.trim();
  if (!username) return { ok: false, error: "missing-fields" };
  if (accounts.some((a) => a.id !== id && a.server === server && a.username === username)) {
    return { ok: false, error: "duplicate" };
  }

  const loginChanged =
    server !== account.server || username !== account.username || form.password !== "";
  let info: AccountInfo | null = null;
  if (loginChanged) {
    const password = form.password || (await keychain.get(secretKey(id)));
    if (!password) return { ok: false, error: "missing-fields" };
    try {
      info = await new XtreamClient(tauriHttp, { server, username, password }).accountInfo(signal);
    } catch (error) {
      if (error instanceof XtreamError)
        return { ok: false, error: error.kind, status: error.status };
      return { ok: false, error: "bad-response" };
    }
  }
  try {
    if (form.password) await keychain.set(secretKey(id), form.password);
    await updateAccountDetails(db, id, {
      name: form.name.trim() || account.name,
      server,
      username,
    });
    if (info) await updateAccountInfo(db, id, info);
  } catch {
    return { ok: false, error: "storage" };
  }
  if (loginChanged) clientFor = null;
  const updated = await listAccounts(db);
  set((s) => ({
    accounts: updated,
    active: s.active?.id === id ? (updated.find((a) => a.id === id) ?? s.active) : s.active,
  }));
  return { ok: true };
}

/** What removing an account deleted (account_remove in src-tauri/src/accounts.rs). */
export interface RemovedFiles {
  files: string[];
  /** Bytes of shared image cache cleared. */
  images: number;
}

/**
 * Removes an account and everything it stored: its row, database files,
 * search index, password and the image cache. The next account becomes
 * active, or the app goes back to Connect after the last one. The caller
 * stops playback first.
 */
export async function removeAccount(id: string): Promise<RemovedFiles> {
  await syncing;
  const db = await app();
  const accounts = await listAccounts(db);
  const wasActive = useSession.getState().active?.id === id;
  const next = accounts.find((a) => a.id !== id) ?? null;
  if (wasActive) {
    clientFor = null;
    if (next) {
      await setSetting(db, ACTIVE_ACCOUNT, next.id);
      await openLibrary(next);
    } else {
      libraryDb = null;
      libraryAccount = null;
    }
  }
  await deleteAccountRow(db, id);
  const removed = await invoke<RemovedFiles>("account_remove", { account: id });
  const remaining = await listAccounts(db);
  if (!wasActive) {
    set({ accounts: remaining });
    return removed;
  }
  set({
    accounts: remaining,
    active: next,
    counts: null,
    syncState: [],
    sync: idleSync(),
    ...(next ? {} : { phase: "no-account" as const }),
  });
  if (next) {
    await refreshLibrary();
    void refreshIfStale();
  }
  return removed;
}

// --- background refresh (SPEC "Refresh strategy") -------------------------------

/** Hours after which the lists are refreshed on launch (Settings → Data); 0 = by hand only. */
let refreshHours = DEFAULT_REFRESH_HOURS;
export function setRefreshHours(hours: number) {
  refreshHours = hours;
}

/**
 * Refreshes the active account's lists in the background when they are older
 * than the setting (12 h by default). Screens keep the cached lists; each one
 * is replaced in one transaction and read again when its step is done, and
 * the search index is rebuilt after (data/search.ts).
 */
export async function refreshIfStale(now = Date.now()): Promise<boolean> {
  const { phase, syncState, sync } = useSession.getState();
  if (phase !== "ready" || sync.running) return false;
  if (!libraryIsStale(syncState, refreshHours, now)) {
    set({ lastRefresh: { at: now, reason: "skipped" } });
    return false;
  }
  set({ lastRefresh: { at: now, reason: "stale" } });
  await syncActive();
  return true;
}

/** Settings → Accounts → Refresh now. */
export function refreshNow(): Promise<void> {
  set({ lastRefresh: { at: Date.now(), reason: "manual" } });
  return syncActive();
}
