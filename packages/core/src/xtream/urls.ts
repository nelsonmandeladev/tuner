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
