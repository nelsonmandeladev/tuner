import type { ReactNode } from "react";
import { NavLink } from "react-router";
import type { NavRoute } from "../app/routes";
import { Icon } from "./Icon";

interface NavItemProps {
  route: NavRoute;
  /** Trailing content, e.g. a keyboard hint. */
  trailing?: ReactNode;
}

export function NavItem({ route, trailing }: NavItemProps) {
  return (
    <NavLink
      to={route.path}
      end={route.path === "/"}
      className={({ isActive }) =>
        [
          "flex h-11 items-center gap-3 rounded-field px-3 text-body transition-colors duration-(--duration-hover) ease-out",
          isActive
            ? "bg-surface-active font-semibold text-text"
            : "font-medium text-text-muted hover:bg-surface hover:text-text-2",
        ].join(" ")
      }
    >
      <Icon icon={route.icon} />
      {route.label}
      {trailing && <span className="ml-auto flex">{trailing}</span>}
    </NavLink>
  );
}
