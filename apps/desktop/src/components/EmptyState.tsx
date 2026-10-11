import type { ReactNode } from "react";

interface EmptyStateProps {
  /** One line saying what will appear here. */
  message: string;
  /** At most one action (DESIGN.md "States"). */
  action?: ReactNode;
}

export function EmptyState({ message, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-start gap-4 rounded-card border border-dashed border-line p-8">
      <p className="text-body-l text-text-muted">{message}</p>
      {action}
    </div>
  );
}
