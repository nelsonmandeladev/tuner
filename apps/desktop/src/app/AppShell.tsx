import { motion, useReducedMotion } from "motion/react";
import { Outlet, useLocation } from "react-router";
import { Sidebar } from "../components/Sidebar";
import { useEffect, useRef } from "react";
import { runsUnderTitleBar, SIDEBAR_WIDTH, sidebarTransition, useLayout } from "./layout";

/** Screen change: 180 ms fade with an 8 px rise (DESIGN.md "Motion"). */
const screenTransition = { duration: 0.18, ease: [0.2, 0.8, 0.2, 1] } as const;

export function AppShell() {
  const { pathname } = useLocation();
  const sidebarOpen = useLayout((s) => s.sidebarOpen);
  const reduceMotion = useReducedMotion();
  const underBar = runsUnderTitleBar(pathname);
  const main = useRef<HTMLElement>(null);
  const onScroll = () =>
    useLayout.setState({ underBarScrolled: (main.current?.scrollTop ?? 0) > 0 });
  // Every page opens at its top.
  useEffect(() => {
    if (main.current) main.current.scrollTop = 0;
    useLayout.setState({ underBarScrolled: false });
  }, [pathname]);

  return (
    <div className="flex h-full text-text">
      {/* Hidden completely for more room (title bar toggle, Ctrl/⌘ + B); slides closed. */}
      <motion.div
        className="flex-none overflow-hidden"
        initial={false}
        animate={{ width: sidebarOpen ? SIDEBAR_WIDTH : 0 }}
        transition={sidebarTransition(sidebarOpen, reduceMotion)}
        inert={!sidebarOpen}
        data-sidebar-open={sidebarOpen}
      >
        <Sidebar />
      </motion.div>
      {/* The title bar floats over this shell: pages start under its 40 px, except the
          detail pages, whose artwork runs up under it. */}
      <main
        ref={main}
        onScroll={underBar ? onScroll : undefined}
        className={`min-w-0 flex-1 overflow-y-auto ${underBar ? "" : "mt-10"}`}
      >
        <motion.div
          key={pathname}
          className="h-full"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={screenTransition}
        >
          <Outlet />
        </motion.div>
      </main>
    </div>
  );
}
