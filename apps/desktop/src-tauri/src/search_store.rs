//! The search index on disk (docs/DECISIONS.md D8): one file per account in
//! the app cache folder, so a cold start loads the index instead of
//! rebuilding it. The webview's search worker builds and reads the index; this
//! only moves its bytes, as raw IPC bodies (no JSON encoding of megabytes).
//!
//! The file holds titles and artwork URLs from the library, no credentials.
//! It is a cache: if it is missing or out of date the app rebuilds it.

use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
};

use tauri::{
    AppHandle, Manager, Runtime,
    ipc::{InvokeBody, Request, Response},
};

/// Header carrying the account id on `search_index_write` (the body is the index).
const ACCOUNT_HEADER: &str = "x-account";

/// Account ids are UUIDs: anything else could name a path outside the folder.
fn valid_account(id: &str) -> bool {
    !id.is_empty() && id.len() <= 64 && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
}

fn index_path<R: Runtime>(app: &AppHandle<R>, account: &str) -> Result<PathBuf, String> {
    if !valid_account(account) {
        return Err("invalid account id".into());
    }
    let dir = app
        .path()
        .app_cache_dir()
        .map_err(|_| "no cache folder".to_string())?;
    Ok(dir.join("search").join(format!("{account}.idx")))
}

/// The stored index, or an empty body when there is none.
#[tauri::command]
pub async fn search_index_read<R: Runtime>(
    app: AppHandle<R>,
    account: String,
) -> Result<Response, String> {
    let path = index_path(&app, &account)?;
    tauri::async_runtime::spawn_blocking(move || match fs::read(&path) {
        Ok(bytes) => Ok(Response::new(bytes)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(Response::new(Vec::new())),
        Err(_) => Err("could not read the search index".to_string()),
    })
    .await
    .map_err(|_| "could not read the search index".to_string())?
}

/// Replaces the stored index with the raw request body.
#[tauri::command]
pub async fn search_index_write<R: Runtime>(
    app: AppHandle<R>,
    request: Request<'_>,
) -> Result<(), String> {
    let account = request
        .headers()
        .get(ACCOUNT_HEADER)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_owned();
    let path = index_path(&app, &account)?;
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("expected raw bytes".into());
    };
    let bytes = bytes.clone();
    tauri::async_runtime::spawn_blocking(move || write_atomic(&path, &bytes))
        .await
        .map_err(|_| "could not write the search index".to_string())?
        .map_err(|_| "could not write the search index".to_string())
}

/// Writes next to the target and renames, so a crash never leaves half an index.
fn write_atomic(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir)?;
    }
    let tmp = path.with_extension("tmp");
    let mut file = fs::File::create(&tmp)?;
    file.write_all(bytes)?;
    file.sync_all()?;
    drop(file);
    fs::rename(tmp, path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_plain_ids_name_a_file() {
        assert!(valid_account("0f8b5c1e-2d3a-4b5c-9d8e-7f6a5b4c3d2e"));
        assert!(!valid_account(""));
        assert!(!valid_account("../app"));
        assert!(!valid_account("a/b"));
        assert!(!valid_account("a\\b"));
        assert!(!valid_account(&"a".repeat(65)));
    }

    #[test]
    fn writes_atomically() {
        let dir = std::env::temp_dir().join(format!("tuner-search-test-{}", std::process::id()));
        let path = dir.join("search").join("x.idx");
        write_atomic(&path, b"one").unwrap();
        write_atomic(&path, b"two").unwrap();
        assert_eq!(fs::read(&path).unwrap(), b"two");
        assert!(!path.with_extension("tmp").exists());
        fs::remove_dir_all(dir).unwrap();
    }
}
