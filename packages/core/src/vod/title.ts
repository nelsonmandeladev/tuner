/**
 * Provider movie names usually carry the year: "Title - 2023" (98% of the
 * test provider's movies) or "Title (2023)". The list API has no year field,
 * so the grid reads it from the name.
 */

const TRAILING_YEAR = /^(.*?)\s*(?:-\s*|\(\s*)((?:19|20)\d\d)\s*\)?\s*$/;

export interface TitleYear {
  title: string;
  year: number | null;
}

export function splitTitleYear(name: string): TitleYear {
  const match = TRAILING_YEAR.exec(name.trim());
  if (match && match[1]!.trim() !== "") return { title: match[1]!.trim(), year: Number(match[2]) };
  return { title: name.trim(), year: null };
}

/** The year of a date string such as "2025-03-14" or "2025". */
export function yearOf(date: string | null): number | null {
  const match = date ? /\b((?:19|20)\d\d)\b/.exec(date) : null;
  return match ? Number(match[1]) : null;
}
