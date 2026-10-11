/**
 * Player sources for the active account. The webview names what to play;
 * Rust builds the URL with the password from the keychain and loads it into
 * mpv (src-tauri/src/streams.rs), so stream URLs never exist on this side.
 */

import { invoke } from "@tauri-apps/api/core";
import {
  readAccountPref,
  timeshiftMinutes,
  timeshiftStart,
  writeAccountPref,
  type Account,
  type LiveChannel,
  type Programme,
  type TimeshiftForm,
} from "@tuner/core";
import { activeLibrary } from "../data/session";
import type { PlayerSource } from "./controller";

type StreamRequest =
  | { kind: "live" | "movie" | "series"; id: number; ext: string }
  | { kind: "timeshift"; id: number; start: string; minutes: number; form: TimeshiftForm };

function load(account: Account, request: StreamRequest) {
  return invoke<void>("stream_load", {
    account: { id: account.id, server: account.server, username: account.username },
    request,
  });
}

/**
 * Live format: MPEG-TS whenever the account allows it. HLS opens in 13–27 s
 * and leaves provider sessions behind (docs/DECISIONS.md D2).
 */
export function liveExt(account: Account): "ts" | "m3u8" {
  const formats = account.allowedFormats;
  return formats.length === 0 || formats.includes("ts") || !formats.includes("m3u8")
    ? "ts"
    : "m3u8";
}

export function liveSource(account: Account, channel: LiveChannel): PlayerSource {
  return {
    label: `live ${channel.id}`,
    live: true,
    load: () => load(account, { kind: "live", id: channel.id, ext: liveExt(account) }),
  };
}

const PREF_TIMESHIFT_FORM = "catchup.form";

/**
 * A recorded programme. The path form is tried first; if it fails before
 * the first frame, the `timeshift.php` form is tried, and whichever plays is
 * remembered for the account (docs/XTREAM_API.md "Stream URLs").
 */
export async function catchupSource(
  account: Account,
  channel: LiveChannel,
  programme: Programme,
  /** Called at the recording's first frame, whichever URL form played. */
  onStart?: () => void,
): Promise<PlayerSource> {
  const db = activeLibrary();
  const preferred = db
    ? await readAccountPref<TimeshiftForm>(db, PREF_TIMESHIFT_FORM, "path")
    : "path";
  const start = timeshiftStart(programme.start, account.timezone);
  const minutes = timeshiftMinutes(programme.start, programme.end);
  const make = (form: TimeshiftForm, other: TimeshiftForm | null): PlayerSource => ({
    label: `catch-up ${channel.id} ${start} ${minutes}m (${form})`,
    live: false,
    load: () => load(account, { kind: "timeshift", id: channel.id, start, minutes, form }),
    fallback: other ? () => make(other, null) : undefined,
    onFirstFrame: () => {
      if (db && form !== preferred) void writeAccountPref(db, PREF_TIMESHIFT_FORM, form);
      onStart?.();
    },
  });
  return make(preferred, preferred === "path" ? "query" : "path");
}
