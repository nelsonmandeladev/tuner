import { stepChannel } from "@tuner/core";

/** The channels above and below in the zap list (null when the list has one channel). */
export function neighbours(list: readonly number[], id: number) {
  if (list.length < 2) return { prev: null, next: null };
  return { prev: stepChannel(list, id, -1), next: stepChannel(list, id, 1) };
}
