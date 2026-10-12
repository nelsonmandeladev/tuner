import { Loading03Icon } from "@hugeicons/core-free-icons";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Icon } from "./Icon";

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> {
  variant?: "primary" | "ghost";
  /** 52 px on Connect, 48 elsewhere (DESIGN.md "Spacing and sizes"). */
  size?: "md" | "lg";
  /** Shows a spinner in place of nothing else changing: the only spinner DESIGN.md allows. */
  busy?: boolean;
  children: ReactNode;
}

/** DESIGN.md `Button`: primary (accent fill) or ghost. */
export function Button({
  variant = "primary",
  size = "md",
  busy = false,
  children,
  disabled,
  ...button
}: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={`flex items-center justify-center gap-2 rounded-full font-semibold transition-colors duration-(--duration-hover) ease-out disabled:cursor-default ${
        // 48 px buttons have 22 px sides (Main.dc.html, Series.dc.html).
        size === "lg" ? "h-13 px-5 text-body-l" : "h-12 px-5.5 text-body"
      } ${
        variant === "primary"
          ? "bg-accent text-on-accent hover:brightness-110 disabled:opacity-70"
          : "bg-ghost text-text hover:bg-surface-raised disabled:opacity-50"
      }`}
      {...button}
    >
      {busy && (
        <Icon icon={Loading03Icon} size={18} className="animate-spin motion-reduce:animate-none" />
      )}
      {children}
    </button>
  );
}
