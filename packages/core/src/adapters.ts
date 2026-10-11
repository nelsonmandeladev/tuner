/**
 * Platform adapters (docs/DECISIONS.md D3). The core never imports Tauri or
 * React; each app passes in implementations of these interfaces.
 */

export interface HttpAdapter {
  /**
   * GETs a URL and parses the body as JSON. Throws `HttpError` on failure, so
   * the core can tell a dead server from a bad response.
   */
  getJson(url: string, opts?: { timeoutMs?: number; signal?: AbortSignal }): Promise<unknown>;
}

export type HttpErrorKind =
  /** No response: DNS, refused, reset, TLS. */
  | "network"
  | "timeout"
  /** A response with a non-2xx status. */
  | "status"
  /** A 2xx response whose body is not JSON (providers send HTML on errors). */
  | "not-json"
  | "aborted";

export class HttpError extends Error {
  readonly kind: HttpErrorKind;
  readonly status: number | undefined;

  /** `message` must already be redacted: it can reach logs. */
  constructor(kind: HttpErrorKind, message: string, status?: number) {
    super(message);
    this.name = "HttpError";
    this.kind = kind;
    this.status = status;
  }
}

export type SqlValue = string | number | boolean | null;

export interface SqlAdapter {
  execute(sql: string, params?: SqlValue[]): Promise<void>;
  select<T>(sql: string, params?: SqlValue[]): Promise<T[]>;
  /**
   * Runs the writes made through `tx` atomically: all of them or none.
   * Implementations may send them as one batch, so `tx` only writes; read
   * before the transaction, not inside it.
   */
  transaction(fn: (tx: SqlTransaction) => Promise<void>): Promise<void>;
}

export interface SqlTransaction {
  execute(sql: string, params?: SqlValue[]): void;
}

export interface SecretStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}
