import { episodeTitle } from "@tuner/core";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "../../components/Button";
import { ProgressBar } from "../../components/ProgressBar";
import { useNow } from "../../data/epg";
import { useTuner } from "../../player/tuner";
import { UP_NEXT_COUNTDOWN_MS, cancelUpNext, playNext } from "../../player/vodSession";

const enter = { duration: 0.2, ease: [0.2, 0.8, 0.2, 1] } as const;
const exit = { duration: 0.15, ease: "easeIn" } as const;

/**
 * When an episode ends (SPEC §6): the next one, a 10-second countdown and a
 * cancel button. With autoplay off, it waits for "Play next".
 */
export function UpNextCard() {
  const upNext = useTuner((s) => s.upNext);
  const series = useTuner((s) => s.media?.series ?? null);
  const now = useNow(200);
  const left = upNext?.playsAt ? Math.max(0, upNext.playsAt - now) : null;
  const episode = upNext?.episode;
  const code = episode
    ? [
        episode.season !== null ? `S${episode.season}` : null,
        episode.episodeNum !== null ? `E${episode.episodeNum}` : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : "";

  return (
    <AnimatePresence>
      {episode && (
        <motion.aside
          aria-label="Next episode"
          role="alertdialog"
          className="absolute right-10 bottom-36 flex w-90 flex-col gap-4 rounded-card bg-overlay-strong p-5"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0, transition: enter }}
          exit={{ opacity: 0, transition: exit }}
          data-up-next
        >
          <div className="flex flex-col gap-1">
            <span className="text-eyebrow-s text-accent uppercase">Next episode</span>
            <span className="font-mono text-caption text-text-2">{code}</span>
            <span className="line-clamp-2 text-body-l font-semibold">
              {(series && episodeTitle(episode.title, series.name)) ?? code}
            </span>
          </div>
          {left !== null && (
            <div className="flex flex-col gap-2">
              <span className="text-caption text-text-2" data-up-next-countdown>
                Playing in {Math.ceil(left / 1000)} s
              </span>
              <ProgressBar
                tone="media"
                thumb={false}
                value={1 - left / UP_NEXT_COUNTDOWN_MS}
                label="Countdown"
              />
            </div>
          )}
          <div className="flex gap-2.5 [&>button]:flex-1">
            <Button onClick={() => playNext()}>{left !== null ? "Play now" : "Play next"}</Button>
            <Button variant="ghost" onClick={cancelUpNext}>
              Cancel
            </Button>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
