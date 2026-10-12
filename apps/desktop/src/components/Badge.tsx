import type { ReactNode } from "react";

/** The LIVE pill: red dot and text on a dark chip (DESIGN.md `Badge`). */
export function LiveBadge({ size = "player" }: { size?: "preview" | "player" }) {
  return size === "player" ? (
    <span
      data-theme="dark"
      className="inline-flex h-8 items-center gap-2 rounded-control bg-overlay px-3 text-caption font-semibold"
    >
      <span className="size-2 rounded-full bg-live" />
      LIVE
    </span>
  ) : (
    <span
      data-theme="dark"
      className="inline-flex h-6.5 items-center gap-1.5 rounded-chip bg-overlay-preview px-2.5 text-mono font-semibold"
    >
      <span className="size-1.75 rounded-full bg-live" />
      LIVE
    </span>
  );
}

/** Outline badge, e.g. "Catch-up" on channel rows. */
export function OutlineBadge({ children }: { children: ReactNode }) {
  return (
    <span className="flex-none rounded-kbd border border-line-outline px-1.5 py-px text-badge text-text-2">
      {children}
    </span>
  );
}

/** A chip on video: stream info, "Catch-up". */
export function MediaChip({ children, mono = false }: { children: ReactNode; mono?: boolean }) {
  return (
    <span
      data-theme="dark"
      className={`inline-flex h-8 items-center gap-2 rounded-control bg-overlay px-3 text-text-2 ${
        mono ? "font-mono text-mono" : "text-caption font-semibold"
      }`}
    >
      {children}
    </span>
  );
}
