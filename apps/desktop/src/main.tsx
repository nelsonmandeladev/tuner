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

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// The window starts hidden (tauri.conf.json) and is shown once the first frame
// has painted, so the user never sees an empty or white window.
// Two frames: the first runs before React's first paint, the second after it.
requestAnimationFrame(() =>
  requestAnimationFrame(() => {
    if ("__TAURI_INTERNALS__" in window) void getCurrentWindow().show();
  }),
);
