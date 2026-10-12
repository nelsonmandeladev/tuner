import { useLayoutEffect, useRef } from "react";
import { mpv } from "./mpv";
import { onLayoutMoved, useVideoHole } from "./videoHole";

interface VideoSurfaceProps {
  className?: string;
  /** Corner radius of the hole in px (the preview is rounded, full screen is not). */
  radius?: number;
}

/**
 * The hole in the UI where mpv's video shows through.
 *
 * mpv renders under the transparent webview across the whole window. The
 * app's background is painted by `Backdrop`, which leaves this element's box
 * open, so nothing in the tree has to avoid painting behind it. The element
 * keeps mpv's `video-margin-ratio-*` matched to its own box, so the same
 * instance can be a small preview or fill the window without reloading the
 * stream. Mount one at a time.
 */
export function VideoSurface({ className = "", radius = 0 }: VideoSurfaceProps) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    let frame = 0;
    let last = "";

    const measure = () => {
      const rect = element.getBoundingClientRect();
      const width = window.innerWidth;
      const height = window.innerHeight;
      useVideoHole.setState({
        hole: { left: rect.left, top: rect.top, width: rect.width, height: rect.height, radius },
      });
      const ratio = {
        left: clamp(rect.left / width),
        right: clamp(1 - rect.right / width),
        top: clamp(rect.top / height),
        bottom: clamp(1 - rect.bottom / height),
      };
      const key = JSON.stringify(ratio);
      if (key === last) return;
      last = key;
      void mpv.setVideoMargins(ratio).catch(() => undefined);
    };
    const sync = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };

    // Before the first paint, so the backdrop never covers the hole for a frame.
    measure();
    // Screen transitions move the box without resizing anything (an 8 px
    // rise, DESIGN.md "Motion"): follow it frame by frame while they run.
    const settleUntil = performance.now() + 500;
    let settling = 0;
    const follow = () => {
      measure();
      if (performance.now() < settleUntil) settling = requestAnimationFrame(follow);
    };
    settling = requestAnimationFrame(follow);
    const observer = new ResizeObserver(sync);
    observer.observe(element);
    observer.observe(document.documentElement);
    window.addEventListener("resize", sync);
    const stopLayout = onLayoutMoved(sync);
    return () => {
      stopLayout();
      cancelAnimationFrame(frame);
      cancelAnimationFrame(settling);
      observer.disconnect();
      window.removeEventListener("resize", sync);
      useVideoHole.setState({ hole: null });
    };
  }, [radius]);

  return <div ref={ref} className={className} data-video-surface aria-hidden />;
}

function clamp(value: number) {
  return Math.min(1, Math.max(0, Number(value.toFixed(4))));
}
