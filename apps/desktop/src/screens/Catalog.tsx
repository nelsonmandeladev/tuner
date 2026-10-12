import type { GridSort } from "@tuner/core";
import { useEffect } from "react";
import { useNavigate } from "react-router";
import { Button } from "../components/Button";
import { CategoryList } from "../components/CategoryList";
import { EmptyState } from "../components/EmptyState";
import { PosterGrid } from "../components/PosterGrid";
import { Screen } from "../components/Screen";
import { SegmentedControl } from "../components/SegmentedControl";
import { movies, series, type Catalog as CatalogStore } from "../data/catalog";
import { useSession } from "../data/session";

const count = new Intl.NumberFormat();

const SORTS = [
  { value: "recent", label: "Recently added" },
  { value: "name", label: "Name" },
  { value: "rating", label: "Rating" },
] as const satisfies readonly { value: GridSort; label: string }[];

/** Where each grid was scrolled to, so coming back from a detail page lands in the same place. */
const scrollOffsets = new Map<string, number>();

/**
 * Movies and Series (SPEC §5–6): the category rail and a poster grid with
 * sort. Opening a poster goes to its detail page.
 */
function Catalog({ store, path }: { store: CatalogStore; path: "/movies" | "/series" }) {
  const navigate = useNavigate();
  const status = store.use((s) => s.status);
  const items = store.use((s) => s.items);
  const list = store.use((s) => s.list);
  const categories = store.use((s) => s.categories);
  const hidden = store.use((s) => s.hiddenCategories);
  const categoryId = store.use((s) => s.categoryId);
  const sort = store.use((s) => s.sort);
  const progress = store.use((s) => s.progress);
  const accountId = useSession((s) => s.active?.id);
  const syncing = useSession((s) => s.sync.running);
  const category = categories.find((c) => c.id === categoryId);
  const offsetKey = `${path}|${categoryId}|${sort}`;

  useEffect(() => {
    void store.load();
  }, [store, accountId, syncing]);

  const label = store.kind === "vod" ? "Movies" : "Series";
  if (status === "error") {
    return (
      <Screen title={label}>
        <EmptyState
          message={`Your ${label.toLowerCase()} could not be read from the local library.`}
          action={<Button onClick={() => void store.load()}>Try again</Button>}
        />
      </Screen>
    );
  }
  if (status === "ready" && items.size === 0) {
    return (
      <Screen title={label}>
        <EmptyState message={`${label} from your subscription appear here after the first sync.`} />
      </Screen>
    );
  }

  return (
    <div
      className="grid h-full grid-cols-[minmax(200px,264px)_minmax(0,1fr)]"
      data-catalog={store.kind}
    >
      <CategoryList
        categories={categories}
        hidden={hidden}
        activeId={categoryId}
        onSelect={store.selectCategory}
        onSetHidden={(id, on) => void store.setHidden(id, on)}
      />
      <section aria-label={label} className="flex min-h-0 min-w-0 flex-col gap-5 pt-7">
        <div className="flex flex-wrap items-center justify-between gap-4 px-8">
          <div className="flex min-w-0 items-baseline gap-3">
            <h1 className="truncate text-title">{category?.name ?? label}</h1>
            <span className="font-mono text-caption text-text-dim">
              {count.format(list.length)}
            </span>
          </div>
          <SegmentedControl label="Sort" options={SORTS} value={sort} onChange={store.setSort} />
        </div>
        {status === "ready" && list.length === 0 ? (
          <div className="px-8">
            <EmptyState message="This category is empty." />
          </div>
        ) : (
          <PosterGrid
            key={offsetKey}
            ids={list}
            items={items}
            progress={progress}
            initialOffset={scrollOffsets.get(offsetKey) ?? 0}
            onScrollOffset={(offset) => scrollOffsets.set(offsetKey, offset)}
            onOpen={(id) => void navigate(`${path}/${id}`)}
          />
        )}
      </section>
    </div>
  );
}

export function Movies() {
  return <Catalog store={movies} path="/movies" />;
}

export function Series() {
  return <Catalog store={series} path="/series" />;
}
