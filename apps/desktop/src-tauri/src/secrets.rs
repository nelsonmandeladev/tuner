//! Passwords in the OS keychain (docs/DECISIONS.md D5): Windows Credential
//! Manager, macOS Keychain. Service name: the app identifier. Keys are
//! `xtream:<accountId>`; nothing else can be read or written from the webview.

use keyring::{Entry, Error};
use tauri::{AppHandle, Runtime};

fn entry<R: Runtime>(app: &AppHandle<R>, key: &str) -> Result<Entry, String> {
    let valid = key.strip_prefix("xtream:").is_some_and(|id| {
        !id.is_empty()
            && id.len() <= 64
            && id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-')
    });
    if !valid {
        return Err("Invalid secret key".into());
    }
    Entry::new(&app.config().identifier, key).map_err(|e| e.to_string())
}

/// An account's password, for Rust code that builds stream URLs (`streams.rs`).
pub(crate) fn account_password<R: Runtime>(
    app: &AppHandle<R>,
    account_id: &str,
) -> Result<Option<String>, String> {
    match entry(app, &format!("xtream:{account_id}"))?.get_password() {
        Ok(password) => Ok(Some(password)),
        Err(Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn secret_get<R: Runtime>(app: AppHandle<R>, key: String) -> Result<Option<String>, String> {
    match entry(&app, &key)?.get_password() {
        Ok(password) => Ok(Some(password)),
        Err(Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn secret_set<R: Runtime>(app: AppHandle<R>, key: String, value: String) -> Result<(), String> {
    entry(&app, &key)?
        .set_password(&value)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn secret_delete<R: Runtime>(app: AppHandle<R>, key: String) -> Result<(), String> {
    match entry(&app, &key)?.delete_credential() {
        Ok(()) | Err(Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}
