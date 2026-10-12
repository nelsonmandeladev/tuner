import { ArrowLeft01Icon } from "@hugeicons/core-free-icons";
import { useState, type ReactNode } from "react";
import { GeneratedArt } from "../../components/GeneratedArt";
import { Icon } from "../../components/Icon";
import { artworkUrl } from "../../data/artwork";

interface HeroProps {
  name: string;
  /** Backdrop artwork; generated hero art when missing or broken. */
  backdrop: string | null;
  backLabel: string;
  onBack: () => void;
  /** A poster shown on the right when there is no backdrop. */
  poster?: string | null;
  children: ReactNode;
}

/**
 * DESIGN.md `Hero` (Series.dc.html): backdrop art under a left-to-right scrim
 * and a fade into the page, a Back link, then the eyebrow, title, plot and
 * actions the page passes in.
 */
export function Hero({ name, backdrop, backLabel, onBack, poster, children }: HeroProps) {
  const backdropSrc = artworkUrl(backdrop);
  const posterSrc = artworkUrl(poster);
  const [failed, setFailed] = useState<string[]>([]);
  const showBackdrop = backdropSrc && !failed.includes(backdropSrc);
  const showPoster = !showBackdrop && posterSrc && !failed.includes(posterSrc);

  return (
    <section className="relative flex min-h-100 overflow-hidden" data-hero>
      {showBackdrop ? (
        <img
          src={backdropSrc}
          alt=""
          className="absolute inset-0 size-full object-cover"
          onError={() => setFailed((f) => [...f, backdropSrc])}
        />
      ) : (
        <GeneratedArt name={name} variant="hero" className="absolute inset-0" />
      )}
      <div className="absolute inset-0 bg-(image:--scrim-hero)" />
      <div className="absolute inset-x-0 bottom-0 h-30 bg-(image:--scrim-hero-bottom)" />
      {showPoster && (
        <img
          src={posterSrc}
          alt=""
          className="absolute top-8 right-12 bottom-9 hidden aspect-[2/3] rounded-poster object-cover xl:block"
          onError={() => setFailed((f) => [...f, posterSrc])}
        />
      )}
      <div className="relative flex w-full max-w-170 flex-col justify-between gap-8 px-12 pt-8 pb-9">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex h-9 items-center gap-2 self-start rounded-control bg-ghost-soft pr-3.5 pl-2.5 text-small font-medium text-text transition-colors duration-(--duration-hover) hover:bg-ghost"
        >
          <Icon icon={ArrowLeft01Icon} size={16} />
          {backLabel}
        </button>
        <div className="flex flex-col gap-4">{children}</div>
      </div>
    </section>
  );
}

/** "2025 · Drama · 2 seasons · ★ 7.8": numbers in mono (DESIGN.md "Type"). */
export function HeroMeta({ parts }: { parts: { text: string; mono?: boolean }[] }) {
  const shown = parts.filter((p) => p.text);
  return (
    <span className="flex flex-wrap gap-2.5 text-small text-text-soft" data-hero-meta>
      {shown.map((part, i) => (
        <span key={i} className="contents">
          {i > 0 && <span aria-hidden>·</span>}
          <span className={part.mono ? "font-mono" : ""}>{part.text}</span>
        </span>
      ))}
    </span>
  );
}
