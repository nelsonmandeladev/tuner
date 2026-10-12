interface SwitchProps {
  /** Names the switch for screen readers (the row's label). */
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
}

/**
 * An on/off setting (Settings, M6): a fully rounded 44 × 26 track. On is the
 * accent with an `--on-accent` knob; off is `--surface-raised` with a
 * `--line-strong` border and a muted knob.
 */
export function Switch({ label, checked, onChange, disabled = false, id }: SwitchProps) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-6.5 w-11 flex-none rounded-full border transition-colors duration-(--duration-hover) ease-out disabled:opacity-50 ${
        checked ? "border-accent bg-accent" : "border-line-strong bg-surface-raised"
      }`}
    >
      <span
        aria-hidden
        className={`absolute top-0.5 left-0.5 size-5 rounded-full transition-transform duration-(--duration-hover) ease-out motion-reduce:transition-none ${
          checked ? "translate-x-4.5 bg-on-accent" : "bg-text-muted"
        }`}
      />
    </button>
  );
}
