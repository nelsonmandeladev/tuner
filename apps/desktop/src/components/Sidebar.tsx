import { mainRoutes, searchNav, settingsRoute } from "../app/routes";
import { shortcutLabel } from "../app/platform";
import { AccountButton } from "./AccountButton";
import { Kbd } from "./Kbd";
import { Logo } from "./Logo";
import { openSearch, useSearch } from "../data/search";
import { NavButton, NavItem } from "./NavItem";

export function Sidebar() {
  const searchOpen = useSearch((s) => s.open);
  return (
    <nav
      aria-label="Main"
      className="flex w-62 flex-none flex-col gap-7 border-r border-line bg-bg-sidebar px-4 pt-7 pb-5"
    >
      <Logo />
      <div className="flex flex-col gap-1">
        {mainRoutes.map((route) => (
          <NavItem key={route.path} route={route} />
        ))}
        <NavButton
          {...searchNav}
          active={searchOpen}
          onClick={openSearch}
          trailing={<Kbd>{shortcutLabel("K")}</Kbd>}
        />
      </div>
      <div className="mt-auto flex flex-col gap-1">
        <NavItem route={settingsRoute} />
        <AccountButton />
      </div>
    </nav>
  );
}
