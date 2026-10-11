import { useEffect, useState } from "react";
import { mpv } from "../../player/mpv";
import { usePlayer } from "../../player/store";

interface Stats {
  video: string;
  size: string;
  decoder: string;
  audio: string;
  bitrate: string;
  dropped: string;
  cache: string;
}

const kbps = (bits: unknown) =>
  typeof bits === "number" ? `${Math.round(bits / 1000)} kb/s` : "–";

/**
 * Stream info (I): codec, resolution, decoder, bitrate, dropped frames and
 * buffer, for diagnosing a bad stream (SPEC "Player", stats panel). Polled
 * once a second while open.
 */
export function StatsPanel() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    let cancelled = false;
    const read = async () => {
      const get = (name: string) => mpv.getNumber(name).catch(() => null);
      const text = (name: string) => mpv.getString(name).catch(() => null);
      const [vcodec, w, h, fps, hw, acodec, ch, vbit, abit, drop, decDrop, cache] =
        await Promise.all([
          text("video-codec"),
          get("width"),
          get("height"),
          get("estimated-vf-fps"),
          text("hwdec-current"),
          text("audio-codec-name"),
          get("audio-params/channel-count"),
          get("video-bitrate"),
          get("audio-bitrate"),
          get("frame-drop-count"),
          get("decoder-frame-drop-count"),
          get("demuxer-cache-duration"),
        ]);
      if (cancelled) return;
      setStats({
        video: String(vcodec ?? "–"),
        size: w && h ? `${w}×${h}${fps ? ` @ ${Number(fps).toFixed(2)} fps` : ""}` : "–",
        decoder: hw && hw !== "no" ? `hardware (${String(hw)})` : "software",
        audio: acodec ? `${String(acodec)}${ch ? `, ${ch} ch` : ""}` : "–",
        bitrate: `${kbps(vbit)} video, ${kbps(abit)} audio`,
        dropped: `${drop ?? 0} output, ${decDrop ?? 0} decoder`,
        cache: typeof cache === "number" ? `${cache.toFixed(1)} s` : "–",
      });
    };
    void read();
    const timer = setInterval(() => void read(), 1000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const status = usePlayer((s) => s.status);
  const rows: [string, string][] = stats
    ? [
        ["Video", stats.video],
        ["Size", stats.size],
        ["Decoder", stats.decoder],
        ["Audio", stats.audio],
        ["Bitrate", stats.bitrate],
        ["Dropped", stats.dropped],
        ["Buffer", stats.cache],
        ["State", status],
      ]
    : [];

  return (
    <aside
      aria-label="Stream info"
      className="absolute top-28 left-10 min-w-80 rounded-field bg-overlay-strong p-4"
      data-stats
    >
      <h2 className="mb-2 text-eyebrow-s text-text-muted uppercase">Stream info</h2>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 font-mono text-mono">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-text-dim">{label}</dt>
            <dd className="text-text-2">{value}</dd>
          </div>
        ))}
      </dl>
    </aside>
  );
}
