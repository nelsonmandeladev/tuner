import type { InputHTMLAttributes, ReactNode } from "react";

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "className"> {
  id: string;
  label: ReactNode;
  /** Monospace value, for URLs and numbers. */
  mono?: boolean;
  invalid?: boolean;
}

/** DESIGN.md `TextField`: label above (13/600), 48 high, `--surface`, accent focus ring. */
export function TextField({ id, label, mono = false, invalid = false, ...input }: TextFieldProps) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <label htmlFor={id} className="text-caption font-semibold text-text-2">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={invalid || undefined}
        className={`h-12 min-w-0 rounded-full border bg-surface px-5 text-body text-text placeholder:text-text-placeholder focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent disabled:opacity-60 ${
          invalid ? "border-live" : "border-line-strong"
        } ${mono ? "font-mono" : ""}`}
        {...input}
      />
    </div>
  );
}
