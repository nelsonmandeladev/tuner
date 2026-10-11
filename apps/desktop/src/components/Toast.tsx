import { AnimatePresence, motion } from "motion/react";

interface ToastProps {
  /** The message, or null to hide the toast. */
  message: string | null;
}

/** DESIGN.md "Motion": panels in 200 ms, out 150 ms. */
const enter = { duration: 0.2, ease: [0.2, 0.8, 0.2, 1] } as const;
const exit = { duration: 0.15, ease: "easeIn" } as const;

/** Small status toast, top-centre of its positioned parent (DESIGN.md "States"). */
export function Toast({ message }: ToastProps) {
  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-6 flex justify-center"
      role="status"
      aria-live="polite"
    >
      <AnimatePresence>
        {message && (
          <motion.div
            key={message}
            className="rounded-chip bg-overlay-strong px-4 py-2 text-small font-medium text-text"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0, transition: enter }}
            exit={{ opacity: 0, y: -8, transition: exit }}
          >
            {message}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
