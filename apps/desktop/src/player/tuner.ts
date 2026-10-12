/**
 * What is tuned, and how changing it feels (ROADMAP M3).
 *
 * The provider takes ~2.5 s to deliver a first frame (docs/DECISIONS.md D2),
 * so a zap is made to feel instant instead: the tuned channel changes in this
 * store synchronously on the key press, so its name and now/next render on
 * the next frame, while mpv keeps the last picture on screen until the new
 * stream's first frame replaces it.
 *
 * Loads are debounced on the trailing edge only during a burst: a single
 * press loads at once; holding a key or typing fast loads only where the user
 * stops, so a run of presses never opens a run of streams.
 *
 * The Live TV preview and the full-screen player are one mpv instance
 * (CLAUDE.md rule 5). The preview is always muted; the player uses the
 * user's own mute choice.
 */

import {
  appendDigit,
  matchTrack,
  noTrackChoice,
  pickOf,
  readAccountPref,
  recordHistory,
  stepChannel,
  trackChoiceKey,
  writeAccountPref,
  type Episode,
  type LiveChannel,
  type Programme,
  type TrackChoice,
} from "@tuner/core";
import { create } from "zustand";
import { channelByNumber, rememberChannel, useLive } from "../data/live";
import { activeClient, activeLibrary, useSession } from "../data/session";
import { open, retry as retryPlayer, setAudioTrack, setSubtitleTrack, stop } from "./controller";
import { mpv } from "./mpv";
import { usePlayer, type Track } from "./store";
import { catchupSource, liveSource, vodSource } from "./streams";

export type TunerView = "none" | "preview" | "player";

/** A movie or an episode in the player. */
export interface VodMedia {
  kind: "vod" | "episode";
  id: number;
  /** Container extension, part of the stream URL. */
  ext: string;
  /** Movie title, or the episode's title. */
  title: string;
  /** Above the title: the year for a movie ("" when unknown), "S2 · E5" for an episode. */
  detail: string;
  /** The series, for episodes: next episode, remembered tracks, Back. */
  series: { id: number; name: string; episodes: Episode[] } | null;
}

/** The episode offered when one ends (SPEC §6: 10-second countdown, cancel). */
export interface UpNext {
  episode: Episode;
  /** `Date.now()` when it plays by itself, or null when autoplay is off. */
  playsAt: number | null;
}

export interface TunerState {
  channelId: number | null;
  mode: "live" | "catchup" | "vod";
  /** What plays in "vod" mode. */
  media: VodMedia | null;
  /** Where Back goes from the player in "vod" mode (the detail page). */
  returnTo: string | null;
  upNext: UpNext | null;
  /** The recorded programme, in catch-up. */
  programme: Programme | null;
  /**
   * mpv's `time-pos` at the recording's first frame. Catch-up files keep the
   * broadcast's timestamps (they start at thousands of seconds) and their
   * duration estimate is wrong, so the position is measured from here and the
   * length is the programme's.
   */
  catchupOrigin: number | null;
  /** The channels up/down walk through: the list the channel was picked from. */
  list: number[];
  view: TunerView;
  /** The user's mute choice for the player (the preview is always muted). */
  userMuted: boolean;
  /** Digits typed for a channel number, shown on screen until committed. */
  digits: string;
  /** A short message for a toast ("No channel 123"). */
  notice: string | null;
  /** Set when the stream failed because the subscription's connections are all in use. */
  inUse: { active: number; max: number } | null;
  /** `performance.now()` of the last user action that changed the channel. */
  changedAt: number;
}

export const useTuner = create<TunerState>(() => ({
  channelId: null,
  mode: "live",
  media: null,
  returnTo: null,
  upNext: null,
  programme: null,
  catchupOrigin: null,
  list: [],
  view: "none",
  userMuted: false,
  digits: "",
  notice: null,
  inUse: null,
  changedAt: 0,
}));

const set = useTuner.setState;
const get = useTuner.getState;

/** Presses closer together than this are one burst. */
const QUIET_MS = 300;
/** How long typed digits wait for more before jumping. */
const DIGIT_COMMIT_MS = 1500;
const NOTICE_MS = 2500;

let lastAsk = Number.NEGATIVE_INFINITY;
let trailing: ReturnType<typeof setTimeout> | undefined;
let digitTimer: ReturnType<typeof setTimeout> | undefined;
let noticeTimer: ReturnType<typeof setTimeout> | undefined;

function schedule(run: () => void) {
  const now = performance.now();
  const inBurst = now - lastAsk < QUIET_MS;
  lastAsk = now;
  clearTimeout(trailing);
  if (inBurst) trailing = setTimeout(run, QUIET_MS);
  else run();
}

export function channelOf(id: number | null): LiveChannel | null {
  return id === null ? null : (useLive.getState().channels.get(id) ?? null);
}

