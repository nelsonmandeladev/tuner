import { ArrowDown01Icon, ArrowUp01Icon, ViewIcon, ViewOffIcon } from "@hugeicons/core-free-icons";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../../components/Icon";
import { selectCategory, setHidden, useLive, type CategoryView } from "../../data/live";

const count = new Intl.NumberFormat();
/** 40 px item + 4 px gap (LiveTV.dc.html). */
const ITEM = 44;

type Item = { type: "category"; category: CategoryView } | { type: "hidden-header"; count: number };

/**
 * DESIGN.md `CategoryItem` list: Favorites, All channels, then the
 * provider's categories with their counts. Providers send hundreds, so the
 * list is virtualised. Each category can be hidden (the eye button on hover
 * or focus); hidden ones collect under "Hidden" at the end, where they can be
 * shown again.
 */
export function CategoryList() {
  const categories = useLive((s) => s.categories);
  const hidden = useLive((s) => s.hiddenCategories);
  const active = useLive((s) => s.categoryId);
  const [showHidden, setShowHidden] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  const items = useMemo<Item[]>(() => {
    const list: Item[] = categories.map((category) => ({ type: "category", category }));
    if (hidden.length > 0) {
      list.push({ type: "hidden-header", count: hidden.length });
      if (showHidden) for (const category of hidden) list.push({ type: "category", category });
    }
    return list;
  }, [categories, hidden, showHidden]);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scroller.current,
    estimateSize: () => ITEM,
    overscan: 8,
    useFlushSync: false,
  });

  const activeIndex = items.findIndex((i) => i.type === "category" && i.category.id === active);
  useEffect(() => {
    if (activeIndex >= 0) virtualizer.scrollToIndex(activeIndex, { align: "auto" });
  }, [activeIndex, virtualizer]);

  return (
    <section
      aria-label="Categories"
      data-pane="categories"
      className="flex min-h-0 flex-col border-r border-line px-3 pt-7"
    >
      <h2 className="mb-3 px-3 text-eyebrow-s text-text-faint uppercase">Categories</h2>
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto pb-6" role="list">
        <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((row) => {
            const item = items[row.index]!;
            return (
              <div
                key={item.type === "category" ? item.category.id : "hidden-header"}
                role="listitem"
                className="absolute inset-x-0 top-0"
                style={{ transform: `translateY(${row.start}px)`, height: ITEM }}
              >
                {item.type === "category" ? (
                  <CategoryItem category={item.category} active={item.category.id === active} />
                ) : (
                  <button
                    type="button"
                    aria-expanded={showHidden}
                    onClick={() => setShowHidden((v) => !v)}
                    className="mt-2 flex h-9 w-full items-center gap-2 rounded-control px-3 text-left text-caption font-medium text-text-dim transition-colors duration-(--duration-hover) hover:text-text-2"
                  >
                    <Icon icon={showHidden ? ArrowUp01Icon : ArrowDown01Icon} size={16} />
                    Hidden
                    <span className="ml-auto font-mono text-mono">{item.count}</span>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function CategoryItem({ category, active }: { category: CategoryView; active: boolean }) {
  const { id, name, hidden, builtIn } = category;
  return (
    <div className="group relative">
      <button
        type="button"
        data-category={id}
        aria-current={active || undefined}
        disabled={hidden}
        onClick={() => selectCategory(id)}
        className={`flex h-10 w-full items-center justify-between gap-2 rounded-control px-3 text-left text-small transition-colors duration-(--duration-hover) ease-out disabled:cursor-default ${
          active
            ? "bg-surface-active font-semibold text-text"
            : hidden
              ? "font-medium text-text-dim"
              : "font-medium text-text-muted hover:bg-surface hover:text-text-2"
        }`}
      >
        <span className="truncate">{name}</span>
        <span
          className={`flex-none font-mono text-mono text-text-dim ${
            builtIn
              ? ""
              : hidden
                ? "invisible"
                : "group-focus-within:invisible group-hover:invisible"
          }`}
        >
          {count.format(category.count)}
        </span>
      </button>
      {!builtIn && (
        <button
          type="button"
          aria-label={hidden ? `Show ${name}` : `Hide ${name}`}
          title={hidden ? "Show category" : "Hide category"}
          onClick={() => void setHidden(id, !hidden)}
          className={`absolute top-1 right-1 flex size-8 items-center justify-center rounded-chip text-text-muted transition-opacity duration-(--duration-hover) hover:bg-surface-raised hover:text-text focus-visible:opacity-100 ${
            hidden
              ? "opacity-100"
              : "opacity-0 group-focus-within:opacity-100 group-hover:opacity-100"
          }`}
        >
          <Icon icon={hidden ? ViewIcon : ViewOffIcon} size={16} />
        </button>
      )}
    </div>
  );
}
