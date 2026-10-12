import { artIndex, artLayout, monogram } from "@tuner/core";

interface GeneratedArtProps {
  name: string;
  /**
   * "monogram": channel art (LiveTV.dc.html preview). "poster": the title
   * bottom-left (Main.dc.html posters). "hero": no text, with the accent disc
   * (Series.dc.html and the Home hero).
   */
  variant?: "monogram" | "poster" | "hero";
  /** Must position the element (`relative`, `absolute inset-0`…). */
  className: string;
}

/**
 * The designed stand-in for missing art and for video that has not started
 * (DESIGN.md "Artwork"): a tint from the name's hash and soft circles placed
 * by a second hash, so the same title always gets the same art.
 */
export function GeneratedArt({ name, variant = "monogram", className }: GeneratedArtProps) {
  const { x, y } = artLayout(name);
  const n = artIndex(name);
  return (
    <div
      className={`overflow-hidden ${className}`}
      style={{ background: `var(--art-${n}-tint)` }}
      aria-hidden
    >
      {variant === "poster" ? (
        <>
          <div
            className="absolute aspect-square w-[80%] rounded-full"
            style={{
              background: `var(--art-${n}-shape)`,
              left: `${-20 + x * 60}%`,
              top: `${-15 + y * 45}%`,
            }}
          />
          <span className="absolute inset-x-3.5 bottom-3.5 line-clamp-4 font-display text-poster text-text">
            {name}
          </span>
        </>
      ) : variant === "hero" ? (
        <>
          <div
            className="absolute aspect-square w-[60%] rounded-full"
            style={{ background: `var(--art-${n}-shape)`, right: `${-8 - x * 8}%`, top: "-55%" }}
          />
          <div
            className="absolute aspect-square w-[34%] rounded-full bg-art-glow"
            style={{ right: `${18 + y * 8}%`, bottom: "-55%" }}
          />
          <div
            className="absolute aspect-square w-[12%] rounded-full bg-accent opacity-90"
            style={{ right: `${10 + x * 6}%`, top: `${18 + y * 10}%` }}
          />
        </>
      ) : (
        <>
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
        </>
      )}
    </div>
  );
}
