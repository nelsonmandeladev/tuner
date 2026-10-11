import { fetch } from "@tauri-apps/plugin-http";
import { HttpError, redact, type HttpAdapter } from "@tuner/core";

/**
 * HttpAdapter on tauri-plugin-http (D6): requests run in Rust, so plain-http
 * providers and CORS are not a problem. Error messages from the plugin can
 * contain the request URL, so they are redacted before they go anywhere.
 */

/** A common desktop agent: some providers reject unknown ones (XTREAM_API.md "Quirks"). */
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const DEFAULT_TIMEOUT_MS = 15_000;

export const tauriHttp: HttpAdapter = {
  async getJson(url, { timeoutMs = DEFAULT_TIMEOUT_MS, signal } = {}) {
    const timeout = AbortSignal.timeout(timeoutMs);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
    let response: Response;
    try {
      response = await fetch(url, {
        method: "GET",
        headers: { "User-Agent": USER_AGENT, Accept: "application/json, */*" },
        signal: combined,
        connectTimeout: Math.min(timeoutMs, 10_000),
      });
    } catch (error) {
      if (timeout.aborted) throw new HttpError("timeout", `Timed out after ${timeoutMs} ms`);
      if (signal?.aborted) throw new HttpError("aborted", "Request cancelled");
      throw new HttpError("network", redact(String(error)));
    }
    if (!response.ok) {
      throw new HttpError("status", `HTTP ${response.status}`, response.status);
    }
    const text = await response.text();
    // An empty body is no data, not broken JSON: panels answer a bad login that way.
    if (text.trim() === "") return null;
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new HttpError("not-json", `Expected JSON, got ${text.length} bytes of something else`);
    }
  },
};
