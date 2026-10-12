/**
 * Account actions the screens call (sidebar switcher, Settings → Accounts).
 * Leaving an account first saves where a movie or episode got to and stops
 * the stream: it belongs to the old account, and the resume point must land
 * in the old account's database before the library changes.
 */

import { flushResume } from "../player/vodSession";
import { resetTuner, stopPlayback } from "../player/tuner";
import { removeAccount, switchAccount, useSession, type RemovedFiles } from "./session";

async function leaveActiveAccount() {
  await flushResume();
  await stopPlayback();
  // Stopping records the last position once more; wait for that write too.
  await flushResume();
  resetTuner();
}

/** Makes `id` the active account (one click from the sidebar, SPEC §1). */
export async function chooseAccount(id: string): Promise<void> {
  if (useSession.getState().active?.id === id) return;
  await leaveActiveAccount();
  await switchAccount(id);
}

/** Removes `id` and everything it stored (Settings → Accounts → Remove). */
export async function deleteAccount(id: string): Promise<RemovedFiles> {
  if (useSession.getState().active?.id === id) await leaveActiveAccount();
  return removeAccount(id);
}