/** Shows a short message over the video or the list. */
export function showNotice(notice: string) {
  clearTimeout(noticeTimer);
  set({ notice });
  noticeTimer = setTimeout(() => set({ notice: null }), NOTICE_MS);
}

export interface TuneOptions {
  /** The list it was picked from (zapping walks it). Defaults to the current one. */
  list?: number[];
  requestedAt?: number;
}

/** Tunes a live channel. The info changes now; the stream follows (see `schedule`). */
export function tune(channelId: number, { list, requestedAt }: TuneOptions = {}) {
  const account = useSession.getState().active;
  const channel = channelOf(channelId);
  if (!account || !channel) return;
  const at = requestedAt ?? performance.now();
  const sameLive = get().channelId === channelId && get().mode === "live";
  set({
    channelId,
    mode: "live",
    media: null,
    upNext: null,
    programme: null,
    list: list ?? get().list,
    inUse: null,
    changedAt: at,
  });
  const status = usePlayer.getState().status;
  if (sameLive && status !== "idle" && status !== "error" && status !== "ended") return;
  schedule(() => {
    if (get().channelId !== channelId || get().mode !== "live") return;
    rememberChannel(channelId);
    const db = activeLibrary();
    if (db) void recordHistory(db, "live", channelId, Date.now());
    void open(liveSource(account, channel), { requestedAt: at });
  });
}

export function zap(delta: number, requestedAt = performance.now()) {
  const { channelId, list } = get();
  const ids = list.length > 0 ? list : useLive.getState().list;
  const next = channelId === null ? (ids[0] ?? null) : stepChannel(ids, channelId, delta);
  if (next !== null) tune(next, { list: ids, requestedAt });
}

/** Plays a recorded programme from the channel's archive. */
export async function playCatchup(channelId: number, programme: Programme, requestedAt?: number) {
  const account = useSession.getState().active;
  const channel = channelOf(channelId);
  if (!account || !channel) return;
  const at = requestedAt ?? performance.now();
  clearTimeout(trailing);
  set({
    channelId,
    mode: "catchup",
    media: null,
    upNext: null,
    programme,
    catchupOrigin: null,
    inUse: null,
    changedAt: at,
  });
  // The recording starts at its first frame: read mpv's position then. The
  // observed `time-pos` may still hold the previous stream's value.
  const onStart = () =>
    void mpv
      .getNumber("time-pos")
      .then((pos) => {
        if (get().programme === programme)
          set({ catchupOrigin: typeof pos === "number" ? pos : 0 });
      })
      .catch(() => undefined);
  await open(await catchupSource(account, channel, programme, onStart), { requestedAt: at });
}

export interface PlayVodOptions {
  /** Seconds to start at (resume). */
  start?: number | null;
  requestedAt?: number;
  /** Where Back goes from the player. */
  returnTo?: string;
}

/** Plays a movie or an episode (SPEC §5–6). */
export function playVod(
  media: VodMedia,
  { start, requestedAt, returnTo }: PlayVodOptions = {},
): Promise<void> {
  const account = useSession.getState().active;
  if (!account) return Promise.resolve();
  const at = requestedAt ?? performance.now();
  clearTimeout(trailing);
  set({
    mode: "vod",
    media,
    upNext: null,
    programme: null,
    inUse: null,
    changedAt: at,
    ...(returnTo ? { returnTo } : {}),
  });
  const db = activeLibrary();
  if (db) void recordHistory(db, media.kind, media.id, Date.now());
  return open(vodSource(account, media, start ?? null), { requestedAt: at });
}

/** Sets or clears the next-episode offer (see vodSession). */
export function setUpNext(upNext: UpNext | null) {
  set({ upNext });
}

/** Adds a typed digit; the jump happens when typing pauses (or on `commitDigits`). */
export function typeDigit(digit: string) {
  set({ digits: appendDigit(get().digits, digit) });
  clearTimeout(digitTimer);
  digitTimer = setTimeout(() => commitDigits(), DIGIT_COMMIT_MS);
}

/** Jumps to the typed channel number. Returns the channel, if one has that number. */
export function commitDigits(requestedAt = performance.now()): LiveChannel | null {
  clearTimeout(digitTimer);
  const { digits } = get();
  set({ digits: "" });
  if (digits === "") return null;
  const channel = channelByNumber(Number(digits));
  if (!channel) {
    showNotice(`No channel ${digits}`);
    return null;
  }
  tune(channel.id, { requestedAt });
  return channel;
}

export function cancelDigits() {
  clearTimeout(digitTimer);
  set({ digits: "" });
}

/** The screen showing the video says where it is; that decides the sound. */
export function setView(view: TunerView) {
  set({ view });
  void applyMute();
}

let muteChain: Promise<unknown> = Promise.resolve();

/**
 * Sets mpv's mute for the current view. Calls are chained: two property
 * writes sent back to back can reach mpv in either order, and a screen change
 * sends one from the screen leaving and one from the screen arriving. With no
 * video shown, mute is left as it is.
 */
