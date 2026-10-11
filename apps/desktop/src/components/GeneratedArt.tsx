import { artIndex, artLayout, monogram } from "@tuner/core";

interface GeneratedArtProps {
  name: string;
  /** Must position the element (`relative`, `absolute inset-0`…). */
  className: string;
}

/**
 * The designed stand-in for missing art and for video that has not started
 * (DESIGN.md "Artwork"): a tint from the name's hash, two soft circles, and
 * the monogram bottom-left, as in the LiveTV.dc.html preview.
 */
export function GeneratedArt({ name, className }: GeneratedArtProps) {
  const { x, y } = artLayout(name);
  return (
    <div
      className={`overflow-hidden ${className}`}
      style={{ background: `var(--art-${artIndex(name)}-tint)` }}
      aria-hidden
    >
      <div
        className="absolute aspect-square w-[70%] rounded-full bg-art-glow"
        style={{ right: `${-10 - x * 16}%`, top: `${-30 - y * 20}%` }}
      />
      <div
        className="absolute aspect-square w-[40%] rounded-full bg-art-shade"
        style={{ left: `${4 + y * 10}%`, bottom: `${-24 - x * 12}%` }}
      />
      <span className="absolute bottom-3.5 left-4 font-display text-monogram-l text-text/90">
        {monogram(name)}
      </span>
    </div>
  );
}
