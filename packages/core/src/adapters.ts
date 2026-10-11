/**
 * Platform adapters (docs/DECISIONS.md D3). The core never imports Tauri or
 * React; each app passes in implementations of these interfaces.
 */

export interface HttpAdapter {
  getJson(url: string, opts?: { timeoutMs?: number; signal?: AbortSignal }): Promise<unknown>;
}

export interface SqlAdapter {
  execute(sql: string, params?: unknown[]): Promise<void>;
  select<T>(sql: string, params?: unknown[]): Promise<T[]>;
  transaction(fn: () => Promise<void>): Promise<void>;
}

export interface SecretStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}
