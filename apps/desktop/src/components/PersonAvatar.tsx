import { artIndex, monogram } from "@tuner/core";

interface PersonAvatarProps {
  name: string;
  /** Under the name, e.g. "Director". */
  role?: string;
}

/**
 * A person on a detail page (M5 review): a fully rounded avatar, the name and
 * an optional role. Providers send names only, so the avatar is the person's
 * initials on a tint from the artwork palette (DESIGN.md "Artwork").
 */
export function PersonAvatar({ name, role }: PersonAvatarProps) {
  return (
    <div className="flex w-24 flex-none flex-col items-center gap-2.5 text-center" data-person>
      <span
        className="flex size-18 items-center justify-center rounded-full font-display text-heading font-extrabold text-text"
        style={{ background: `var(--art-${artIndex(name)}-tint)` }}
        aria-hidden
      >
        {monogram(name).slice(0, 2)}
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="line-clamp-2 text-caption font-medium text-text-2">{name}</span>
        {role && <span className="text-mono text-text-dim">{role}</span>}
      </span>
    </div>
  );
}