function applyMute() {
  const { view, userMuted } = get();
  if (view === "none") return muteChain;
  const mute = view === "player" ? userMuted : true;
  muteChain = muteChain.then(() => mpv.setMute(mute)).catch(() => undefined);
  return muteChain;
}

export function toggleUserMute() {
  set({ userMuted: !get().userMuted });
  void applyMute();
}

export async function stopPlayback() {
  clearTimeout(trailing);
  cancelDigits();
  set({ inUse: null });
  if (usePlayer.getState().status !== "idle") await stop();
}

/**
 * Forgets what was tuned (the active account changed): its channel ids and
 * titles mean nothing in another library. Stop playback first.
 */
export function resetTuner() {
  clearTimeout(trailing);
  cancelDigits();
  set({
    channelId: null,
    mode: "live",
    media: null,
    returnTo: null,
    upNext: null,
    programme: null,
    catchupOrigin: null,
    list: [],
    inUse: null,
  });
}

export function retry() {
  set({ inUse: null });
  void retryPlayer();
}

// --- audio and subtitle tracks, remembered per channel, movie and series ------

/** Where the current stream's track choice is stored: per channel, per movie, per series. */
function trackKey(): string | null {
  const { mode, media, channelId } = get();
  if (mode === "vod" && media) {
    return media.series
      ? trackChoiceKey("series", media.series.id)
      : trackChoiceKey("vod", media.id);
  }
  return channelId === null ? null : trackChoiceKey("live", channelId);
}

async function saveChoice(update: Partial<TrackChoice>) {
  const db = activeLibrary();
  const key = trackKey();
  if (!db || key === null) return;
  const current = await readAccountPref<TrackChoice>(db, key, noTrackChoice);
  await writeAccountPref(db, key, { ...current, ...update });
}

export async function selectAudio(id: number) {
  await setAudioTrack(id);
  await saveChoice({ audio: pickOf(usePlayer.getState().audioTracks, id) });
}

export async function selectSubtitle(id: number | "no") {
  await setSubtitleTrack(id);
  await saveChoice({ sub: id === "no" ? "off" : pickOf(usePlayer.getState().subtitleTracks, id) });
}

function cycle(tracks: Track[], withOff: boolean): number | "no" | null {
  const options: (number | "no")[] = [
    ...tracks.map((t) => t.id),
    ...(withOff ? ["no" as const] : []),
  ];
  if (options.length < 2) return null;
  const selected = tracks.find((t) => t.selected)?.id ?? "no";
  return options[(options.indexOf(selected) + 1) % options.length] ?? null;
}

/** A: next audio track. */
export function cycleAudio() {
  const next = cycle(usePlayer.getState().audioTracks, false);
  if (typeof next === "number") void selectAudio(next);
}

/** S: next subtitle track, then off. */
export function cycleSubtitle() {
  const next = cycle(usePlayer.getState().subtitleTracks, true);
  if (next !== null) void selectSubtitle(next);
}

/** After each new stream's track list arrives, applies the remembered choice once. */
let applyFor: string | null = null;
usePlayer.subscribe((state, prev) => {
  if (state.loads !== prev.loads) applyFor = trackKey();
  const key = trackKey();
  if (applyFor === null || applyFor !== key) return;
  if (state.audioTracks.length === 0 && state.subtitleTracks.length === 0) return;
  applyFor = null;
  const db = activeLibrary();
  if (!db) return;
  void readAccountPref<TrackChoice>(db, key, noTrackChoice).then((choice) => {
    if (trackKey() !== key) return;
    const { audioTracks, subtitleTracks } = usePlayer.getState();
    if (choice.audio) {
      const id = matchTrack(audioTracks, choice.audio);
      if (id !== null && !audioTracks.find((t) => t.id === id)?.selected) void setAudioTrack(id);
    }
    if (choice.sub === "off") {
      if (subtitleTracks.some((t) => t.selected)) void setSubtitleTrack("no");
    } else if (choice.sub) {
      const id = matchTrack(subtitleTracks, choice.sub);
      if (id !== null) void setSubtitleTrack(id);
    }
  });
});

/** Seconds into the recording, or null before its first frame. */
export function catchupPosition(timePos: number | null, origin: number | null): number | null {
  return timePos === null || origin === null ? null : Math.max(0, timePos - origin);
}

// --- "too many connections" ---------------------------------------------------

/**
 * When a live stream gives up, asks the provider whether every connection of
 * the subscription is taken (often by another device), so the error can say so.
 */
usePlayer.subscribe((state, prev) => {
  if (state.status !== "error" || prev.status === "error" || !state.live) return;
  void activeClient()
    .then((client) => client?.accountInfo())
    .then((info) => {
      const active = info?.activeConnections ?? 0;
      const max = info?.maxConnections ?? 0;
      if (max > 0 && active >= max && usePlayer.getState().status === "error") {
        set({ inUse: { active, max } });
      }
    })
    .catch(() => undefined);
});
