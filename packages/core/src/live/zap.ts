/**
 * Channel order for zapping (SPEC "Player"): up and down move inside the
 * current list and wrap at its ends, like a TV remote.
 */

/** The id `delta` places away from `current` in `ids`, wrapping. Null for an empty list. */
export function stepChannel(ids: readonly number[], current: number, delta: number): number | null {
  if (ids.length === 0) return null;
  const index = ids.indexOf(current);
  if (index === -1) return ids[delta >= 0 ? 0 : ids.length - 1]!;
  const next = (((index + delta) % ids.length) + ids.length) % ids.length;
  return ids[next]!;
}

/** Digits typed for a channel number; longer entries can't be a channel. */
export const MAX_CHANNEL_DIGITS = 7;

/** Adds a typed digit to the number buffer, keeping at most `MAX_CHANNEL_DIGITS`. */
export function appendDigit(buffer: string, digit: string): string {
  if (!/^\d$/.test(digit)) return buffer;
  return (buffer + digit).slice(-MAX_CHANNEL_DIGITS);
}
