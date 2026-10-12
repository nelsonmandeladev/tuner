/**
 * Library search (SPEC §7, docs/DECISIONS.md D8): one MiniSearch index over
 * channels, movies and series, built from the synced rows after each sync and
 * serialised so a cold start loads it instead of rebuilding it. Matching
 * ignores case, accents and punctuation (`foldText`), takes prefixes (results
 * as you type) and allows one typo in words of four letters or more.
 *
 * Plain TypeScript with no platform imports: the desktop app runs it in a
 * Web Worker; a mobile build can run it wherever it likes.
 */

import MiniSearch, { type Options, type SearchResult } from "minisearch";
import type { SqlAdapter } from "../adapters";
import type { ListSyncState } from "../storage/library";
import { foldText } from "../text";
import { splitTitleYear, yearOf } from "../vod/title";

export type SearchKind = "live" | "vod" | "series";
export const SEARCH_KINDS: readonly SearchKind[] = ["live", "vod", "series"];

/** One searchable item: what the index matches on and what a result row shows. */
export interface SearchDoc {
  /** `kind:id`, unique across kinds. */
  key: string;
  kind: SearchKind;
  id: number;
  /** Display title: the channel name, or the movie/series title without packaging. */
  title: string;
  /**
   * What the name matches on: the title without a language prefix ("FR| ",
   * "FR ★ "), which nearly every name carries and would make "fr" match the
   * whole library, plus the year ("dune 2021" narrows to one film).
   */
  text: string;
  year: number | null;
  /** Channel number. */
  num: number | null;
  icon: string | null;
  /** Category ids the item is listed in, joined by `CATEGORY_SEPARATOR`. */
  cats: string;
  /** Category names without prefixes, matched with a low weight ("sport" finds channels filed under Sport). */
  category: string;
}

export interface SearchHit {
  kind: SearchKind;
  id: number;
  title: string;
  year: number | null;
  num: number | null;
  icon: string | null;
  score: number;
}

export interface SearchGroups {
  live: SearchHit[];
  vod: SearchHit[];
  series: SearchHit[];
  /** Matches per kind before the per-group limit. */
  total: Record<SearchKind, number>;
}

/** Bump when the documents or options change, so stored indexes are rebuilt. */
export const SEARCH_INDEX_VERSION = 1;
const CATEGORY_SEPARATOR = "\u001f";

/** Folded words: "Téléfoot - 2023" → ["telefoot", "2023"]. Used for documents and queries. */
const tokenize = (text: string) => {
  const folded = foldText(text);
  return folded === "" ? [] : folded.split(" ");
};

const STORED = ["kind", "id", "title", "year", "num", "icon", "cats"] as const;

const options: Options<SearchDoc> = {
  idField: "key",
  fields: ["text", "category"],
  storeFields: [...STORED],
  tokenize,
  processTerm: (term) => term || null,
  searchOptions: {
    boost: { text: 3, category: 0.3 },
    // As you type: every word may be the start of a longer one. A lone first
    // letter matches whole words only: as a prefix it would score a third of
    // the library (~60 ms on 38,000 items) for a result nobody reads.
    prefix: (term, _i, terms) => !(terms.length === 1 && term.length === 1),
    // D8: one edit for words of four letters or more ("telefot" finds "Téléfoot").
    fuzzy: (term) => (term.length >= 4 ? 1 : 0),
    // Every word must match (in the title or a category), so adding words narrows.
    combineWith: "AND",
  },
};

export type SearchIndex = MiniSearch<SearchDoc>;

export function buildSearchIndex(docs: readonly SearchDoc[]): SearchIndex {
  const index = new MiniSearch<SearchDoc>(options);
  index.addAll(docs);
  return index;
}

/** What a stored index must match to be used: the version and when each list was synced. */
export function searchIndexKey(syncState: readonly ListSyncState[]): string {
  const at = (list: string) => syncState.find((s) => s.list === list)?.syncedAt ?? 0;
  return `v${SEARCH_INDEX_VERSION}|${["categories", ...SEARCH_KINDS].map((l) => `${l}:${at(l)}`).join("|")}`;
}

/** The index as text for disk: a header line with its key, then MiniSearch's JSON. */
export function serializeSearchIndex(index: SearchIndex, key: string): string {
  return `${JSON.stringify({ key, count: index.documentCount })}\n${JSON.stringify(index)}`;
}

