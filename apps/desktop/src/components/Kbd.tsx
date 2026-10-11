import type { ReactNode } from "react";

interface KbdProps {
  children: ReactNode;
  /** On video: lighter outline and text (Player.dc.html). */
  onMedia?: boolean;
  className?: string;
}

export function Kbd({ children, onMedia = false, className = "" }: KbdProps) {
  return (
    <kbd
      className={`rounded-kbd border px-1.5 py-0.5 font-mono text-mono font-medium ${
        onMedia ? "border-line-on-media text-text-2" : "border-line-strong text-text-dim"
      } ${className}`}
    >
      {children}
    </kbd>
  );
}
