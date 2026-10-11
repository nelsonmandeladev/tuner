import { AnimatePresence, motion } from "motion/react";
import { useTuner } from "../../player/tuner";

const enter = { duration: 0.2, ease: [0.2, 0.8, 0.2, 1] } as const;
const exit = { duration: 0.15, ease: "easeIn" } as const;

/**
 * The channel number being typed (SPEC "Player": 0–9 jump to a channel). It
 * stays up until typing pauses or Enter is pressed.
 */
export function NumberEntry({ onVideo = false }: { onVideo?: boolean }) {
  const digits = useTuner((s) => s.digits);
  return (
    <div
      className={`pointer-events-none absolute flex ${onVideo ? "top-28 right-10" : "top-6 right-8"}`}
      role="status"
      aria-live="polite"
    >
      <AnimatePresence>
        {digits && (
          <motion.div
            className="flex items-baseline gap-2 rounded-button bg-overlay-strong px-5 py-3"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0, transition: enter }}
            exit={{ opacity: 0, transition: exit }}
            data-number-entry
          >
            <span className="text-eyebrow-s text-text-muted uppercase">Channel</span>
            <span className="font-mono text-title text-text">
              {digits}
              <span className="text-accent motion-safe:animate-pulse">_</span>
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
