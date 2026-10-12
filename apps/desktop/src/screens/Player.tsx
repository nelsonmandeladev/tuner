import { useCallback, useEffect, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router";
import { hasModKey } from "../app/platform";
import { GeneratedArt } from "../components/GeneratedArt";
import { Toast } from "../components/Toast";
import { wantEpg } from "../data/epg";
import { seekBy, setVolume, togglePause } from "../player/controller";
import { leavePlayer, toggleFullscreen } from "../player/fullscreen";
import { usePlayer } from "../player/store";
import {
  cancelDigits,
  channelOf,
  commitDigits,
  cycleAudio,
  cycleSubtitle,
  setView,
  showNotice,
  toggleUserMute,
  tune,
  typeDigit,
  useTuner,
  zap,
} from "../player/tuner";
import { VideoSurface } from "../player/VideoSurface";
import { NumberEntry } from "./live/NumberEntry";
import { UpNextCard } from "./player/UpNextCard";
import { VodFooter } from "./player/VodFooter";
import { VodHeader } from "./player/VodHeader";
import { cancelUpNext, playNext } from "../player/vodSession";
import { ChannelSwitcher } from "./player/ChannelSwitcher";
import { GuidePanel } from "./player/GuidePanel";
import { PlayerError } from "./player/PlayerError";
import { PlayerFooter } from "./player/PlayerFooter";
import { PlayerHeader } from "./player/PlayerHeader";
import { StatsPanel } from "./player/StatsPanel";
import { neighbours } from "./player/neighbours";

/** Controls fade after this long without input (SPEC "Player"). */
const IDLE_MS = 3000;

export type PlayerMenu = "audio" | "sub" | null;

/**
 * The full-screen player (design/screens/Player.dc.html). The same mpv
 * instance and stream as the Live TV preview, now filling the window. The
 * overlay and the cursor fade together after 3 s without input.
 */
export function Player() {
  const navigate = useNavigate();
  const channelId = useTuner((s) => s.channelId);
  const mode = useTuner((s) => s.mode);
  const media = useTuner((s) => s.media);
  const upNext = useTuner((s) => s.upNext);
  const notice = useTuner((s) => s.notice);
  const status = usePlayer((s) => s.status);
  const shown = usePlayer((s) => s.shown);
  const reconnecting = status === "reconnecting";
  const [guide, setGuide] = useState(false);
  const [stats, setStats] = useState(false);
  const [menu, setMenu] = useState<PlayerMenu>(null);
  const channel = channelOf(channelId);

  const pinned = guide || menu !== null || status === "error" || upNext !== null;
  const { visible, wake } = useAutoHide(pinned);

  useEffect(() => {
    setView("player");
    return () => setView("none");
  }, []);

  // The channel and its neighbours in the switcher always have their schedules.
  const list = useTuner((s) => s.list);
  useEffect(() => {
    if (channelId === null) return;
    const { prev, next } = neighbours(list, channelId);
    wantEpg(
      "player",
      [prev, channelId, next].filter((id): id is number => id !== null),
    );
    return () => wantEpg("player", []);
  }, [channelId, list]);

  const back = useCallback(() => void leavePlayer(navigate), [navigate]);

  usePlayerKeys({ guide, setGuide, setStats, menu, setMenu, back, wake });

  const vod = mode === "vod" ? media : null;
  if (mode === "vod" ? !vod : !channel) {
    return <Navigate to={mode === "vod" ? "/movies" : "/live"} replace />;
  }
  const artName = vod ? vod.title : channel!.name;

  return (
    <div
      className={`absolute inset-0 overflow-hidden text-text select-none ${visible ? "" : "cursor-none"}`}
      onMouseMove={wake}
      onDoubleClick={(event) => {
        if (
          event.target === event.currentTarget ||
          (event.target as HTMLElement).dataset.videoSurface !== undefined
        )
          void toggleFullscreen();
      }}
      onWheel={(event) => {
        wake();
        // The wheel scrolls panels (the guide, track menus); only over the video does it set the volume.
        if ((event.target as HTMLElement).closest("[data-guide], [role=menu], [data-stats]"))
          return;
        const volume = Math.round(
          Math.min(100, Math.max(0, usePlayer.getState().volume - Math.sign(event.deltaY) * 5)),
        );
        void setVolume(volume);
        showNotice(`Volume ${volume}%`);
      }}
      data-player
    >
      <VideoSurface className="absolute inset-0" />
      {(!shown || status === "idle") && (
        <GeneratedArt name={artName} className="absolute inset-0" />
      )}

      <div
        className={`absolute inset-0 flex flex-col justify-between bg-(image:--scrim-player) transition-opacity duration-250 ease-out motion-reduce:transition-none ${
          // Keep the header chips and the controls clear of the guide panel (400 px).
          guide ? "pr-100" : ""
        } ${visible ? "opacity-100" : "pointer-events-none opacity-0"}`}
        data-player-overlay
        data-visible={visible}
        onDoubleClick={(event) => {
          if (event.target === event.currentTarget) void toggleFullscreen();
        }}
      >
        {vod ? (
          <>
            <VodHeader media={vod} onBack={back} />
            <VodFooter media={vod} menu={menu} setMenu={setMenu} />
          </>
        ) : (
          <>
            <PlayerHeader
              channel={channel!}
              mode={mode === "catchup" ? "catchup" : "live"}
              onBack={back}
            />
            {!guide && mode === "live" && <ChannelSwitcher channelId={channel!.id} list={list} />}
            <PlayerFooter
              channel={channel!}
              menu={menu}
              setMenu={setMenu}
              onGuide={() => setGuide((g) => !g)}
            />
          </>
        )}
      </div>

      {guide && channel && (
        <GuidePanel
          channelId={channel.id}
          onClose={() => setGuide(false)}
          onPick={(id) => {
            tune(id, { requestedAt: performance.now() });
            setGuide(false);
          }}
        />
      )}
      {stats && <StatsPanel />}
      {vod && <UpNextCard />}
      {status === "error" && <PlayerError onBack={back} />}
      <NumberEntry onVideo />
      <Toast message={reconnecting ? "Reconnecting…" : notice} />
    </div>
  );
}

/** Visible after input; hidden `ms` later unless pinned (a menu, the guide or an error is open). */
function useAutoHide(pinned: boolean) {
  const [visible, setVisible] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const arm = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setVisible(false), IDLE_MS);
  }, []);
  const wake = useCallback(() => {
    setVisible(true);
    arm();
  }, [arm]);
  // Counting starts on open, and again when whatever pinned the overlay closes.
  useEffect(() => {
    if (!pinned) arm();
    return () => clearTimeout(timer.current);
  }, [pinned, arm]);
  return { visible: visible || pinned, wake };
}

