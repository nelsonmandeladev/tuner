import type { ReactNode } from "react";

export function Kbd({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={`rounded-kbd border border-line-strong px-1.5 py-0.5 font-mono text-mono font-medium text-text-dim ${className}`}
    >
      {children}
    </kbd>
  );
}
