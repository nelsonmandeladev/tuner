/** Grid order for Movies and Series (SPEC §5): recently added, name, rating. */

import { foldText } from "../text";

export type GridSort = "recent" | "name" | "rating";

export interface Sortable {
  id: number;
  name: string;
  /** Unix ms: `added` for movies, `last_modified` for series. */
  addedAt: number | null;
  rating: number | null;
}

/** A new array of ids in the requested order. Ties keep the provider's order. */
export function sortIds<T extends Sortable>(
  ids: readonly number[],
  items: ReadonlyMap<number, T>,
  sort: GridSort,
): number[] {
  const position = new Map(ids.map((id, i) => [id, i]));
  const tie = (a: number, b: number) => position.get(a)! - position.get(b)!;
  const list = ids.filter((id) => items.has(id));
  if (sort === "recent") {
    return list.sort(
      (a, b) => (items.get(b)!.addedAt ?? 0) - (items.get(a)!.addedAt ?? 0) || tie(a, b),
    );
  }
  if (sort === "rating") {
    return list.sort(
      (a, b) => (items.get(b)!.rating ?? -1) - (items.get(a)!.rating ?? -1) || tie(a, b),
    );
  }
  const keys = new Map(list.map((id) => [id, foldText(items.get(id)!.name)]));
  const collator = new Intl.Collator(undefined, { numeric: true });
  return list.sort((a, b) => collator.compare(keys.get(a)!, keys.get(b)!) || tie(a, b));
}
