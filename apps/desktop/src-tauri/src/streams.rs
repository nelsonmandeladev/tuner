//! Loads provider streams into the window's mpv instance.
//!
//! Stream URLs carry the username and password in their path (or query, for
//! one catch-up form), so they are built here and handed straight to mpv. The
//! webview sends the account id, server, username and what to play; the
//! password comes from the OS keychain (docs/DECISIONS.md D5). The URL never
//! crosses into the webview, so no JS error message, trace or devtools panel
//! can show it, and any error returned from here is scrubbed first
//! (CLAUDE.md rule 3). Nothing in this module logs.
//!
//! `loadfile … replace` stops the current file (closing its connection)
//! before the next one opens, so the account never holds two connections
//! (CLAUDE.md rule 5).

use serde::Deserialize;
use tauri::{AppHandle, Runtime};
use tauri_plugin_libmpv::MpvExt;

use crate::secrets;

/// The window that hosts the mpv instance (the only window).
const WINDOW: &str = "main";

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamAccount {
    id: String,
    /// `scheme://host[:port]`, as the core's `normalizeServer` stores it.
    server: String,
    username: String,
}

#[derive(Deserialize, Clone, Copy)]
#[serde(rename_all = "lowercase")]
pub enum TimeshiftForm {
    Path,
    Query,
}

/// What to play. URL shapes are in docs/XTREAM_API.md "Stream URLs".
#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum StreamRequest {
    Live {
        id: u64,
        ext: String,
    },
    Movie {
        id: u64,
        ext: String,
    },
    Series {
        id: u64,
        ext: String,
    },
    /// Catch-up. `start` is `YYYY-MM-DD:HH-MM` on the server's clock (the
    /// core's `timeshiftStart`).
    Timeshift {
        id: u64,
        start: String,
        minutes: u32,
        form: TimeshiftForm,
    },
}

/// Percent-encodes everything outside the RFC 3986 unreserved set, so a
/// password with `/`, `?`, `#` or `&` cannot change the shape of the URL.
pub(crate) fn encode_segment(segment: &str) -> String {
    segment
        .bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' => {
                (b as char).to_string()
            }
            _ => format!("%{b:02X}"),
        })
        .collect()
}

fn valid_ext(ext: &str) -> bool {
    (1..=8).contains(&ext.len()) && ext.bytes().all(|b| b.is_ascii_alphanumeric())
}

/// `YYYY-MM-DD:HH-MM`
fn valid_start(start: &str) -> bool {
    let b = start.as_bytes();
    b.len() == 16
        && b.iter().enumerate().all(|(i, c)| match i {
            4 | 7 | 13 => *c == b'-',
            10 => *c == b':',
            _ => c.is_ascii_digit(),
        })
}

/// `http(s)://host[:port]` and nothing else: no path, credentials or spaces.
fn valid_server(server: &str) -> bool {
    let rest = server
        .strip_prefix("http://")
        .or_else(|| server.strip_prefix("https://"));
    rest.is_some_and(|host| {
        !host.is_empty()
            && host
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'-' | b':' | b'[' | b']'))
    })
}

fn build_url(
    server: &str,
    user: &str,
    pass: &str,
    request: &StreamRequest,
) -> Result<String, String> {
    let (u, p) = (encode_segment(user), encode_segment(pass));
    let simple = |path: &str, id: u64, ext: &str| {
        if valid_ext(ext) {
            Ok(format!("{server}/{path}/{u}/{p}/{id}.{ext}"))
        } else {
            Err("Invalid stream extension".to_string())
        }
    };
    match request {
        StreamRequest::Live { id, ext } => simple("live", *id, ext),
        StreamRequest::Movie { id, ext } => simple("movie", *id, ext),
        StreamRequest::Series { id, ext } => simple("series", *id, ext),
        StreamRequest::Timeshift {
            id,
            start,
            minutes,
            form,
        } => {
            if !valid_start(start) || *minutes == 0 || *minutes > 24 * 60 {
                return Err("Invalid catch-up time".into());
            }
            Ok(match form {
                TimeshiftForm::Path => {
                    format!("{server}/timeshift/{u}/{p}/{minutes}/{start}/{id}.ts")
                }
                TimeshiftForm::Query => format!(
                    "{server}/streaming/timeshift.php?username={u}&password={p}&stream={id}&start={}&duration={minutes}",
                    encode_segment(start)
                ),
            })
        }
    }
}

