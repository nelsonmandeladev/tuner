import { useEffect, useRef } from "react";
import { mpv } from "./mpv";

interface VideoSurfaceProps {
  className?: string;
}

/**
 * The hole in the UI where mpv's video shows through.
 *
 * mpv renders under the transparent webview across the whole window. This
 * element must paint nothing (and no ancestor may paint a background behind
 * it). It keeps mpv's `video-margin-ratio-*` matched to its own box, so the
 * same instance can be a small preview or fill the window without reloading
 * the stream.
 */
export function VideoSurface({ className = "" }: VideoSurfaceProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    let frame = 0;
    let last = "";

    const sync = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = element.getBoundingClientRect();
        const width = window.innerWidth;
        const height = window.innerHeight;
        const ratio = {
          left: clamp(rect.left / width),
          right: clamp(1 - rect.right / width),
          top: clamp(rect.top / height),
          bottom: clamp(1 - rect.bottom / height),
        };
        const key = JSON.stringify(ratio);
        if (key === last) return;
        last = key;
        void mpv.setVideoMargins(ratio);
      });
    };

    const observer = new ResizeObserver(sync);
    observer.observe(element);
    window.addEventListener("resize", sync);
    sync();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", sync);
    };
  }, []);

  return <div ref={ref} className={className} data-video-surface aria-hidden />;
}

function clamp(value: number) {
  return Math.min(1, Math.max(0, Number(value.toFixed(4))));
}
