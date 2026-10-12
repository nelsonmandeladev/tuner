interface SegmentedControlProps<T extends string | number> {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}

/**
 * DESIGN.md `SegmentedControl` (Series.dc.html seasons): a `--surface` track
 * with a `--line` border; the active segment is `--surface-raised`.
 */
export function SegmentedControl<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="flex max-w-full gap-1 overflow-x-auto rounded-full border border-line bg-surface p-1"
    >
      {options.map((option) => {
        const on = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(option.value)}
            className={`h-9.5 flex-none rounded-full px-4.5 text-small font-semibold whitespace-nowrap transition-colors duration-(--duration-hover) ease-out ${
              on ? "bg-surface-raised text-text" : "text-text-muted hover:text-text-2"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
