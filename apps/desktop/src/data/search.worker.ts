/**
 * The search index, off the UI thread (docs/DECISIONS.md D8). The page sends
 * the library's documents (to build) or the stored index (to load), then
 * queries; the worker answers with grouped results. It has no Tauri access:
 * the page reads SQLite and moves the index file (data/search.ts).
 */

import {
  buildSearchIndex,
  parseSearchIndex,
  searchLibrary,
  serializeSearchIndex,
  type SearchDoc,
  type SearchGroups,
  type SearchIndex,
} from "@tuner/core";

export type WorkerRequest =
  | { type: "load"; key: string; bytes: ArrayBuffer }
  | { type: "build"; key: string; docs: SearchDoc[] }
  | { type: "hidden"; hidden: string[] }
  | { type: "query"; seq: number; query: string; limit: number };

export type WorkerResponse =
  | { type: "loaded"; ok: boolean; ms: number; docs: number }
  | { type: "built"; ms: number; serializeMs: number; docs: number; bytes: ArrayBuffer }
  | { type: "results"; seq: number; query: string; groups: SearchGroups; ms: number };

interface WorkerScope {
  postMessage(message: WorkerResponse, transfer?: Transferable[]): void;
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
}
const scope = self as unknown as WorkerScope;

let index: SearchIndex | null = null;
let hidden = new Set<string>();

scope.onmessage = ({ data }) => {
  switch (data.type) {
    case "load": {
      const t0 = performance.now();
      index = parseSearchIndex(new TextDecoder().decode(data.bytes), data.key);
      scope.postMessage({
        type: "loaded",
        ok: index !== null,
        ms: performance.now() - t0,
        docs: index?.documentCount ?? 0,
      });
      break;
    }
    case "build": {
      const t0 = performance.now();
      index = buildSearchIndex(data.docs);
      const t1 = performance.now();
      const bytes = new TextEncoder().encode(serializeSearchIndex(index, data.key)).buffer;
      scope.postMessage(
        {
          type: "built",
          ms: t1 - t0,
          serializeMs: performance.now() - t1,
          docs: index.documentCount,
          bytes,
        },
        [bytes],
      );
      break;
    }
    case "hidden":
      hidden = new Set(data.hidden);
      break;
    case "query": {
      const t0 = performance.now();
      const groups = index
        ? searchLibrary(index, data.query, { limit: data.limit, hidden })
        : { live: [], vod: [], series: [], total: { live: 0, vod: 0, series: 0 } };
      scope.postMessage({
        type: "results",
        seq: data.seq,
        query: data.query,
        groups,
        ms: performance.now() - t0,
      });
      break;
    }
  }
};
