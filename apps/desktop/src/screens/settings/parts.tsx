import type { ReactNode } from "react";

/**
 * A Settings section (M6, not in the mockups): an eyebrow heading over a
 * `--surface` panel (radius 18, `--line` border) of rows split by `--line`.
 */
export function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={`settings-${id}`} className="flex flex-col gap-3" data-settings={id}>
      <h2 id={`settings-${id}`} className="px-1 text-eyebrow-s text-text-faint uppercase">
        {title}
      </h2>
      <div className="flex flex-col divide-y divide-line rounded-card border border-line bg-surface">
        {children}
      </div>
    </section>
  );
}

/** One setting: label and one line of explanation on the left, the control on the right. */
export function Row({
  label,
  description,
  control,
  htmlFor,
  children,
}: {
  label: ReactNode;
  description?: ReactNode;
  control?: ReactNode;
  /** The control's id, so a click on the label reaches it. */
  htmlFor?: string;
  /** Extra content under the row (lists, a confirmation). */
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 px-6 py-4.5">
      <div className="flex min-h-10 items-center justify-between gap-8">
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor={htmlFor} className="text-small font-semibold text-text">
            {label}
          </label>
          {description && <p className="max-w-130 text-caption text-text-muted">{description}</p>}
        </div>
        {control && <div className="flex flex-none items-center gap-2">{control}</div>}
      </div>
      {children}
    </div>
  );
}

/** A one-line answer to an action ("Cache cleared"), read out by screen readers. */
export function Note({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="text-caption text-text-faint">
      {children}
    </p>
  );
}
