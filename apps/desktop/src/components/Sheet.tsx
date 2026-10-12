import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, type ReactNode } from "react";

/** DESIGN.md "Motion": panels in 200 ms, out 150 ms. */
const enter = { duration: 0.2, ease: [0.2, 0.8, 0.2, 1] } as const;
const exit = { duration: 0.15, ease: "easeIn" } as const;

interface SheetProps {
  open: boolean;
  onClose: () => void;
  /** Names the dialog for screen readers. */
  label: string;
  children: ReactNode;
}

/**
 * A panel that slides in from the right over a scrim (M5 review: a person's
 * titles). Esc, the scrim or the close button closes it; focus moves into it
 * and goes back where it was.
 */
export function Sheet({ open, onClose, label, children }: SheetProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="sheet"
          className="fixed inset-0 z-40 bg-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: enter }}
          exit={{ opacity: 0, transition: exit }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) onClose();
          }}
          data-sheet
        >
          <motion.div
            role="dialog"
            aria-modal
            aria-label={label}
            className="absolute inset-y-0 right-0 flex w-110 max-w-full flex-col border-l border-line-strong bg-surface text-text"
            initial={{ x: "100%" }}
            animate={{ x: 0, transition: enter }}
            exit={{ x: "100%", transition: exit }}
          >
            <SheetFocus onClose={onClose}>{children}</SheetFocus>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function SheetFocus({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLElement>("button, [href]")?.focus({ preventScroll: true });
    return () => previous?.focus({ preventScroll: true });
  }, []);
  return (
    <div
      ref={panel}
      className="flex min-h-0 flex-1 flex-col"
      onKeyDown={(event) => {
        // The screen underneath does not see keys pressed in the sheet.
        event.stopPropagation();
        if (event.key === "Escape") {
          event.preventDefault();
          onClose();
        }
      }}
    >
      {children}
    </div>
  );
}
