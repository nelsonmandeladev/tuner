//! What an account leaves on disk, and removing it (Settings → Accounts).
//!
//! An account owns: its library database (`account-<id>.db` and SQLite's
//! `-wal`, `-shm` and `-journal` files) in the app config folder, its search
//! index (`search/<id>.idx`) in the app cache folder, and its password in the
//! keychain (docs/DECISIONS.md D4, D5, D8). Artwork in the image cache
//! (`images/`) is keyed by URL and shared by every account, so removing an
//! account clears all of it: it is a cache and fills again as screens need it.
//!
//! The database is opened by tauri-plugin-sql. Its pool must be closed before
//! the files can be deleted on Windows, so this module takes it out of the
//! plugin's registry first. Nothing here logs.

use std::{
    fs,
    path::{Path, PathBuf},
};

use serde::Serialize;
use tauri::{AppHandle, Manager, Runtime, State};
use tauri_plugin_sql::{DbInstances, DbPool};

use crate::secrets;

/// Account ids are UUIDs: anything else could name a path outside the folders.
pub(crate) fn valid_account(id: &str) -> bool {
    !id.is_empty() && id.len() <= 64 && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
}

/// The name tauri-plugin-sql knows an account database by (`Database.load` in sql.ts).
fn db_name(account: &str) -> String {
    format!("sqlite:account-{account}.db")
}

/// SQLite's files for one database.
fn db_files(dir: &Path, account: &str) -> Vec<PathBuf> {
    let base = format!("account-{account}.db");
    ["", "-wal", "-shm", "-journal"]
        .iter()
        .map(|suffix| dir.join(format!("{base}{suffix}")))
        .collect()
}

fn images_dir<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    app.path()
        .app_cache_dir()
        .map(|d| d.join("images"))
        .map_err(|_| "no cache folder".to_string())
}

/// Closes a database's pool and forgets it, so its files are released.
async fn unload(instances: &DbInstances, name: &str) {
    let pool = instances.0.write().await.remove(name);
    if let Some(DbPool::Sqlite(pool)) = pool {
        pool.close().await;
    }
}

/// Closes an account's library (switching accounts). It opens again on the next `Database.load`.
#[tauri::command]
pub async fn account_db_unload(
    instances: State<'_, DbInstances>,
    account: String,
) -> Result<(), String> {
    if !valid_account(&account) {
        return Err("invalid account id".into());
    }
    unload(&instances, &db_name(&account)).await;
    Ok(())
}

/// What `account_remove` deleted: file names (no folders) and whether a keychain entry went.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Removed {
    files: Vec<String>,
    images: u64,
}

/// Removes everything an account left: its database files, search index,
/// password, and the shared image cache. Call after the app stopped using
/// the account (playback stopped, another account or Connect showing).
#[tauri::command]
pub async fn account_remove<R: Runtime>(
    app: AppHandle<R>,
    instances: State<'_, DbInstances>,
    account: String,
) -> Result<Removed, String> {
    if !valid_account(&account) {
        return Err("invalid account id".into());
    }
    unload(&instances, &db_name(&account)).await;

    let config = app
        .path()
        .app_config_dir()
        .map_err(|_| "no config folder".to_string())?;
    let cache = app
        .path()
        .app_cache_dir()
        .map_err(|_| "no cache folder".to_string())?;
    let images = images_dir(&app)?;

    let mut targets = db_files(&config, &account);
    let index = cache.join("search").join(format!("{account}.idx"));
    targets.push(index.with_extension("tmp"));
    targets.push(index);

    let removed = tauri::async_runtime::spawn_blocking(move || {
        let mut files = Vec::new();
        for path in targets {
            match fs::remove_file(&path) {
                Ok(()) => files.push(file_name(&path)),
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
                Err(_) => return Err(format!("could not delete {}", file_name(&path))),
            }
        }
        Ok(Removed {
            files,
            images: clear_dir(&images),
        })
    })
    .await
    .map_err(|_| "could not remove the account's files".to_string())??;

    secrets::delete_account_password(&app, &account)?;
    Ok(removed)
}

fn file_name(path: &Path) -> String {
    path.file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default()
}

