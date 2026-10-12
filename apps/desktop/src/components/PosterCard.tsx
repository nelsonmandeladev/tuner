import { memo, useState } from "react";
import type { PosterItem } from "../data/catalog";
import { artworkUrl } from "../data/artwork";
import { GeneratedArt } from "./GeneratedArt";

interface PosterCardProps {
  item: PosterItem;
  /** 0–1 resume progress, drawn along the poster's bottom edge. */
  progress?: number;
  focused: boolean;
  onOpen: (id: number) => void;
  onFocus: (id: number) => void;
}

/**
 * DESIGN.md `PosterCard`: 2:3, radius 16; the provider's poster through the
 * image cache, or generated art with the title bottom-left when it is missing
 * or broken. Genre (series) or rating (movies) and the year below.
 */
export const PosterCard = memo(function PosterCard({
  item,
  progress = 0,
  focused,
  onOpen,
  onFocus,
}: PosterCardProps) {
  const src = artworkUrl(item.image);
  const [failed, setFailed] = useState<string | null>(null);
  const left = item.genre ?? (item.rating ? `★ ${item.rating.toFixed(1)}` : "");

  return (
    <button
      type="button"
      data-poster={item.id}
      tabIndex={focused ? 0 : -1}
      title={item.name}
      aria-label={[item.title, item.year].filter(Boolean).join(", ")}
      onClick={() => onOpen(item.id)}
      onFocus={() => onFocus(item.id)}
      className="group flex w-full min-w-0 flex-col gap-2.5 text-left text-text focus-visible:outline-none"
    >
      <span className="relative block aspect-[2/3] w-full overflow-hidden rounded-poster bg-surface transition-transform duration-160 ease-out group-hover:scale-[1.02] group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-accent motion-reduce:transition-none">
        {src && failed !== src ? (
          <img
            src={src}
            alt=""
            draggable={false}
            decoding="async"
            loading="lazy"
            className="absolute inset-0 size-full object-cover"
            onError={() => setFailed(src)}
          />
        ) : (
          <GeneratedArt name={item.title} variant="poster" className="absolute inset-0" />
        )}
        {progress > 0 && (
          <span className="absolute inset-x-0 bottom-0 h-1 bg-track-on-media">
            <span
              className="block h-full bg-accent"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </span>
        )}
      </span>
      <span className="flex justify-between gap-2 text-caption text-text-muted">
        <span className="truncate">{left}</span>
        {item.year && <span className="flex-none font-mono">{item.year}</span>}
      </span>
    </button>
  );
});
