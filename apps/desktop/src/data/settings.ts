/**
 * App-wide settings (SPEC §9), kept in app.db and read once at start, before
 * the window shows (the theme must apply before the first paint). They are
 * the same for every account: playback, refresh interval and appearance.
 * Per-account settings (hidden categories, auto-play next episode) stay in
 * each account's database.
 */

import { DEFAULT_REFRESH_HOURS } from "@tuner/core";
import { create } from "zustand";
import { readAppSetting, setRefreshHours, writeAppSetting } from "./session";

export type Theme = "dark" | "light";
export type BufferSize = "small" | "normal" | "large";
export type Deinterlace = "auto" | "on" | "off";

export interface AppSettings {
  theme: Theme;
  /** Hours after which lists refresh on launch; 0 = only by hand. */
  refreshHours: number;
  /** A `LANGUAGES` id, or null for whatever the stream marks as default. */
  audioLanguage: string | null;
  subtitleLanguage: string | null;
  hardwareDecoding: boolean;
  buffer: BufferSize;
  deinterlace: Deinterlace;
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: "dark",
  refreshHours: DEFAULT_REFRESH_HOURS,
  audioLanguage: null,
  subtitleLanguage: null,
  hardwareDecoding: true,
  buffer: "normal",
  deinterlace: "auto",
};

export const REFRESH_CHOICES = [6, 12, 24, 0] as const;

/**
 * Languages offered for audio and subtitles. Providers tag tracks with ISO
 * 639-1 or either 639-2 code ("fr", "fra", "fre"), so each lists all of them
 * for mpv's `alang`/`slang`.
 */
export const LANGUAGES = [
  { id: "en", label: "English", codes: "en,eng" },
  { id: "fr", label: "French", codes: "fr,fra,fre" },
  { id: "es", label: "Spanish", codes: "es,spa" },
  { id: "de", label: "German", codes: "de,deu,ger" },
  { id: "it", label: "Italian", codes: "it,ita" },
  { id: "pt", label: "Portuguese", codes: "pt,por" },
  { id: "nl", label: "Dutch", codes: "nl,nld,dut" },
  { id: "ar", label: "Arabic", codes: "ar,ara" },
  { id: "tr", label: "Turkish", codes: "tr,tur" },
  { id: "pl", label: "Polish", codes: "pl,pol" },
] as const;

export const languageCodes = (id: string | null) => LANGUAGES.find((l) => l.id === id)?.codes ?? "";

const KEY = "app.settings";

export const useSettings = create<AppSettings>(() => DEFAULT_SETTINGS);

/** Applies the theme to the document (tokens.css switches on `data-theme`). */
function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
}

/** Keeps only known keys with valid values, so a damaged row falls back per field. */
function sanitize(value: unknown): AppSettings {
  const raw = (typeof value === "object" && value !== null ? value : {}) as Record<string, unknown>;
  const pick = <K extends keyof AppSettings>(key: K, ok: (v: unknown) => boolean) =>
    (ok(raw[key]) ? raw[key] : DEFAULT_SETTINGS[key]) as AppSettings[K];
  const language = (v: unknown) => v === null || LANGUAGES.some((l) => l.id === v);
  return {
    theme: pick("theme", (v) => v === "dark" || v === "light"),
    refreshHours: pick("refreshHours", (v) => (REFRESH_CHOICES as readonly unknown[]).includes(v)),
    audioLanguage: pick("audioLanguage", language),
    subtitleLanguage: pick("subtitleLanguage", language),
    hardwareDecoding: pick("hardwareDecoding", (v) => typeof v === "boolean"),
    buffer: pick("buffer", (v) => v === "small" || v === "normal" || v === "large"),
    deinterlace: pick("deinterlace", (v) => v === "auto" || v === "on" || v === "off"),
  };
}

/** Reads the settings (once, at start) and applies the theme. */
export async function loadSettings(): Promise<void> {
  let stored: unknown = null;
  try {
    const value = await readAppSetting(KEY);
    stored = value === null ? null : JSON.parse(value);
  } catch {
    // Missing or damaged: the defaults.
  }
  const settings = sanitize(stored);
  useSettings.setState(settings, true);
  applyTheme(settings.theme);
  setRefreshHours(settings.refreshHours);
}

/** Changes settings now and stores them. */
export async function updateSettings(patch: Partial<AppSettings>): Promise<void> {
  const next = sanitize({ ...useSettings.getState(), ...patch });
  useSettings.setState(next, true);
  if (patch.theme) applyTheme(next.theme);
  setRefreshHours(next.refreshHours);
  await writeAppSetting(KEY, JSON.stringify(next));
}

/** The settings as stored (dev suite: back up and restore exactly). */
export const settingsKey = KEY;
