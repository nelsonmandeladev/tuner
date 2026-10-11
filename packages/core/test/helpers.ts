import { readFileSync } from "node:fs";
import { join } from "node:path";
import { HttpError, type HttpAdapter } from "../src/adapters";
import type { Credentials } from "../src/xtream/urls";

/** Placeholder host and credentials only (CLAUDE.md rule 4: no real sources). */
export const creds: Credentials = {
  server: "http://provider.example:8080",
  username: "alice",
  password: "s3cret/#?",
};

/** A recorded response from test/fixtures (anonymised by scripts/record-fixtures.mjs). */
export function fixture<T = unknown>(name: string): T {
  return JSON.parse(readFileSync(join(import.meta.dirname, "fixtures", name), "utf8")) as T;
}

/** Answers player_api calls by `action` (no action = account info); records every URL. */
export function fakeHttp(responses: Record<string, unknown | (() => never)>) {
  const urls: string[] = [];
  const http: HttpAdapter = {
    async getJson(url) {
      urls.push(url);
      const action = new URL(url).searchParams.get("action") ?? "";
      const response = responses[action];
      if (response === undefined) throw new HttpError("status", `no fake for ${action}`, 404);
      return typeof response === "function"
        ? (response as () => never)()
        : structuredClone(response);
    },
  };
  return { http, urls };
}
