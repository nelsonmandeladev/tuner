import type { IconSvgElement } from "@hugeicons/react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Icon } from "./Icon";

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> {
  icon: IconSvgElement;
  /** Required: icon-only buttons are named for screen readers (DESIGN.md "Accessibility"). */
  "aria-label": string;
  /** "surface": on the app background. "media": ghost on video. */
  variant?: "surface" | "media" | "media-strong";
  size?: 44 | 48;
  className?: string;
  children?: ReactNode;
}

/** DESIGN.md `Button` `icon`: a square button, 44 (48 next to a 48 button). */
export function IconButton({
  icon,
  variant = "surface",
  size = 44,
  className = "",
  ...button
}: IconButtonProps) {
  const look = {
    surface: "border border-line-strong bg-surface hover:bg-surface-raised",
    media: "bg-ghost hover:bg-ghost-strong",
    "media-strong": "bg-ghost-strong hover:bg-ghost",
  }[variant];
  return (
    <button
      type="button"
      className={`flex flex-none items-center justify-center text-text transition-colors duration-(--duration-hover) ease-out ${
        size === 48 ? "size-12 rounded-full" : "size-11 rounded-full"
      } ${look} ${className}`}
      {...button}
    >
      <Icon icon={icon} />
    </button>
  );
}
