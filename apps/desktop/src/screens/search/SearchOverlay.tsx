import { Search01Icon } from "@hugeicons/core-free-icons";
import type { SearchHit, SearchKind } from "@tuner/core";
import { AnimatePresence, motion } from "motion/react";
import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router";
import { hasModKey } from "../../app/platform";
import { Button } from "../../components/Button";
import { ChannelLogo } from "../../components/ChannelLogo";
import { Icon } from "../../components/Icon";
import { Kbd } from "../../components/Kbd";
import { PosterThumb } from "../../components/PosterThumb";
import { closeSearch, prepareSearch, setQuery, useSearch } from "../../data/search";
import { chooseResult } from "./choose";

const count = new Intl.NumberFormat();
const GROUPS: { kind: SearchKind; label: string }[] = [
  { kind: "live", label: "Channels" },
  { kind: "vod", label: "Movies" },
  { kind: "series", label: "Series" },
];

/** DESIGN.md "Motion": panels in 200 ms, out 150 ms. */
const enter = { duration: 0.2, ease: [0.2, 0.8, 0.2, 1] } as const;
const exit = { duration: 0.15, ease: "easeIn" } as const;

/**
 * Search (SPEC §7), over any screen including the player: one field, results
 * as you type grouped by kind, arrows to move, Enter to open, Esc to close.
 * Not in the mockups; built in their language (see DESIGN.md "Search").
 */
