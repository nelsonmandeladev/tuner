import type { TunerState } from "../../player/tuner";

/** What to tell the user when a stream fails (DESIGN.md "States": what went wrong, what to do). */
export function playerErrorMessage(error: string | null, inUse: TunerState["inUse"]): string {
  if (inUse) {
    return `Your subscription is in use on another device (${inUse.active} of ${inUse.max} connections). Stop it there, then try again.`;
  }
  return error ?? "The stream is not responding.";
}
