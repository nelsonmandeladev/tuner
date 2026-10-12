import { useEffect, useState } from "react";
import { Button } from "../../components/Button";
import { Switch } from "../../components/Switch";
import { readAutoplayNext, writeAutoplayNext } from "../../data/details";
import { readHidden, unhide, type HiddenCategory } from "../../data/maintenance";
import { useSession } from "../../data/session";
import { Row, Section } from "./parts";

const KIND_LABEL = { live: "Live TV", vod: "Movies", series: "Series" } as const;
const count = new Intl.NumberFormat();

/** Settings → Content (SPEC §9), for the subscription in use. */
export function ContentSection() {
  const accountId = useSession((s) => s.active?.id);
  const libraryVersion = useSession((s) => s.libraryVersion);
  const [autoplay, setAutoplay] = useState<boolean | null>(null);
  const [hidden, setHidden] = useState<HiddenCategory[] | null>(null);

  useEffect(() => {
    let current = true;
    void Promise.all([readAutoplayNext(), readHidden()]).then(([on, list]) => {
      if (!current) return;
      setAutoplay(on);
      setHidden(list);
    });
    return () => {
      current = false;
    };
  }, [accountId, libraryVersion]);

  const show = async (category: HiddenCategory) => {
    await unhide(category.kind, category.id);
    setHidden((list) => list?.filter((c) => c !== category) ?? null);
  };

  return (
    <Section id="content" title="Content">
      <Row
        label="Play the next episode automatically"
        htmlFor="setting-autoplay"
        description="Starts after a 10-second countdown you can cancel. For the subscription in use."
        control={
          <Switch
            id="setting-autoplay"
            label="Play the next episode automatically"
            checked={autoplay ?? true}
            disabled={autoplay === null}
            onChange={(on) => {
              setAutoplay(on);
              void writeAutoplayNext(on);
            }}
          />
        }
      />
      <Row
        label="Hidden categories"
        description="Hidden categories disappear from Live TV, Movies, Series, Home and search. Hide one with the eye button beside it."
      >
        {hidden !== null && hidden.length === 0 && (
          <p className="text-caption text-text-faint">Nothing is hidden.</p>
        )}
        {hidden !== null && hidden.length > 0 && (
          <ul className="flex flex-col gap-1" data-hidden-categories>
            {hidden.map((category) => (
              <li
                key={`${category.kind}:${category.id}`}
                className="flex h-12 items-center gap-4 rounded-full bg-bg pr-1.5 pl-4.5"
              >
                <span className="w-18 flex-none text-eyebrow-s text-text-faint uppercase">
                  {KIND_LABEL[category.kind]}
                </span>
                <span className="min-w-0 flex-1 truncate text-small text-text">
                  {category.name}
                </span>
                <span className="font-mono text-mono text-text-dim">
                  {count.format(category.count)}
                </span>
                <Button size="sm" variant="ghost" onClick={() => void show(category)}>
                  Show
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Row>
    </Section>
  );
}