/** The stored index, or null if it is missing, damaged or was built for other data. */
export function parseSearchIndex(text: string, key: string): SearchIndex | null {
  const newline = text.indexOf("\n");
  if (newline < 0) return null;
  try {
    const header = JSON.parse(text.slice(0, newline)) as { key?: unknown };
    if (header.key !== key) return null;
    return MiniSearch.loadJSON<SearchDoc>(text.slice(newline + 1), options);
  } catch {
    return null;
  }
}

export interface SearchOptions {
  /** Results kept per kind. */
  limit?: number;
  /** Hidden categories as `kind:categoryId`: items listed only there are left out (SPEC §3). */
  hidden?: ReadonlySet<string>;
}

/** Matches grouped by kind, best first; at most `limit` per kind. */
export function searchLibrary(
  index: SearchIndex,
  query: string,
  { limit = 6, hidden }: SearchOptions = {},
): SearchGroups {
  const groups: SearchGroups = {
    live: [],
    vod: [],
    series: [],
    total: { live: 0, vod: 0, series: 0 },
  };
  if (tokenize(query).length === 0) return groups;
  const visible = (kind: SearchKind, cats: string) =>
    !hidden ||
    hidden.size === 0 ||
    cats.split(CATEGORY_SEPARATOR).some((c) => c !== "" && !hidden.has(`${kind}:${c}`));

  for (const result of index.search(query) as (SearchResult & Omit<SearchDoc, "key">)[]) {
    const kind = result.kind;
    if (!visible(kind, result.cats)) continue;
    groups.total[kind]++;
    const group = groups[kind];
    if (group.length < limit) {
      group.push({
        kind,
        id: result.id,
        title: result.title,
        year: result.year,
        num: result.num,
        icon: result.icon,
        score: result.score,
      });
    }
  }
  return groups;
}

/** Every channel, movie and series as a search document, from the synced library. */
export async function readSearchDocs(db: SqlAdapter): Promise<SearchDoc[]> {
  const [categories, memberships, live, vod, series] = await Promise.all([
    db.select<{ kind: string; id: string; name: string }>("SELECT kind, id, name FROM categories"),
    db.select<{ kind: string; item: number; cats: string }>(
      `SELECT kind, item_id AS item, group_concat(category_id, char(31)) AS cats
       FROM category_items GROUP BY kind, item_id`,
    ),
    db.select<{ id: number; num: number | null; name: string; icon: string | null }>(
      "SELECT id, num, name, icon FROM live ORDER BY position",
    ),
    db.select<{ id: number; name: string; icon: string | null }>(
      "SELECT id, name, icon FROM vod ORDER BY position",
    ),
    db.select<{ id: number; name: string; icon: string | null; released: string | null }>(
      "SELECT id, name, cover AS icon, release_date AS released FROM series ORDER BY position",
    ),
  ]);
  const categoryName = new Map(
    categories.map((c) => [`${c.kind}:${c.id}`, splitTitleYear(c.name).title]),
  );
  const catsOf = new Map(memberships.map((m) => [`${m.kind}:${m.item}`, String(m.cats ?? "")]));

  const doc = (
    kind: SearchKind,
    id: number,
    fields: Pick<SearchDoc, "title" | "year" | "num" | "icon">,
    clean = fields.title,
  ): SearchDoc => {
    const cats = catsOf.get(`${kind}:${id}`) ?? "";
    return {
      key: `${kind}:${id}`,
      kind,
      id,
      ...fields,
      text: fields.year ? `${clean} ${fields.year}` : clean,
      cats,
      category: cats
        .split(CATEGORY_SEPARATOR)
        .map((c) => categoryName.get(`${kind}:${c}`) ?? "")
        .join(" "),
    };
  };

  const docs: SearchDoc[] = [];
  for (const r of live) {
    docs.push(
      doc(
        "live",
        Number(r.id),
        { title: r.name, year: null, num: r.num === null ? null : Number(r.num), icon: r.icon },
        splitTitleYear(r.name).title,
      ),
    );
  }
  for (const r of vod) {
    const { title, year } = splitTitleYear(r.name);
    docs.push(doc("vod", Number(r.id), { title, year, num: null, icon: r.icon }));
  }
  for (const r of series) {
    const { title, year } = splitTitleYear(r.name);
    docs.push(
      doc("series", Number(r.id), {
        title,
        year: yearOf(r.released) ?? year,
        num: null,
        icon: r.icon,
      }),
    );
  }
  return docs;
}
