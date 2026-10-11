import { MotionConfig } from "motion/react";
import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes } from "react-router";
import { Backdrop } from "../player/Backdrop";
import { Player } from "../screens/Player";
import { PlaybackScope } from "./PlaybackScope";
import { Connect } from "../screens/Connect";
import { Home } from "../screens/Home";
import { LiveTV } from "../screens/LiveTV";
import { Movies } from "../screens/Movies";
import { Search } from "../screens/Search";
import { Series } from "../screens/Series";
import { Settings } from "../screens/Settings";
import { AppShell } from "./AppShell";
import { RequireAccount } from "./RequireAccount";

// Dev builds only: import.meta.env.DEV is false in release, so the bundler drops the import.
const PlayerDebug = import.meta.env.DEV ? lazy(() => import("../screens/debug/PlayerDebug")) : null;
const DevAutorun = import.meta.env.DEV ? lazy(() => import("../screens/debug/DevAutorun")) : null;

export function App() {
  return (
    // "user": honour prefers-reduced-motion by dropping transforms, keeping opacity.
    <MotionConfig reducedMotion="user">
      <Backdrop />
      <BrowserRouter>
        <PlaybackScope />
        {DevAutorun && "__TAURI_INTERNALS__" in window && (
          <Suspense>
            <DevAutorun />
          </Suspense>
        )}
        <Routes>
          <Route path="connect" element={<Connect />} />
          <Route element={<RequireAccount />}>
            <Route element={<AppShell />}>
              <Route index element={<Home />} />
              <Route path="live" element={<LiveTV />} />
              <Route path="movies" element={<Movies />} />
              <Route path="series" element={<Series />} />
              <Route path="search" element={<Search />} />
              <Route path="settings" element={<Settings />} />
            </Route>
            <Route path="watch" element={<Player />} />
          </Route>
          {PlayerDebug && (
            <Route
              path="debug/player"
              element={
                // The window is transparent (mpv draws under it): a frame that paints
                // nothing shows the desktop, so the fallback paints the app background.
                <Suspense fallback={<div className="h-full bg-bg" />}>
                  <PlayerDebug />
                </Suspense>
              }
            />
          )}
        </Routes>
      </BrowserRouter>
    </MotionConfig>
  );
}
