/**
 * Generated artwork (docs/DESIGN.md "Artwork"): when a logo or poster is
 * missing, screens draw a monogram on a tint picked from a fixed palette. The
 * choice comes from a hash of the name, so the same channel always gets the
 * same art on every platform.
 */

/** Number of tint/shape pairs in the design palette. */
export const ART_PALETTE_SIZE = 8;

/** FNV-1a: small, stable across platforms, good enough to spread names over 8 tints. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Palette index (0–7) for a name. */
export function artIndex(name: string): number {
  return hash(name.trim().toLowerCase()) % ART_PALETTE_SIZE;
}

/** A second hash, for where the decorative circles sit (0–1 each). */
export function artLayout(name: string): { x: number; y: number } {
  const h = hash(`${name}#layout`);
  return { x: (h & 0xff) / 255, y: ((h >>> 8) & 0xff) / 255 };
}

/** Provider prefixes like "FR:", "|FR|", "[UK]", "FR -" carry no identity. */
const COUNTRY_PREFIX =
  /^\s*(?:[|[(]\s*[A-Za-z]{2,4}\s*[|\])]|[A-Za-z]{2,4}\s*[:|]|[A-Za-z]{2,3}\s+-)\s*/;
/** Quality and codec tags: not part of a channel's name. */
const QUALITY = /^(?:hd|fhd|uhd|sd|4k|8k|hevc|h265|h264|hq|lq|raw|vip|\d{3,4}p|50fps|60fps)$/i;

/**
 * Up to three letters for a channel tile: "Sport 1 HD" → "SP1",
 * "Afro Sport" → "AS", "Eurosport" → "EUR". Prefixes, quality tags and
 * punctuation are dropped first.
 */
export function monogram(name: string): string {
  const words = name
    .replace(COUNTRY_PREFIX, "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^A-Za-z0-9]+/)
    .filter((w) => w !== "" && !QUALITY.test(w));
  if (words.length === 0) return name.trim().charAt(0).toUpperCase() || "?";
  const [first, second, third] = words as [string, ...string[]];
  let mark: string;
  if (second !== undefined && /^\d+$/.test(second)) {
    mark = first.slice(0, /^\d+$/.test(first) ? first.length : 2) + second;
  } else if (second === undefined) {
    mark = first.slice(0, 3);
  } else {
    mark = [first, second, third]
      .filter((w): w is string => w !== undefined)
      .map((w) => (/^\d+$/.test(w) ? w : w.charAt(0)))
      .join("");
  }
  return mark.slice(0, 3).toUpperCase();
}