interface KeyContext {
  guide: boolean;
  setGuide: (fn: (open: boolean) => boolean) => void;
  setStats: (fn: (open: boolean) => boolean) => void;
  menu: PlayerMenu;
  setMenu: (menu: PlayerMenu) => void;
  back: () => void;
  wake: () => void;
}

/** SPEC "Player" keyboard shortcuts: live, catch-up, movies and episodes. */
function usePlayerKeys(context: KeyContext) {
  const ref = useRef(context);
  useEffect(() => {
    ref.current = context;
  });

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const { guide, setGuide, setStats, menu, setMenu, back, wake } = ref.current;
      if (event.defaultPrevented || hasModKey(event) || event.altKey) return;
      wake();
      // The guide panel handles its own keys while open.
      if (
        guide &&
        ["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Enter", "Home", "End"].includes(event.key)
      )
        return;
      const tuner = useTuner.getState();
      const at = event.timeStamp;
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;

      const actions: Record<string, () => void> = {
        " ": () => void togglePause(),
        f: () => void toggleFullscreen(),
        Escape: () => {
          if (menu) setMenu(null);
          else if (tuner.upNext) cancelUpNext();
          else if (guide) setGuide(() => false);
          else if (tuner.digits) cancelDigits();
          else back();
        },
        ArrowUp: () => tuner.mode !== "vod" && zap(-1, at),
        ArrowDown: () => tuner.mode !== "vod" && zap(1, at),
        ArrowLeft: () => tuner.mode !== "live" && void seekBy(-10),
        ArrowRight: () => tuner.mode !== "live" && void seekBy(10),
        Enter: () => {
          if (tuner.upNext) playNext(at);
          else if (tuner.digits) commitDigits(at);
        },
        Backspace: () => tuner.digits && cancelDigits(),
        m: toggleUserMute,
        a: cycleAudio,
        s: cycleSubtitle,
        g: () => tuner.mode !== "vod" && setGuide((open) => !open),
        i: () => setStats((open) => !open),
      };
      if (/^\d$/.test(key) && tuner.mode !== "vod") {
        event.preventDefault();
        typeDigit(key);
        return;
      }
      const action = actions[key];
      if (!action) return;
      // Space and Enter on a focused button would also click it.
      event.preventDefault();
      action();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
