import "@fontsource/montserrat/700.css";
import "@fontsource/montserrat/800.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/geist-mono/500.css";
import "./styles/global.css";

import { getCurrentWindow } from "@tauri-apps/api/window";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { loadLayout } from "./app/layout";
import { loadHome } from "./data/home";
import { boot, useSession } from "./data/session";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

const inTauri = "__TAURI_INTERNALS__" in window;

/** Home's own reads wait at most this long before the window shows anyway (with skeletons). */
const HOME_WAIT_MS = 800;

/** Starting on Home: read what it shows before the window appears (cold start → Home painted). */
async function preloadHome() {
  if (window.location.pathname !== "/" || useSession.getState().phase !== "ready") return;
  await Promise.race([loadHome(), new Promise((resolve) => setTimeout(resolve, HOME_WAIT_MS))]);
}

// The window starts hidden (tauri.conf.json) and is shown once the cached
// library is loaded and its first frame has painted, so the user never sees an
// empty window or a flash of the wrong screen. Two frames: the first runs
// before React's paint, the second after it.
void (
  inTauri ? boot().then(() => Promise.all([preloadHome(), loadLayout()])) : Promise.resolve()
).finally(() =>
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      if (inTauri) void getCurrentWindow().show();
    }),
  ),
);
