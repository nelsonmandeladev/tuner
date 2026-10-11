import { MotionConfig } from "motion/react";
import { BrowserRouter, Route, Routes } from "react-router";
import { Home } from "../screens/Home";
import { LiveTV } from "../screens/LiveTV";
import { Movies } from "../screens/Movies";
import { Search } from "../screens/Search";
import { Series } from "../screens/Series";
import { Settings } from "../screens/Settings";
import { AppShell } from "./AppShell";

export function App() {
  return (
    // "user": honour prefers-reduced-motion by dropping transforms, keeping opacity.
    <MotionConfig reducedMotion="user">
      <BrowserRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<Home />} />
            <Route path="live" element={<LiveTV />} />
            <Route path="movies" element={<Movies />} />
            <Route path="series" element={<Series />} />
            <Route path="search" element={<Search />} />
            <Route path="settings" element={<Settings />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </MotionConfig>
  );
}
