import { PlusSignIcon, Settings01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import type { Account } from "@tuner/core";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useNavigate } from "react-router";
import { chooseAccount } from "../data/accounts";
import { useSession } from "../data/session";
import { Icon } from "./Icon";

const count = new Intl.NumberFormat();

/** DESIGN.md "Motion": menus in 200 ms, out 150 ms. */
const enter = { duration: 0.2, ease: [0.2, 0.8, 0.2, 1] } as const;
const exit = { duration: 0.15, ease: "easeIn" } as const;

const buttonClass =
  "flex w-full items-center gap-3 rounded-full border border-line bg-surface px-3 py-2.5 text-left text-text transition-colors duration-(--duration-hover) ease-out hover:border-line-strong";

function Avatar({ account }: { account: Account }) {
  return (
    <span className="flex size-8 flex-none items-center justify-center rounded-full bg-avatar font-display text-small text-accent-ink">
      {account.name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}

/**
 * The active account at the bottom of the sidebar (avatar letter on dark
 * amber, DESIGN.md "Sidebar"). A click opens the switcher above it (SPEC §1:
 * switching is one click): every subscription with the one in use ticked,
 * then "Add a subscription" and "Manage subscriptions" (Settings).
 */
export function AccountButton() {
  const navigate = useNavigate();
  const active = useSession((s) => s.active);
  const accounts = useSession((s) => s.accounts);
  const counts = useSession((s) => s.counts);
  const syncing = useSession((s) => s.sync.running);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLElement>("[aria-checked='true'], [role^='menuitem']")?.focus();
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", onPointer);
    return () => window.removeEventListener("pointerdown", onPointer);
  }, [open]);

  if (!active) {
    return (
      <button type="button" onClick={() => void navigate("/connect")} className={buttonClass}>
        <span className="flex size-8 flex-none items-center justify-center rounded-full bg-avatar text-accent-ink">
          <Icon icon={PlusSignIcon} size={16} />
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-small font-semibold">No subscription</span>
          <span className="font-sans text-mono text-text-muted">Xtream · Not connected</span>
        </span>
      </button>
    );
  }

  const close = (focusTrigger = true) => {
    setOpen(false);
    if (focusTrigger) trigger.current?.focus();
  };
  const go = (path: string) => {
    close(false);
    void navigate(path);
  };
  const pick = (id: string) => {
    close();
    if (id !== active.id) void chooseAccount(id).then(() => navigate("/"));
  };

  const onMenuKey = (event: KeyboardEvent) => {
    const items = [...(menu.current?.querySelectorAll<HTMLElement>("[role^='menuitem']") ?? [])];
    const at = items.indexOf(document.activeElement as HTMLElement);
    const move = (to: number) => items[(to + items.length) % items.length]?.focus();
    if (event.key === "ArrowDown") move(at + 1);
    else if (event.key === "ArrowUp") move(at - 1);
    else if (event.key === "Home") move(0);
    else if (event.key === "End") move(items.length - 1);
    else if (event.key === "Escape") close();
    else if (event.key === "Tab") return close(false);
    else return;
    event.preventDefault();
    event.stopPropagation();
  };

  const detail = syncing
    ? "Updating lists…"
    : counts
      ? `${count.format(counts.live)} channels`
      : (active.status ?? "Xtream");

  const itemClass =
    "flex h-11 w-full items-center gap-3 rounded-full px-2 text-left text-small text-text-2 outline-none hover:bg-ghost hover:text-text focus-visible:bg-ghost focus-visible:text-text";

  return (
    <div ref={root} className="relative">
      <AnimatePresence>
        {open && (
          <motion.div
            ref={menu}
            role="menu"
            aria-label="Subscriptions"
            onKeyDown={onMenuKey}
            className="absolute inset-x-0 bottom-full z-30 mb-2 flex flex-col gap-0.5 rounded-card border border-line-strong bg-surface-raised p-1.5"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0, transition: enter }}
            exit={{ opacity: 0, y: 6, transition: exit }}
            data-account-menu
          >
            {accounts.map((account) => (
              <button
                key={account.id}
                type="button"
                role="menuitemradio"
                aria-checked={account.id === active.id}
                onClick={() => pick(account.id)}
                className={itemClass}
                data-account={account.id}
              >
                <Avatar account={account} />
                <span className="min-w-0 flex-1 truncate font-semibold text-text">
                  {account.name}
                </span>
                {account.id === active.id && (
                  <Icon icon={Tick02Icon} size={16} className="mr-2 text-accent-ink" />
                )}
              </button>
            ))}
            <div className="mx-2 my-1 h-px bg-line-strong" />
            <button
              type="button"
              role="menuitem"
              onClick={() => go("/connect?add=1")}
              className={itemClass}
            >
              <span className="flex size-8 items-center justify-center text-accent-ink">
                <Icon icon={PlusSignIcon} size={18} />
              </span>
              Add a subscription
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => go("/settings")}
              className={itemClass}
            >
              <span className="flex size-8 items-center justify-center text-text-muted">
                <Icon icon={Settings01Icon} size={18} />
              </span>
              Manage subscriptions
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      <button
        ref={trigger}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={buttonClass}
        data-account-button
      >
        <Avatar account={active} />
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-small font-semibold">{active.name}</span>
          <span className="truncate font-sans text-mono text-text-muted">Xtream · {detail}</span>
        </span>
      </button>
    </div>
  );
}
