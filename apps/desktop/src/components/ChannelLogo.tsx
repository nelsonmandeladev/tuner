import { artIndex, monogram } from "@tuner/core";
import { memo, useState } from "react";
import { artworkUrl } from "../data/artwork";

interface ChannelLogoProps {
  name: string;
  icon: string | null;
  /** 40 in lists, 44 in the player (DESIGN.md "Spacing and sizes"). */
  size?: 40 | 44;
}

/**
 * DESIGN.md `ChannelLogo`: the provider's logo through the image cache on a
 * `--surface` tile, or a monogram on a tint from the name's hash when the
 * logo is missing or fails to load.
 */
export const ChannelLogo = memo(function ChannelLogo({ name, icon, size = 40 }: ChannelLogoProps) {
  const src = artworkUrl(icon);
  const [failed, setFailed] = useState<string | null>(null);
  const box = size === 44 ? "size-11" : "size-10";

  if (src && failed !== src) {
    return (
      // Provider logos are drawn for dark grounds: the tile stays dark in the light theme.
      <span
        data-theme="dark"
        className={`${box} flex flex-none items-center justify-center rounded-field bg-surface p-1.5`}
      >
        <img
          src={src}
          alt=""
          draggable={false}
          decoding="async"
          className="size-full object-contain"
          onError={() => setFailed(src)}
        />
      </span>
    );
  }
  return (
    <span
      data-theme="dark"
      className={`${box} flex flex-none items-center justify-center rounded-field font-display font-extrabold tracking-tight text-text ${
        size === 44 ? "text-caption" : "text-mono"
      }`}
      style={{ background: `var(--art-${artIndex(name)}-tint)` }}
      aria-hidden
    >
      {monogram(name)}
    </span>
  );
});
