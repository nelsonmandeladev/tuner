/**
 * Provider titles carry packaging around the real name: a language prefix
 * ("FR ★ ", "|EN| "), the year ("Title - 2023", "Title (2023)") and quality
 * tags ("[4K]", "(MULTI)"). The list API has no year field, so the grid reads
 * it from here; screens show the clean title and the tags as metadata.
 */

/** "FR ★ ", "FR ❖ ", "VIP ✪ ", "|FR| ", "[UK] ", "FR: ", "FR - ". */
const PREFIX =
  /^\s*(?:[|[(]\s*[A-Za-z]{2,4}\s*[|\])]|[A-Za-z]{2,4}\s*[★☆❖✪✦◉●•♦:|]|[A-Za-z]{2,3}\s+-)\s*/u;
/** A trailing "[4K]", "(MULTI)", "{BK}". */
const TRAILING_TAG = /\s*[[({]\s*([^\])}]{1,16}?)\s*[\])}]\s*$/;
/** A trailing "- 2023", "(2023)" or bare "2023" after a separator. */
const TRAILING_YEAR = /\s*(?:-\s*|\(\s*)((?:19|20)\d\d)\s*\)?\s*$/;

export interface TitleYear {
  title: string;
  year: number | null;
  /** Tags removed from the end, in reading order ("4K", "MULTI"). */
  tags: string[];
}

export function splitTitleYear(name: string): TitleYear {
  let rest = name.trim().replace(PREFIX, "");
  let year: number | null = null;
  const tags: string[] = [];
  for (;;) {
    const tag = TRAILING_TAG.exec(rest);
    if (tag && tag.index > 0) {
      const value = tag[1]!.trim();
      if (/^(?:19|20)\d\d$/.test(value) && year === null) year = Number(value);
      else tags.unshift(value);
      rest = rest.slice(0, tag.index);
      continue;
    }
    const match = year === null ? TRAILING_YEAR.exec(rest) : null;
    if (match && match.index > 0) {
      year = Number(match[1]);
      rest = rest.slice(0, match.index);
      continue;
    }
    break;
  }
  const title = rest.trim();
  return title === "" ? { title: name.trim(), year: null, tags: [] } : { title, year, tags };
}

/** The year of a date string such as "2025-03-14" or "2025". */
export function yearOf(date: string | null): number | null {
  const match = date ? /\b((?:19|20)\d\d)\b/.exec(date) : null;
  return match ? Number(match[1]) : null;
}

const EPISODE_CODE = /^(?:S\d{1,3}\s*E\d{1,4}|\d{1,3}x\d{1,4}|E\d{1,4})\b/i;

/**
 * An episode's own title: providers often send "FR ★ Series - S01E01 - Pilot".
 * Drops the prefix, the series name and the episode code. Null when nothing
 * is left (the screen then shows the code).
 */
export function episodeTitle(raw: string | null, seriesTitle: string): string | null {
  if (!raw) return null;
  let rest = raw.trim().replace(PREFIX, "");
  const lower = rest.toLocaleLowerCase();
  const series = seriesTitle.trim().toLocaleLowerCase();
  if (series && lower.startsWith(series)) rest = rest.slice(series.length);
  rest = rest.replace(/^[\s\-–:|.]+/, "");
  if (EPISODE_CODE.test(rest)) rest = rest.replace(EPISODE_CODE, "").replace(/^[\s\-–:|.]+/, "");
  rest = rest.trim();
  return rest === "" ? null : rest;
}