export function SearchOverlay() {
  const open = useSearch((s) => s.open);
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="search"
          className="fixed inset-0 z-50 flex justify-center bg-overlay px-8 pt-28"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: enter }}
          exit={{ opacity: 0, transition: exit }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeSearch();
          }}
          data-search-overlay
        >
          <motion.div
            role="dialog"
            aria-modal
            aria-label="Search"
            className="flex h-fit max-h-[76vh] w-full max-w-180 flex-col overflow-hidden rounded-card border border-line-strong bg-surface text-text"
            initial={{ y: -8 }}
            animate={{ y: 0, transition: enter }}
            exit={{ y: -8, transition: exit }}
          >
            <SearchPanel />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function SearchPanel() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const status = useSearch((s) => s.status);
  const query = useSearch((s) => s.query);
  const results = useSearch((s) => s.results);
  const resultsFor = useSearch((s) => s.resultsFor);
  const [active, setActive] = useState(0);
  const list = useRef<HTMLDivElement>(null);

  // Restore focus where it was (a channel row, a poster) on close.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    return () => previous?.focus({ preventScroll: true });
  }, []);

  const hits = useMemo(
    () => (results ? GROUPS.flatMap(({ kind }) => results[kind]) : []),
    [results],
  );
  const activeIndex = Math.min(active, Math.max(0, hits.length - 1));

  useEffect(() => {
    list.current
      ?.querySelector(`[data-result-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, results]);

  const choose = (hit: SearchHit | undefined) => {
    if (!hit) return;
    closeSearch();
    void chooseResult(hit, navigate, pathname);
  };

  return (
    <div
      className="flex min-h-0 flex-col"
      onKeyDown={(event) => {
        // Keys typed here belong to search, not to the screen or the player underneath.
        event.stopPropagation();
        if (
          event.key === "Escape" ||
          (hasModKey(event.nativeEvent) && event.key.toLowerCase() === "k")
        ) {
          event.preventDefault();
          closeSearch();
        } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          if (hits.length === 0) return;
          const step = event.key === "ArrowDown" ? 1 : -1;
          setActive((activeIndex + step + hits.length) % hits.length);
        } else if (event.key === "Enter") {
          event.preventDefault();
          choose(hits[activeIndex]);
        }
      }}
    >
      <label className="flex h-16 flex-none items-center gap-3 border-b border-line px-5">
        <Icon icon={Search01Icon} className="flex-none text-text-muted" />
        <input
          autoFocus
          type="text"
          value={query}
          onChange={(event) => {
            setActive(0);
            setQuery(event.target.value);
          }}
          placeholder="Search channels, movies and series"
          aria-label="Search channels, movies and series"
          aria-controls="search-results"
          aria-activedescendant={hits.length > 0 ? `search-result-${activeIndex}` : undefined}
          spellCheck={false}
          autoComplete="off"
          className="min-w-0 flex-1 bg-transparent text-body-l text-text outline-none placeholder:text-text-placeholder"
          data-search-input
        />
        <Kbd>Esc</Kbd>
      </label>

      <div
        ref={list}
        id="search-results"
        role="listbox"
        aria-label="Results"
        className="min-h-0 overflow-y-auto px-3 py-3"
        data-search-results
        data-results-for={resultsFor}
      >
        {status === "error" ? (
          <Message text="Search is not available right now.">
            <Button variant="ghost" onClick={() => void prepareSearch()}>
              Try again
            </Button>
          </Message>
        ) : status !== "ready" && query.trim() !== "" ? (
          <Skeleton />
        ) : query.trim() === "" ? (
          <Message text="Type a channel, a movie or a series. Accents and small typos are fine." />
        ) : results && hits.length === 0 && resultsFor === query ? (
          <Message text={`Nothing matches “${query.trim()}”.`} />
        ) : (
          results &&
          (() => {
            let index = 0;
            return GROUPS.map(({ kind, label }) =>
              results[kind].length === 0 ? null : (
                <section key={kind} aria-label={label} className="pb-2" data-result-group={kind}>
                  <h2 className="flex items-baseline justify-between px-3 pt-2 pb-1.5 text-eyebrow-s text-text-faint uppercase">
                    {label}
                    <span className="font-mono text-mono tracking-normal text-text-dim">
                      {count.format(results.total[kind])}
                    </span>
                  </h2>
                  {results[kind].map((hit) => {
                    const i = index++;
                    return (
                      <ResultRow
                        key={`${hit.kind}:${hit.id}`}
                        hit={hit}
                        index={i}
                        active={i === activeIndex}
                        onHover={setActive}
                        onChoose={choose}
                      />
                    );
                  })}
                </section>
              ),
            );
          })()
        )}
      </div>

      <div className="flex flex-none items-center gap-4 border-t border-line px-5 py-3 text-caption text-text-dim">
        <span className="flex items-center gap-1.5">
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd>
          Move
        </span>
        <span className="flex items-center gap-1.5">
          <Kbd>Enter</Kbd>
          Open
        </span>
        <span className="flex items-center gap-1.5">
          <Kbd>Esc</Kbd>
          Close
        </span>
      </div>
    </div>
  );
}

const ResultRow = memo(function ResultRow({
  hit,
  index,
  active,
  onHover,
  onChoose,
}: {
  hit: SearchHit;
  index: number;
  active: boolean;
  onHover: (index: number) => void;
  onChoose: (hit: SearchHit) => void;
}) {
  const detail = hit.kind === "live" ? hit.num : hit.year;
  return (
    <div
      id={`search-result-${index}`}
      role="option"
      aria-selected={active}
      tabIndex={-1}
      onMouseMove={() => !active && onHover(index)}
      onClick={() => onChoose(hit)}
      className={`flex h-13 cursor-pointer items-center gap-3.5 rounded-button border px-3 transition-colors duration-(--duration-hover) ease-out ${
        active ? "border-line-outline bg-surface-selected" : "border-transparent"
      }`}
      data-result-index={index}
      data-result={`${hit.kind}:${hit.id}`}
    >
      {hit.kind === "live" ? (
        <ChannelLogo name={hit.title} icon={hit.icon} />
      ) : (
        <PosterThumb title={hit.title} icon={hit.icon} />
      )}
      <span className="min-w-0 flex-1 truncate text-small font-semibold">{hit.title}</span>
      {detail !== null && (
        <span className="flex-none font-mono text-mono text-text-dim">{detail}</span>
      )}
    </div>
  );
});

function Message({ text, children }: { text: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-4 px-3 py-4">
      <p className="text-body text-text-muted">{text}</p>
      {children}
    </div>
  );
}

/** Loading (DESIGN.md "States"): rows in their final shape while the index gets ready. */
function Skeleton() {
  return (
    <div className="flex flex-col gap-1" aria-busy aria-label="Preparing search">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex h-13 items-center gap-3.5 px-3">
          <span className="size-10 rounded-field bg-surface-raised" />
          <span className="h-3.5 w-1/2 rounded-full bg-surface-raised" />
        </div>
      ))}
    </div>
  );
}