/// Removes credentials from text that may reach the webview.
fn scrub(text: &str, secrets: &[&str]) -> String {
    secrets
        .iter()
        .filter(|s| !s.is_empty())
        .flat_map(|s| [s.to_string(), encode_segment(s)])
        .fold(text.to_string(), |acc, s| acc.replace(&s, "***"))
}

/// Plays `request` from `account` in the window's mpv instance.
#[tauri::command]
pub async fn stream_load<R: Runtime>(
    app: AppHandle<R>,
    account: StreamAccount,
    request: StreamRequest,
) -> Result<(), String> {
    if !valid_server(&account.server) {
        return Err("Invalid server address".into());
    }
    let password = secrets::account_password(&app, &account.id)?
        .ok_or_else(|| "The password for this subscription is missing".to_string())?;
    let url = build_url(&account.server, &account.username, &password, &request)
        .map_err(|e| scrub(&e, &[&account.username, &password]))?;

    tauri::async_runtime::spawn_blocking(move || {
        app.mpv()
            .command("loadfile", &vec![url.into(), "replace".into()], WINDOW)
            .map_err(|e| scrub(&e.to_string(), &[&account.username, &password]))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    const SERVER: &str = "http://provider.example:8080";

    #[test]
    fn builds_every_form_with_encoded_credentials() {
        let live = StreamRequest::Live {
            id: 7,
            ext: "ts".into(),
        };
        assert_eq!(
            build_url(SERVER, "alice", "s3/c#?", &live).unwrap(),
            "http://provider.example:8080/live/alice/s3%2Fc%23%3F/7.ts"
        );
        let path = StreamRequest::Timeshift {
            id: 7,
            start: "2026-10-11:21-10".into(),
            minutes: 60,
            form: TimeshiftForm::Path,
        };
        assert_eq!(
            build_url(SERVER, "alice", "pw", &path).unwrap(),
            "http://provider.example:8080/timeshift/alice/pw/60/2026-10-11:21-10/7.ts"
        );
        let query = StreamRequest::Timeshift {
            id: 7,
            start: "2026-10-11:21-10".into(),
            minutes: 60,
            form: TimeshiftForm::Query,
        };
        assert_eq!(
            build_url(SERVER, "alice", "p&w", &query).unwrap(),
            "http://provider.example:8080/streaming/timeshift.php?username=alice&password=p%26w&stream=7&start=2026-10-11%3A21-10&duration=60"
        );
    }

    #[test]
    fn rejects_bad_input() {
        let bad_ext = StreamRequest::Movie {
            id: 1,
            ext: "../x".into(),
        };
        assert!(build_url(SERVER, "a", "b", &bad_ext).is_err());
        let bad_start = StreamRequest::Timeshift {
            id: 1,
            start: "2026-10-11 21:10".into(),
            minutes: 60,
            form: TimeshiftForm::Path,
        };
        assert!(build_url(SERVER, "a", "b", &bad_start).is_err());
        assert!(valid_server(SERVER));
        assert!(valid_server("https://[::1]:443"));
        assert!(!valid_server("file:///etc/passwd"));
        assert!(!valid_server("http://host/path"));
        assert!(!valid_server("http://user:pw@host"));
    }

    #[test]
    fn scrubs_raw_and_encoded_secrets() {
        assert_eq!(
            scrub(
                "open http://h/live/al ice/p%2Fw/1.ts failed",
                &["al ice", "p/w"]
            ),
            "open http://h/live/***/***/1.ts failed"
        );
    }
}
