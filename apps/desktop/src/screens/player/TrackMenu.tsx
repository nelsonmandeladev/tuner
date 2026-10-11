import { Tick02Icon } from "@hugeicons/core-free-icons";
import { useEffect, useRef } from "react";
import { Icon } from "../../components/Icon";
import { usePlayer } from "../../player/store";
import { selectAudio, selectSubtitle } from "../../player/tuner";
import { trackLabel } from "../../player/trackLabel";

/**
 * Audio or subtitle choices above their button. The choice is remembered
 * for the channel (SPEC "Player").
 */
export function TrackMenu({ kind, onClose }: { kind: "audio" | "sub"; onClose: () => void }) {
  const tracks = usePlayer((s) => (kind === "audio" ? s.audioTracks : s.subtitleTracks));
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const menu = ref.current;
    (
      menu?.querySelector<HTMLElement>("[aria-checked='true']") ??
      menu?.querySelector<HTMLElement>("[role='menuitemradio']")
    )?.focus();
    const onPointer = (event: PointerEvent) => {
      if (!ref.current?.parentElement?.contains(event.target as Node)) onClose();
    };
    window.addEventListener("pointerdown", onPointer);
    return () => window.removeEventListener("pointerdown", onPointer);
  }, [onClose]);

  const options: { id: number | "no"; label: string; selected: boolean }[] = tracks.map((t, i) => ({
    id: t.id,
    label: trackLabel(t, i),
    selected: t.selected,
  }));
  if (kind === "sub")
    options.push({ id: "no", label: "Off", selected: !tracks.some((t) => t.selected) });

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={kind === "audio" ? "Audio" : "Subtitles"}
      className="absolute right-0 bottom-full mb-2 flex max-h-80 min-w-56 flex-col overflow-y-auto rounded-field bg-overlay-strong py-2"
    >
      {options.length === 0 && (
        <span className="px-4 py-2 text-caption text-text-muted">
          {kind === "audio" ? "No audio tracks" : "No subtitles in this stream"}
        </span>
      )}
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          role="menuitemradio"
          aria-checked={option.selected}
          onClick={() => {
            if (kind === "audio" && option.id !== "no") void selectAudio(option.id);
            else void selectSubtitle(option.id);
            onClose();
          }}
          className="flex h-10 items-center gap-3 px-4 text-left text-small text-text hover:bg-ghost focus-visible:bg-ghost"
        >
          <span className="w-4 text-accent">
            {option.selected && <Icon icon={Tick02Icon} size={16} />}
          </span>
          {option.label}
        </button>
      ))}
    </div>
  );
}
