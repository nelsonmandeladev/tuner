/**
 * Search (SPEC §7, docs/DECISIONS.md D8): the overlay's state and the index
 * in its worker.
 *
 * The index is built in the worker from the library after each sync and
 * stored in the app cache folder (src-tauri/src/search_store.rs). A cold
 * start loads the stored index instead of rebuilding it; its key (the sync
 * times) tells whether it still matches the library. Queries run in the
 * worker; only the answer to the latest one is shown.
 */

import { invoke } from "@tauri-apps/api/core";
import {
  readHiddenCategories,
  readSearchDocs,
  searchIndexKey,
  type SearchGroups,
} from "@tuner/core";
import { create } from "zustand";
import type { WorkerRequest, WorkerResponse } from "./search.worker";
import { activeLibrary, useSession } from "./session";

/** Results shown per kind. */
export const RESULTS_PER_KIND = 6;

export interface SearchStats {
  /** Where the index came from in this run. */
  source: "disk" | "built" | null;
  /** Reading the stored file (Rust) and parsing it (worker). */
  readMs: number | null;
  loadMs: number | null;
  /** Reading the library from SQLite, building and serialising the index. */
  docsMs: number | null;
  buildMs: number | null;
  serializeMs: number | null;
  bytes: number | null;
  docs: number | null;
}

export interface SearchState {
  open: boolean;
  status: "idle" | "preparing" | "ready" | "error";
  /** The account and library version the worker's index belongs to. */
  accountId: string | null;
  key: string | null;
  query: string;
  /** Results and the query they answer (may lag `query` by a keystroke). */
  results: SearchGroups | null;
  resultsFor: string;
  /** Time spent in the worker on the last query (dev measurements). */
  workerMs: number | null;
  stats: SearchStats;
}

const noStats: SearchStats = {
  source: null,
  readMs: null,
  loadMs: null,
  docsMs: null,
  buildMs: null,
  serializeMs: null,
  bytes: null,
  docs: null,
};

export const useSearch = create<SearchState>(() => ({
  open: false,
  status: "idle",
  accountId: null,
  key: null,
  query: "",
  results: null,
  resultsFor: "",
  workerMs: null,
  stats: noStats,
}));

const set = useSearch.setState;
const get = useSearch.getState;

let worker: Worker | null = null;
let seq = 0;
const waiting = new Map<WorkerResponse["type"], (response: WorkerResponse) => void>();

function post(request: WorkerRequest, transfer: Transferable[] = []) {
  if (!worker) {
    worker = new Worker(new URL("./search.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = ({ data }: MessageEvent<WorkerResponse>) => {
      if (data.type === "results") {
        // Only the latest query's answer is shown.
        if (data.seq === seq) {
          set({ results: data.groups, resultsFor: data.query, workerMs: data.ms });
        }
        return;
      }
      waiting.get(data.type)?.(data);
      waiting.delete(data.type);
    };
  }
  worker.postMessage(request, transfer);
}

function ask<T extends WorkerResponse["type"]>(
  request: WorkerRequest,
  answer: T,
  transfer: Transferable[] = [],
): Promise<Extract<WorkerResponse, { type: T }>> {
  return new Promise((resolve) => {
    waiting.set(answer, resolve as (response: WorkerResponse) => void);
    post(request, transfer);
  });
}

let preparing: Promise<void> | null = null;

/**
 * Makes the worker's index match the active account's library: loads the
 * stored one if its key matches, else builds one and stores it. Cheap when
 * already current.
 */
export function prepareSearch(): Promise<void> {
  preparing ??= prepare().finally(() => {
    preparing = null;
  });
  return preparing;
}

/** Dev measurements only: builds and stores the index again, ignoring the stored one. */
export async function rebuildSearch(): Promise<void> {
  await preparing;
  preparing = prepare({ rebuild: true }).finally(() => {
    preparing = null;
  });
  return preparing;
}

async function prepare({ rebuild = false } = {}) {
  const { active, syncState } = useSession.getState();
  const db = activeLibrary();
  if (!active || !db || syncState.length === 0) return;
  const key = searchIndexKey(syncState);
  const current = get();
  if (
    !rebuild &&
    current.accountId === active.id &&
    current.key === key &&
    current.status === "ready"
  ) {
    await refreshHidden();
    return;
  }
  set({ status: "preparing" });
  try {
    await refreshHidden();
    const t0 = performance.now();
    const stored = await invoke<ArrayBuffer>("search_index_read", { account: active.id });
    const readMs = performance.now() - t0;
    if (stored.byteLength > 0 && !rebuild) {
      const loaded = await ask({ type: "load", key, bytes: stored }, "loaded", [stored]);
      if (loaded.ok) {
        set({
          status: "ready",
          accountId: active.id,
          key,
          stats: { ...noStats, source: "disk", readMs, loadMs: loaded.ms, docs: loaded.docs },
        });
        rerun();
        return;
      }
    }
    const t1 = performance.now();
    const docs = await readSearchDocs(db);
    const docsMs = performance.now() - t1;
    const built = await ask({ type: "build", key, docs }, "built");
    const bytes = built.bytes.byteLength;
    await invoke("search_index_write", built.bytes, { headers: { "x-account": active.id } });
    set({
      status: "ready",
      accountId: active.id,
      key,
      stats: {
        ...noStats,
        source: "built",
        docsMs,
        buildMs: built.ms,
        serializeMs: built.serializeMs,
        bytes,
        docs: built.docs,
      },
    });
    rerun();
  } catch {
    set({ status: "error" });
  }
}

/** Hidden categories change in Live TV, Movies and Series; search follows on each open. */
async function refreshHidden() {
  const db = activeLibrary();
  if (db) post({ type: "hidden", hidden: await readHiddenCategories(db) });
}

/** Asks the worker for `query`; the answer lands in `results`. */
export function setQuery(query: string) {
  set({ query });
  seq++;
  if (query.trim() === "") {
    set({ results: null, resultsFor: query });
    return;
  }
  post({ type: "query", seq, query, limit: RESULTS_PER_KIND });
}

/** Runs the typed query again (the index changed under it). */
function rerun() {
  const { query } = get();
  if (query.trim() !== "") setQuery(query);
}

export function openSearch() {
  if (get().open) return;
  set({ open: true });
  void prepareSearch();
}

export function closeSearch() {
  set({ open: false });
}

export function toggleSearch() {
  if (get().open) closeSearch();
  else openSearch();
}

// A finished sync changes the library: rebuild (in the background).
useSession.subscribe((state, prev) => {
  if (prev.sync.running && !state.sync.running) void prepareSearch();
  if (state.active?.id !== prev.active?.id) set({ query: "", results: null, resultsFor: "" });
});
