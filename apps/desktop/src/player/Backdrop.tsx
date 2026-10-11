import { useEffect, useState } from "react";
import { useVideoHole, type VideoHole } from "./videoHole";

/**
 * The app background. The window is transparent so mpv, drawing under the
 * webview, can show through (docs/DECISIONS.md D2). This paints `--bg` over
 * the whole window except the current video hole (a rounded rectangle cut out
 * with the even-odd rule), so screens can keep transparent panes around the
 * video instead of carving holes in their own backgrounds.
 */
export function Backdrop() {
  const hole = useVideoHole((s) => s.hole);
  const [size, setSize] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));

  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const outer = `M0 0H${size.w}V${size.h}H0Z`;
  return (
    <svg
      className="pointer-events-none fixed inset-0 -z-10 size-full"
      width={size.w}
      height={size.h}
      aria-hidden
    >
      <path
        className="fill-bg"
        fillRule="evenodd"
        d={hole ? `${outer}${roundedRect(hole)}` : outer}
      />
    </svg>
  );
}

function roundedRect({ left: x, top: y, width: w, height: h, radius }: VideoHole): string {
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  return (
    `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}` +
    `V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}` +
    `H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}` +
    `V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`
  );
}
