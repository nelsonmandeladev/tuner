/**
 * Xtream URLs (docs/XTREAM_API.md). They carry the username and password:
 * never log them, never show them. Pass anything that may hold one through
 * `redact()` first.
 */

export interface Credentials {
  /** Scheme + host + port, no trailing slash (see `normalizeServer`). */
  server: string;
  username: string;
  password: string;
}

export type StreamKind = "live" | "movie" | "series";

/**
 * Turns what the user typed into `scheme://host[:port]`. Adds http:// when
 * there is no scheme (providers are mostly plain HTTP). Drops any path, so a
 * pasted `…/player_api.php?…` URL still works. Returns null if it is not a URL.
 */
export function normalizeServer(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed === "") return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname) return null;
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

/** `player_api.php` with credentials and optional action parameters. */
export function apiUrl(creds: Credentials, params: Record<string, string | number> = {}): string {
  const query = new URLSearchParams({ username: creds.username, password: creds.password });
  for (const [key, value] of Object.entries(params)) query.set(key, String(value));
  return `${creds.server}/player_api.php?${query.toString()}`;
}

/** A path segment safe for any username or password (`/`, `?`, `#` included). */
const segment = (value: string) => encodeURIComponent(value);

/**
 * A catch-up start time as panels expect it: `YYYY-MM-DD:HH-MM` on the
 * server's wall clock (`server_info.timezone`). Falls back to UTC when the
 * zone is missing or unknown.
 */
export function timeshiftStart(ms: number, timeZone: string | null): string {
  const format = (zone: string) =>
    new Intl.DateTimeFormat("en-GB", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(ms));
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = format(timeZone ?? "UTC");
  } catch {
    parts = format("UTC");
  }
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}:${get("hour")}-${get("minute")}`;
}

/** Whole minutes a catch-up request must cover for a programme. */
export function timeshiftMinutes(start: number, end: number): number {
  return Math.max(1, Math.ceil((end - start) / 60_000));
}

/** Panels serve catch-up on one of two URL shapes; try the path form first. */
export type TimeshiftForm = "path" | "query";

/**
 * `/timeshift/{u}/{p}/{minutes}/{start}/{id}.ts`, or
 * `/streaming/timeshift.php?username&password&stream&start&duration`.
 */
export function timeshiftUrl(
  creds: Credentials,
  streamId: number,
  start: string,
  minutes: number,
  form: TimeshiftForm,
): string {
  if (!/^\d{4}-\d{2}-\d{2}:\d{2}-\d{2}$/.test(start)) throw new Error("Invalid timeshift start");
  if (form === "query") {
    const query = new URLSearchParams({
      username: creds.username,
      password: creds.password,
      stream: String(streamId),
      start,
      duration: String(minutes),
    });
    return `${creds.server}/streaming/timeshift.php?${query.toString()}`;
  }
  return `${creds.server}/timeshift/${segment(creds.username)}/${segment(creds.password)}/${minutes}/${start}/${streamId}.ts`;
}

/** `/live|movie|series/{u}/{p}/{id}.{ext}` */
export function streamUrl(
  creds: Credentials,
  kind: StreamKind,
  id: number | string,
  ext: string,
): string {
  if (!/^[a-z0-9]{1,8}$/i.test(ext)) throw new Error(`Invalid stream extension: ${ext}`);
  return `${creds.server}/${kind}/${segment(creds.username)}/${segment(creds.password)}/${id}.${ext}`;
}
