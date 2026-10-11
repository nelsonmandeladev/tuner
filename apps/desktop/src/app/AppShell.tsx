import { motion } from "motion/react";
import { Outlet, useLocation } from "react-router";
import { Sidebar } from "../components/Sidebar";
import { useGlobalShortcuts } from "../hooks/useGlobalShortcuts";

/** Screen change: 180 ms fade with an 8 px rise (DESIGN.md "Motion"). */
const screenTransition = { duration: 0.18, ease: [0.2, 0.8, 0.2, 1] } as const;

export function AppShell() {
  const { pathname } = useLocation();
  useGlobalShortcuts();

  return (
    <div className="flex h-full text-text">
      <Sidebar />
      <main className="min-w-0 flex-1 overflow-y-auto">
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
