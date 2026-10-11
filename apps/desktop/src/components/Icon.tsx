import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";

interface IconProps {
  icon: IconSvgElement;
  size?: number;
  className?: string;
}

/** Stroke icon at the DESIGN.md defaults (20 px, stroke 1.8). Decorative: label the control, not the icon. */
export function Icon({ icon, size = 20, className }: IconProps) {
  return (
    <HugeiconsIcon
      icon={icon}
      size={size}
      strokeWidth={1.8}
      color="currentColor"
      className={className}
      aria-hidden
    />
  );
}
