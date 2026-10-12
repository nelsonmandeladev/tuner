//! Debug-only stream loader for the M1 playback spike (`/debug/player`).
//!
//! Reads the Xtream dev credentials from the repo's `.env.local`, builds the
//! stream URL here in Rust and hands it straight to mpv. The URL contains the
//! password, so it never crosses into the webview, never reaches a log, and any
//! error string is scrubbed before it is returned (CLAUDE.md rule 3).
//!
//! This module is compiled into debug builds only (`cfg(debug_assertions)` in
//! `lib.rs`). Release builds have no access to `.env.local` at all.

use std::{collections::HashMap, fs, path::PathBuf};

use serde::Deserialize;
use tauri::{AppHandle, Runtime};
use tauri_plugin_libmpv::MpvExt;

use crate::streams::encode_segment;

/// The window that hosts the mpv instance (the only window).
const WINDOW: &str = "main";

/// `.env.local` sits at the repo root, three levels above this crate.
fn env_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../../.env.local")
}

struct Account {
    server: String,
    username: String,
    password: String,
}

impl Account {
    fn load() -> Result<Self, String> {
        let text = fs::read_to_string(env_path())
            .map_err(|_| "Could not read .env.local at the repo root".to_string())?;
        let vars: HashMap<&str, &str> = text
            .lines()
            .map(str::trim)
            .filter(|line| !line.starts_with('#'))
            .filter_map(|line| line.split_once('='))
            .map(|(k, v)| (k.trim(), v.trim().trim_matches(|c| c == '"' || c == '\'')))
            .collect();
        let get = |key: &str| {
            vars.get(key)
                .filter(|v| !v.is_empty())
                .map(|v| v.to_string())
                .ok_or_else(|| format!("{key} is missing from .env.local"))
        };
        Ok(Self {
            server: get("XTREAM_SERVER")?.trim_end_matches('/').to_string(),
            username: get("XTREAM_USERNAME")?,
            password: get("XTREAM_PASSWORD")?,
        })
    }

    /// Stream URL as in docs/XTREAM_API.md "Stream URLs".
    fn stream_url(&self, source: &DebugSource) -> String {
        format!(
            "{}/{}/{}/{}/{}.{}",
            self.server,
            source.kind.path(),
            encode_segment(&self.username),
            encode_segment(&self.password),
            source.id,
            source.ext
        )
    }

    /// Removes the server and credentials from text that may be shown or logged.
    fn scrub(&self, text: &str) -> String {
        [
            self.server.clone(),
            self.username.clone(),
            self.password.clone(),
            encode_segment(&self.username),
            encode_segment(&self.password),
        ]
        .iter()
        .fold(text.to_string(), |acc, secret| {
            acc.replace(secret.as_str(), "***")
        })
    }
}

#[derive(Deserialize, Clone, Copy)]
#[serde(rename_all = "lowercase")]
pub enum StreamKind {
    Live,
    Movie,
    Series,
}

impl StreamKind {
    fn path(self) -> &'static str {
        match self {
            Self::Live => "live",
            Self::Movie => "movie",
            Self::Series => "series",
        }
    }
}

#[derive(Deserialize)]
pub struct DebugSource {
    kind: StreamKind,
    id: u64,
    /// Container extension: `ts` / `m3u8` for live, the item's `container_extension` for VOD.
    ext: String,
}

/// Loads a stream from the dev account into the window's mpv instance.
///
/// `loadfile … replace` stops the current file (closing its connection) before
/// the new one opens, so the account never holds two connections.
#[tauri::command]
pub async fn debug_stream_load<R: Runtime>(
    app: AppHandle<R>,
    source: DebugSource,
) -> Result<(), String> {
    if source.ext.is_empty() || !source.ext.chars().all(|c| c.is_ascii_alphanumeric()) {
        return Err("Extension must be letters and digits only".into());
    }
    let account = Account::load()?;
    let url = account.stream_url(&source);

    tauri::async_runtime::spawn_blocking(move || {
        app.mpv()
            .command("loadfile", &vec![url.into(), "replace".into()], WINDOW)
            .map_err(|e| account.scrub(&e.to_string()))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// The M1 suite plan when the app was started with `TUNER_M1_SUITE` set, e.g.
/// `live=1234,hevc=1240,ac3=5678.mkv,eac3=5679.mkv`. The debug screen then runs
/// the acceptance suite by itself (see `screens/debug/m1Suite.ts`).
#[tauri::command]
pub fn debug_autorun() -> Option<String> {
    std::env::var("TUNER_M1_SUITE")
        .ok()
        .filter(|v| !v.is_empty())
}

/// Prints one player trace line to the `tauri dev` terminal. The webview
/// redacts every line before sending it; nothing here contains a URL.
#[tauri::command]
pub fn debug_trace(line: String) {
    println!("[player] {line}");
}

#[derive(serde::Serialize)]
pub struct DevCredentials {
    server: String,
    username: String,
    password: String,
}

/// The .env.local account, only when the app was started with
/// `TUNER_M2_SUITE=1`: the M2 suite connects with it exactly as the Connect
/// form would. Debug builds only, like the rest of this module.
#[tauri::command]
pub fn debug_m2_credentials() -> Result<Option<DevCredentials>, String> {
    if std::env::var("TUNER_M2_SUITE").ok().as_deref() != Some("1") {
        return Ok(None);
    }
    let account = Account::load()?;
    Ok(Some(DevCredentials {
        server: account.server,
        username: account.username,
        password: account.password,
    }))
}

/// When the process started, for cold-start timings (`debug_process_ms`).
static PROCESS_START: std::sync::OnceLock<std::time::Instant> = std::sync::OnceLock::new();

/// Called first thing in `run()`.
pub fn mark_process_start() {
    PROCESS_START.get_or_init(std::time::Instant::now);
}

/// Milliseconds since the process started (the M5 suite times cold start to Home).
#[tauri::command]
pub fn debug_process_ms() -> f64 {
    PROCESS_START
        .get()
        .map_or(-1.0, |start| start.elapsed().as_secs_f64() * 1000.0)
}

/// The M5 suite plan when the app was started with `TUNER_M5_SUITE` (see
/// `screens/debug/m5Suite.ts`).
#[tauri::command]
pub fn debug_m5_suite() -> Option<String> {
    std::env::var("TUNER_M5_SUITE")
        .ok()
        .filter(|v| !v.is_empty())
}

/// The M4 suite plan when the app was started with `TUNER_M4_SUITE`, e.g.
/// `movie=1234,series=5678[,phase=restart]` (see `screens/debug/m4Suite.ts`).
#[tauri::command]
pub fn debug_m4_suite() -> Option<String> {
    std::env::var("TUNER_M4_SUITE")
        .ok()
        .filter(|v| !v.is_empty())
}

/// The M3 suite plan when the app was started with `TUNER_M3_SUITE`, e.g.
/// `live=1234,archive=1240`: stream ids from the synced library. The Live TV
/// screen then runs the suite by itself (see `screens/debug/m3Suite.ts`).
#[tauri::command]
pub fn debug_m3_suite() -> Option<String> {
    std::env::var("TUNER_M3_SUITE")
        .ok()
        .filter(|v| !v.is_empty())
}
