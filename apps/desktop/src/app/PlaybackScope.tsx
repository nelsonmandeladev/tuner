import { useEffect } from "react";
import { useLocation } from "react-router";
import { startPlayer } from "../player/controller";
import { stopPlayback } from "../player/tuner";

/** Screens that play: the Live TV preview and the player share one stream. */
const PLAYING_ROUTES = ["/live", "/watch"];

/**
 * Stops the stream when the user leaves the screens that show it, so no
 * connection stays open in the background (one connection per subscription
 * is common). Starts mpv as soon as one of them opens, so the video hole
 * never shows the desktop through the transparent window.
 */
export function PlaybackScope() {
  const { pathname } = useLocation();
  const playing = PLAYING_ROUTES.some((route) => pathname.startsWith(route));
  useEffect(() => {
    if (playing) void startPlayer().catch(() => undefined);
    else void stopPlayback();
  }, [playing]);
  return null;
}
