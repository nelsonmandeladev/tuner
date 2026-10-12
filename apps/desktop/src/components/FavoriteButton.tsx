import { FavouriteIcon } from "@hugeicons/core-free-icons";
import type { ContentKind } from "@tuner/core";
import { toggleFavorite, useIsFavorite } from "../data/favorites";
import { Icon } from "./Icon";

interface FavoriteButtonProps {
  kind: ContentKind;
  id: number;
  /** Used in the label: "Add Arena to favorites". */
  name: string;
  /**
   * "surface": on a panel (Live TV preview, LiveTV.dc.html). "media": on
   * artwork (detail heroes, Series.dc.html).
   */
  tone?: "surface" | "media";
}

/**
 * The heart, the same everywhere (SPEC §8): 48 px next to a 48 px button, an
 * outline when off and a filled accent heart when on. Reads and writes the
 * shared favorites store, so every screen showing the item agrees.
 */
export function FavoriteButton({ kind, id, name, tone = "surface" }: FavoriteButtonProps) {
  const favorite = useIsFavorite(kind, id);
  return (
    <button
      type="button"
      aria-label={favorite ? `Remove ${name} from favorites` : `Add ${name} to favorites`}
      aria-pressed={favorite}
      data-favorite
      onClick={() => void toggleFavorite(kind, id)}
      className={`flex size-12 flex-none items-center justify-center rounded-full transition-colors duration-(--duration-hover) ease-out ${
        tone === "surface"
          ? "border border-line-strong bg-surface hover:bg-surface-raised"
          : "bg-ghost hover:bg-ghost-strong"
      } ${favorite ? "text-accent" : "text-text"}`}
    >
      <Icon icon={FavouriteIcon} className={favorite ? "[&_path]:fill-current" : ""} />
    </button>
  );
}
