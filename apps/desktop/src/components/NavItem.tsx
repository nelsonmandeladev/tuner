import type { ReactNode } from "react";
import { NavLink } from "react-router";
import type { NavRoute } from "../app/routes";
import { Icon } from "./Icon";

interface NavItemProps {
  route: NavRoute;
  /** Trailing content, e.g. a keyboard hint. */
  trailing?: ReactNode;
}

const itemClass = (active: boolean) =>
  [
    "flex h-11 items-center gap-3 rounded-full px-4 text-body transition-colors duration-(--duration-hover) ease-out",
    active
      ? "bg-surface-active font-semibold text-text"
      : "font-medium text-text-muted hover:bg-surface hover:text-text-2",
  ].join(" ");

/** A sidebar entry that opens something instead of a route (Search). */
export function NavButton({
  label,
  icon,
  active,
  onClick,
  trailing,
}: {
  label: string;
  icon: NavRoute["icon"];
  active: boolean;
  onClick: () => void;
  trailing?: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-expanded={active}
      onClick={onClick}
      className={`${itemClass(active)} text-left`}
    >
      <Icon icon={icon} />
      {label}
      {trailing && <span className="ml-auto flex">{trailing}</span>}
    </button>
  );
}

export function NavItem({ route, trailing }: NavItemProps) {
  return (
    <NavLink
      to={route.path}
      end={route.path === "/"}
      className={({ isActive }) => itemClass(isActive)}
    >
      <Icon icon={route.icon} />
      {route.label}
      {trailing && <span className="ml-auto flex">{trailing}</span>}
    </NavLink>
  );
}
