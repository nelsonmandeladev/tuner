import type { Programme } from "@tuner/core";
import { useCallback, useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import { hasModKey } from "../app/platform";
import { Button } from "../components/Button";
import { EmptyState } from "../components/EmptyState";
import { Screen } from "../components/Screen";
import { Toast } from "../components/Toast";
import { useNow, wantEpg } from "../data/epg";
import {
  clearReveal,
  loadLive,
  selectCategory,
  selectChannel,
  setHidden,
  useLive,
} from "../data/live";
import { useSession } from "../data/session";
import { enterPlayer } from "../player/fullscreen";
import {
  cancelDigits,
  commitDigits,
  playCatchup,
  setView,
  tune,
  typeDigit,
  useTuner,
} from "../player/tuner";
import { CategoryList } from "../components/CategoryList";
import { roomFor } from "../app/layout";
import { FlexPane, Pane } from "../components/Pane";
import { ResizeHandle } from "../components/ResizeHandle";
import { ChannelList } from "./live/ChannelList";
import { NumberEntry } from "./live/NumberEntry";
import { PreviewPane } from "./live/PreviewPane";

/**
 * Live TV (SPEC §3, design/screens/LiveTV.dc.html): categories, the channel
 * list, and a preview of the selected channel. Selecting a channel plays it
 * muted in the preview; Enter or a double-click opens the player on the same
 * stream (CLAUDE.md rule 5).
 */
export function LiveTV() {
  const navigate = useNavigate();
  const status = useLive((s) => s.status);
  const accountId = useSession((s) => s.active?.id);
  const syncing = useSession((s) => s.sync.running);
  const selectedId = useLive((s) => s.selectedId);
  const channel = useLive((s) =>
    s.selectedId === null ? null : (s.channels.get(s.selectedId) ?? null),
  );
  const notice = useTuner((s) => s.notice);
  const categories = useLive((s) => s.categories);
  const hiddenCategories = useLive((s) => s.hiddenCategories);
  const categoryId = useLive((s) => s.categoryId);
  const scrollToIndex = useRef<((index: number) => void) | null>(null);
  const screen = useRef<HTMLDivElement>(null);
  useNow();

  useEffect(() => {
    void loadLive();
  }, [accountId, syncing]);

  useEffect(() => {
    setView("preview");
    return () => setView("none");
  }, []);

  /** Selecting is tuning: the preview follows the list. */
  const pick = useCallback((id: number, at = performance.now()) => {
    selectChannel(id);
    tune(id, { list: useLive.getState().list, requestedAt: at });
  }, []);

  const openPlayer = useCallback(
    (id?: number) => {
      const target = id ?? useLive.getState().selectedId;
      if (target === null) return;
      if (useTuner.getState().channelId !== target) pick(target);
      void enterPlayer(navigate);
    },
    [navigate, pick],
  );

  // First visit: play the remembered (or first) channel. Coming back from the
  // player: show where zapping ended. Coming from search: play what was chosen.
  const reveal = useLive((s) => s.reveal);
  useEffect(() => {
    if (status !== "ready") return;
    const tuned = useTuner.getState().channelId;
    const live = useLive.getState();
    if (live.reveal !== null) {
      const id = live.reveal;
      clearReveal();
      pick(id);
    } else if (tuned !== null && live.channels.has(tuned) && useTuner.getState().mode === "live") {
      if (tuned !== live.selectedId) selectChannel(tuned);
      tune(tuned, { list: live.list });
    } else if (live.selectedId !== null) {
      pick(live.selectedId);
    }
  }, [status, pick, reveal]);

  // Keep the selected row in view (keyboard, number entry, return from the player).
  useEffect(() => {
    if (selectedId === null) return;
    const index = useLive.getState().list.indexOf(selectedId);
    if (index >= 0) scrollToIndex.current?.(index);
  }, [selectedId]);

  // Number entry jumps tune the channel; the list follows.
  useEffect(
    () =>
      useTuner.subscribe((s, prev) => {
        if (s.channelId !== prev.channelId && s.channelId !== null && s.mode === "live") {
          if (s.channelId !== useLive.getState().selectedId) selectChannel(s.channelId);
        }
      }),
    [],
  );

  // The preview's channel always has its schedule, even when its row is off screen.
  useEffect(() => {
    wantEpg("preview", selectedId === null ? [] : [selectedId]);
    return () => wantEpg("preview", []);
  }, [selectedId]);

  useLiveKeys(pick, openPlayer);

  if (status === "error") {
    return (
      <Screen title="Live TV">
        <EmptyState
          message="Your channels could not be read from the local library."
          action={<Button onClick={() => void loadLive()}>Try again</Button>}
        />
      </Screen>
    );
  }
  if (status === "ready" && useLive.getState().channels.size === 0) {
    return (
      <Screen title="Live TV">
        <EmptyState message="Channels from your subscription appear here after the first sync." />
      </Screen>
    );
  }

  return (
    // Categories | channels | preview, the outer two resizable (M5 review).
    <div ref={screen} className="relative flex h-full" data-live-screen>
      <Pane id="live.categories">
        <CategoryList
          categories={categories}
          hidden={hiddenCategories}
          activeId={categoryId}
          onSelect={selectCategory}
          onSetHidden={(id, hidden) => void setHidden(id, hidden)}
        />
      </Pane>
      <ResizeHandle
        pane="live.categories"
        edge="end"
        label="categories"
        room={() => roomFor(screen.current, "live.categories", ["live.preview"])}
      />
      <FlexPane>
        <ChannelList onPick={pick} onOpen={openPlayer} scrollRef={scrollToIndex} />
      </FlexPane>
      <ResizeHandle
        pane="live.preview"
        edge="start"
        label="preview"
        room={() => roomFor(screen.current, "live.preview", ["live.categories"])}
      />
      <Pane id="live.preview">
        <PreviewPane
          channel={channel}
          onWatch={() => openPlayer()}
          onCatchup={(programme: Programme) => {
            if (!channel) return;
            void enterPlayer(navigate, playCatchup(channel.id, programme));
          }}
        />
      </Pane>
      <NumberEntry />
      <Toast message={notice} />
    </div>
  );
}

/**
 * Keyboard for the screen (DESIGN.md "Accessibility and input"): arrows move
 * in the focused list, Enter or F opens the player, digits jump to a channel
 * number, Ctrl/⌘+F or / goes to the filter.
 */
function useLiveKeys(pick: (id: number, at?: number) => void, openPlayer: (id?: number) => void) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.altKey) return;
      const target = event.target as HTMLElement | null;
      const inFilter = target?.id === "channel-filter";
      const pane = target?.closest<HTMLElement>("[data-pane]")?.dataset.pane ?? "channels";
      const live = useLive.getState();
      const at = event.timeStamp;

      if (
        (hasModKey(event) && event.key.toLowerCase() === "f") ||
        (!inFilter && event.key === "/")
      ) {
        event.preventDefault();
        document.getElementById("channel-filter")?.focus();
        return;
      }
      if (hasModKey(event)) return;
      if (inFilter) {
        if (event.key === "ArrowDown" || event.key === "Enter") {
          event.preventDefault();
          const first = live.list[0];
          if (
            event.key === "Enter" &&
            live.selectedId !== null &&
            live.list.includes(live.selectedId)
          ) {
            openPlayer();
          } else if (first !== undefined) {
            pick(first, at);
            focusChannel(first);
          }
        }
        return;
      }
      if (target instanceof HTMLInputElement) return;

      const digits = useTuner.getState().digits;
      if (/^\d$/.test(event.key)) {
        event.preventDefault();
        typeDigit(event.key);
        return;
      }
      if (digits && event.key === "Enter") {
        event.preventDefault();
        commitDigits(at);
        return;
      }
      if (digits && (event.key === "Escape" || event.key === "Backspace")) {
        event.preventDefault();
        cancelDigits();
        return;
      }

      if (pane === "categories" && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
        event.preventDefault();
        const ids = live.categories.map((c) => c.id);
        const next = ids[ids.indexOf(live.categoryId) + (event.key === "ArrowDown" ? 1 : -1)];
        if (next !== undefined) {
          selectCategory(next);
          document.querySelector<HTMLElement>(`[data-category="${CSS.escape(next)}"]`)?.focus();
        }
        return;
      }

      const step = { ArrowDown: 1, ArrowUp: -1, PageDown: 10, PageUp: -10 }[event.key];
      if (step !== undefined || event.key === "Home" || event.key === "End") {
        if (pane === "preview") return;
        event.preventDefault();
        const { list, selectedId } = live;
        if (list.length === 0) return;
        const index = selectedId === null ? -1 : list.indexOf(selectedId);
        const nextIndex =
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? list.length - 1
              : Math.min(list.length - 1, Math.max(0, index + step!));
        const id = list[nextIndex]!;
        if (id !== selectedId) pick(id, at);
        focusChannel(id);
        return;
      }
      if ((event.key === "Enter" && pane === "channels") || event.key.toLowerCase() === "f") {
        if (target instanceof HTMLButtonElement && !target.dataset.channel) return;
        event.preventDefault();
        openPlayer();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [pick, openPlayer]);
}

/** Moves focus to a channel row once it is rendered (the list scrolls it into view first). */
function focusChannel(id: number) {
  requestAnimationFrame(() =>
    document.getElementById(`channel-${id}`)?.focus({ preventScroll: true }),
  );
}
