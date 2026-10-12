import { ArrowDown01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Icon } from "./Icon";

interface SelectProps<T extends string> {
  /** Names the control for screen readers (the row's label). */
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}

/**
 * A choice from a list too long for a SegmentedControl (Settings, M6): a
 * fully rounded 40-px button with the current value, and a listbox under it
 * on `--surface-raised` (radius 12, `--line-strong` border). Arrow keys move,
 * Enter or Space picks, Esc or a click outside closes.
 */
export function Select<T extends string>({ label, options, value, onChange }: SelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const listId = useId();
  const current = options.find((o) => o.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", onPointer);
    return () => window.removeEventListener("pointerdown", onPointer);
  }, [open]);

  useEffect(() => {
    if (open) list.current?.children[cursor]?.scrollIntoView({ block: "nearest" });
  }, [open, cursor]);

  const show = () => {
    setCursor(
      Math.max(
        0,
        options.findIndex((o) => o.value === value),
      ),
    );
    setOpen(true);
  };
  const pick = (index: number) => {
    const option = options[index];
    if (option) onChange(option.value);
    setOpen(false);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
        event.preventDefault();
        show();
      }
      return;
    }
    const move = (to: number) => setCursor(Math.min(options.length - 1, Math.max(0, to)));
    switch (event.key) {
      case "ArrowDown":
        move(cursor + 1);
        break;
      case "ArrowUp":
        move(cursor - 1);
        break;
      case "Home":
        move(0);
        break;
      case "End":
        move(options.length - 1);
        break;
      case "Enter":
      case " ":
        pick(cursor);
        break;
      case "Escape":
      case "Tab":
        setOpen(false);
        if (event.key === "Tab") return;
        break;
      default:
        return;
    }
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        role="combobox"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open ? `${listId}-${cursor}` : undefined}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={onKeyDown}
        className="flex h-10 min-w-44 items-center justify-between gap-3 rounded-full border border-line-strong bg-surface pr-3.5 pl-4.5 text-small font-semibold text-text transition-colors duration-(--duration-hover) ease-out hover:bg-surface-raised"
      >
        {current?.label}
        <Icon icon={ArrowDown01Icon} size={16} className="text-text-muted" />
      </button>
      {open && (
        <ul
          ref={list}
          id={listId}
          role="listbox"
          aria-label={label}
          className="absolute top-full right-0 z-30 mt-2 flex max-h-72 min-w-full flex-col overflow-y-auto rounded-field border border-line-strong bg-surface-raised py-1.5"
        >
          {options.map((option, index) => {
            const selected = option.value === value;
            return (
              <li
                key={option.value}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={selected}
                onPointerEnter={() => setCursor(index)}
                onClick={() => pick(index)}
                className={`flex h-9 cursor-pointer items-center gap-2.5 pr-4 pl-3 text-small whitespace-nowrap ${
                  index === cursor ? "bg-ghost text-text" : "text-text-2"
                }`}
              >
                <span className="w-4 text-accent-ink">
                  {selected && <Icon icon={Tick02Icon} size={16} />}
                </span>
                {option.label}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
