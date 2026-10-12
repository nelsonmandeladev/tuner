import { useEffect } from "react";
import { useLocation } from "react-router";
import { startPlayer } from "../player/controller";
import { stopPlayback } from "../player/tuner";
// Resume points and next episode for movies and series.
import "../player/vodSession";

/** Screens that play: the Live TV preview and the player share one stream. */
const PLAYING_ROUTES = ["/live", "/watch"];

/**
 * Stops the stream when the user leaves the screens that show it, so no
 * connection stays open in the background (one connection per subscription
 * is common).
 *
 * Also creates the mpv instance shortly after start, whatever the screen:
 * creating it takes ~400 ms (seen in M4), which the first Play would
 * otherwise wait for, and the video hole must never show the desktop
 * through the transparent window.
 */
export function PlaybackScope() {
  const { pathname } = useLocation();
  const playing = PLAYING_ROUTES.some((route) => pathname.startsWith(route));
  useEffect(() => {
    const timer = setTimeout(() => void startPlayer().catch(() => undefined), 500);
    return () => clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (playing) void startPlayer().catch(() => undefined);
    else void stopPlayback();
  }, [playing]);
  return null;
}
