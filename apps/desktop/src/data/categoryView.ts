/** A category as the category lists show it (Live TV, Movies, Series). */
export interface CategoryView {
  id: string;
  name: string;
  count: number;
  hidden: boolean;
  /** Built-in entries (Favorites, All…): cannot be hidden. */
  builtIn: boolean;
}