/// Deletes every file in `dir` (the folder itself stays). Returns the bytes freed.
fn clear_dir(dir: &Path) -> u64 {
    let Ok(entries) = fs::read_dir(dir) else {
        return 0;
    };
    entries
        .filter_map(Result::ok)
        .filter_map(|e| {
            let len = e.metadata().ok().filter(|m| m.is_file())?.len();
            fs::remove_file(e.path()).ok().map(|()| len)
        })
        .sum()
}

fn dir_size(dir: &Path) -> u64 {
    fs::read_dir(dir)
        .map(|entries| {
            entries
                .filter_map(Result::ok)
                .filter_map(|e| e.metadata().ok().filter(|m| m.is_file()).map(|m| m.len()))
                .sum()
        })
        .unwrap_or(0)
}

/// Bytes in the image cache (Settings → Data).
#[tauri::command]
pub async fn image_cache_size<R: Runtime>(app: AppHandle<R>) -> Result<u64, String> {
    let dir = images_dir(&app)?;
    tauri::async_runtime::spawn_blocking(move || dir_size(&dir))
        .await
        .map_err(|_| "could not read the cache".to_string())
}

/// Empties the image cache. Returns the bytes freed.
#[tauri::command]
pub async fn image_cache_clear<R: Runtime>(app: AppHandle<R>) -> Result<u64, String> {
    let dir = images_dir(&app)?;
    tauri::async_runtime::spawn_blocking(move || clear_dir(&dir))
        .await
        .map_err(|_| "could not clear the cache".to_string())
}

/// Dev checks only (the M6 suite): every file in the app's config and cache
/// folders that belongs to `account` (its name holds the id), how many images
/// are cached, and whether its keychain entry exists. Never returns the password.
#[cfg(debug_assertions)]
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountTraces {
    files: Vec<String>,
    images: usize,
    secret: bool,
}

#[cfg(debug_assertions)]
#[tauri::command]
pub fn debug_account_traces<R: Runtime>(
    app: AppHandle<R>,
    account: String,
) -> Result<AccountTraces, String> {
    if !valid_account(&account) {
        return Err("invalid account id".into());
    }
    let mut files = Vec::new();
    let roots = [app.path().app_config_dir(), app.path().app_cache_dir()];
    for root in roots.into_iter().flatten() {
        let mut stack = vec![root];
        while let Some(dir) = stack.pop() {
            for entry in fs::read_dir(&dir).into_iter().flatten().flatten() {
                let path = entry.path();
                if path.is_dir() {
                    stack.push(path);
                } else if file_name(&path).contains(&account) {
                    files.push(file_name(&path));
                }
            }
        }
    }
    let images = fs::read_dir(images_dir(&app)?)
        .map(|e| e.filter_map(Result::ok).count())
        .unwrap_or(0);
    let secret = secrets::account_password(&app, &account)?.is_some();
    Ok(AccountTraces {
        files,
        images,
        secret,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_every_sqlite_file() {
        let files: Vec<String> = db_files(Path::new("x"), "a-1")
            .iter()
            .map(|p| file_name(p))
            .collect();
        assert_eq!(
            files,
            [
                "account-a-1.db",
                "account-a-1.db-wal",
                "account-a-1.db-shm",
                "account-a-1.db-journal"
            ]
        );
        assert_eq!(db_name("a-1"), "sqlite:account-a-1.db");
    }

    #[test]
    fn only_plain_ids() {
        assert!(valid_account("0f8b5c1e-2d3a-4b5c-9d8e-7f6a5b4c3d2e"));
        assert!(!valid_account("../app"));
        assert!(!valid_account(""));
    }

    #[test]
    fn clears_files_and_counts_bytes() {
        let dir = std::env::temp_dir().join(format!("tuner-accounts-test-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("a.img"), b"1234").unwrap();
        fs::write(dir.join("a.meta"), b"12").unwrap();
        assert_eq!(dir_size(&dir), 6);
        assert_eq!(clear_dir(&dir), 6);
        assert_eq!(dir_size(&dir), 0);
        assert!(dir.exists());
        fs::remove_dir_all(dir).unwrap();
    }
}
