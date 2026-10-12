import type { SearchHit } from "@tuner/core";
import type { NavigateFunction } from "react-router";
import { loadLive, revealChannel, useLive } from "../../data/live";
import { exitPlayer } from "../../player/fullscreen";
import { tune, useTuner } from "../../player/tuner";

/**
 * Goes where a search result belongs (SPEC §7): a channel plays (in the
 * player when the player is open, else in Live TV's preview); a movie or a
 * series opens its detail page.
 */
export async function chooseResult(hit: SearchHit, navigate: NavigateFunction, pathname: string) {
  const inPlayer = pathname.startsWith("/watch");
  if (hit.kind === "live") {
    await loadLive();
    if (!useLive.getState().channels.has(hit.id)) return;
    if (inPlayer) {
      // Zapping then walks the list the player was on, if it has the channel.
      const { list } = useTuner.getState();
      const live = useLive.getState().list;
      tune(hit.id, {
        list: list.includes(hit.id) ? list : live.includes(hit.id) ? live : [hit.id],
      });
      return;
    }
    revealChannel(hit.id);
    if (pathname !== "/live") void navigate("/live");
    return;
  }
  if (inPlayer) await exitPlayer();
  // From the player the page takes the player's place in the history, so Back skips it.
  void navigate(hit.kind === "vod" ? `/movies/${hit.id}` : `/series/${hit.id}`, {
    replace: inPlayer,
  });
}
