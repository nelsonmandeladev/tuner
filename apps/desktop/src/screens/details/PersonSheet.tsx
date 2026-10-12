import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { artIndex, monogram, splitTitleYear, yearOf, type PersonCredit } from "@tuner/core";
import { useNavigate } from "react-router";
import { IconButton } from "../../components/IconButton";
import { PosterThumb } from "../../components/PosterThumb";
import { Sheet } from "../../components/Sheet";
import { loadPersonCredits } from "../../data/details";
import { useAsync } from "../../hooks/useAsync";

export interface SheetPerson {
  name: string;
  role?: string;
}

/**
 * A person's other titles in the library, in a sheet on the right (M5
 * review), opened from a cast avatar. Series are all known; movies once
 * their page has been opened (the list API has no cast for movies).
 */
export function PersonSheet({
  person,
  from,
  onClose,
}: {
  person: SheetPerson | null;
  from: { kind: "vod" | "series"; id: number };
  onClose: () => void;
}) {
  return (
    <Sheet open={person !== null} onClose={onClose} label={person?.name ?? "Person"}>
      {person && <PersonTitles person={person} from={from} onClose={onClose} />}
    </Sheet>
  );
}

function PersonTitles({
  person,
  from,
  onClose,
}: {
  person: SheetPerson;
  from: { kind: "vod" | "series"; id: number };
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const credits = useAsync(() => loadPersonCredits(person.name, from), person.name);
  const list = credits.status === "ready" ? credits.value : [];
  const groups = [
    { label: "Movies", items: list.filter((c) => c.kind === "vod") },
    { label: "Series", items: list.filter((c) => c.kind === "series") },
  ].filter((g) => g.items.length > 0);

  const open = (credit: PersonCredit) => {
    onClose();
    void navigate(credit.kind === "vod" ? `/movies/${credit.id}` : `/series/${credit.id}`);
  };

  return (
    <>
      <header className="flex flex-none items-start gap-4 border-b border-line p-6">
        <span
          className="flex size-16 flex-none items-center justify-center rounded-full font-display text-heading font-extrabold text-text"
          style={{ background: `var(--art-${artIndex(person.name)}-tint)` }}
          aria-hidden
        >
          {monogram(person.name).slice(0, 2)}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1 pt-1.5">
          <span className="text-title">{person.name}</span>
          <span className="text-caption text-text-muted">
            {person.role ?? "Cast"}
            {credits.status === "ready" && (
              <>
                {" · "}
                <span className="font-mono">{list.length}</span> other{" "}
                {list.length === 1 ? "title" : "titles"} in your library
              </>
            )}
          </span>
        </span>
        <IconButton icon={Cancel01Icon} aria-label="Close" onClick={onClose} />
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4" data-person-titles>
        {credits.status === "loading" ? (
          <div className="flex flex-col gap-1" aria-busy aria-label="Loading titles">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex h-18 items-center gap-3.5 px-3">
                <span className="h-15 w-10 rounded-chip bg-surface-raised" />
                <span className="h-3.5 w-1/2 rounded-full bg-surface-raised" />
              </div>
            ))}
          </div>
        ) : groups.length === 0 ? (
          <p className="px-3 py-2 text-body text-text-muted">
            No other titles with {person.name} in your library yet.
          </p>
        ) : (
          groups.map((group) => (
            <section key={group.label} aria-label={group.label} className="pb-3">
              <h2 className="flex items-baseline justify-between px-3 pt-1 pb-2 text-eyebrow-s text-text-faint uppercase">
                {group.label}
                <span className="font-mono text-mono tracking-normal text-text-dim">
                  {group.items.length}
                </span>
              </h2>
              {group.items.map((credit) => {
                const { title, year } = splitTitleYear(credit.name);
                const shownYear = yearOf(credit.releaseDate) ?? year;
                return (
                  <button
                    key={`${credit.kind}:${credit.id}`}
                    type="button"
                    onClick={() => open(credit)}
                    className="flex h-18 w-full items-center gap-3.5 rounded-button px-3 text-left transition-colors duration-(--duration-hover) ease-out hover:bg-surface-selected"
                    data-credit={`${credit.kind}:${credit.id}`}
                  >
                    <PosterThumb title={title} icon={credit.image} size="m" />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate text-small font-semibold">{title}</span>
                      <span className="text-caption text-text-muted">
                        {credit.role === "director" ? "Director" : "Cast"}
                      </span>
                    </span>
                    {shownYear && (
                      <span className="flex-none font-mono text-mono text-text-dim">
                        {shownYear}
                      </span>
                    )}
                  </button>
                );
              })}
            </section>
          ))
        )}
        <p className="px-3 pt-2 text-caption text-text-dim">
          Movies are listed once their page has been opened; every series is.
        </p>
      </div>
    </>
  );
}
