import { artIndex } from "@tuner/core";
import { useState } from "react";
import { artworkUrl } from "../data/artwork";

/**
 * A small 2:3 poster for list rows (search results, a person's titles): the
 * artwork through the image cache, or a tint from the title's hash when there
 * is none or it fails.
 */
export function PosterThumb({
  title,
  icon,
  size = "s",
}: {
  title: string;
  icon: string | null;
  /** "s": 27 × 40 (search rows). "m": 40 × 60 (sheet rows). */
  size?: "s" | "m";
}) {
  const src = artworkUrl(icon);
  const [failed, setFailed] = useState<string | null>(null);
  return (
    <span
      className={`relative flex-none overflow-hidden rounded-chip ${size === "m" ? "h-15 w-10" : "h-10 w-6.75"}`}
      style={{ background: `var(--art-${artIndex(title)}-tint)` }}
    >
      {src && failed !== src && (
        <img
          src={src}
          alt=""
          draggable={false}
          decoding="async"
          loading="lazy"
          className="absolute inset-0 size-full object-cover"
          onError={() => setFailed(src)}
        />
      )}
    </span>
  );
}
