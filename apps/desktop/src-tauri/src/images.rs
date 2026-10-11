//! Image cache on a custom protocol (docs/DECISIONS.md D7).
//!
//! Provider artwork is mostly plain `http://`, which the webview (an https
//! origin on Windows) would block as mixed content. Components load
//! `img` protocol URLs instead (built with `convertFileSrc(url, "img")`):
//! this fetches the image in Rust, keeps it on disk and serves it. The cache
//! is LRU by file modification time, capped at 500 MB, and failed URLs are
//! not retried for an hour so a dead logo host costs one request.
//!
//! Only http(s) URLs with an `image/*` answer under 10 MB are accepted.
//! Artwork URLs carry no credentials; nothing here is logged.

use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
    sync::{
        OnceLock,
        atomic::{AtomicU32, Ordering},
    },
    time::{Duration, SystemTime},
};

use tauri::{
    Manager, Runtime, UriSchemeContext, UriSchemeResponder,
    http::{Request, Response, StatusCode, header},
};
use tauri_plugin_http::reqwest;

pub const SCHEME: &str = "img";

const MAX_CACHE_BYTES: u64 = 500 * 1024 * 1024;
/// Evict down to this, so eviction doesn't run on every write once full.
const EVICT_TO_BYTES: u64 = MAX_CACHE_BYTES * 9 / 10;
const MAX_IMAGE_BYTES: usize = 10 * 1024 * 1024;
const MISS_TTL: Duration = Duration::from_secs(60 * 60);
const USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

/// Check the cache size every this many writes (a directory scan is not free).
const EVICT_EVERY_WRITES: u32 = 50;
static WRITES: AtomicU32 = AtomicU32::new(0);

fn client() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .user_agent(USER_AGENT)
            .connect_timeout(Duration::from_secs(8))
            .timeout(Duration::from_secs(10))
            // Logos often share one host: scrolling a long list would otherwise
            // leave dozens of idle keep-alive sockets open to it (seen in M3).
            .pool_max_idle_per_host(4)
            .pool_idle_timeout(Duration::from_secs(15))
            .build()
            .expect("image HTTP client")
    })
}

/// Handles one `img` request. Registered with
/// `register_asynchronous_uri_scheme_protocol`, so it never blocks the UI.
pub fn handle<R: Runtime>(
    ctx: UriSchemeContext<'_, R>,
    request: Request<Vec<u8>>,
    responder: UriSchemeResponder,
) {
    let dir = ctx
        .app_handle()
        .path()
        .app_cache_dir()
        .map(|d| d.join("images"));
    let url = percent_decode(request.uri().path().trim_start_matches('/'));
    tauri::async_runtime::spawn(async move {
        let response = match (dir, url) {
            (Ok(dir), Some(url)) => serve(&dir, &url).await,
            _ => status(StatusCode::BAD_REQUEST),
        };
        responder.respond(response);
    });
}

async fn serve(dir: &Path, url: &str) -> Response<Vec<u8>> {
    if !(url.starts_with("http://") || url.starts_with("https://")) {
        return status(StatusCode::BAD_REQUEST);
    }
    let key = format!("{:016x}", fnv1a(url.as_bytes()));
    let body_path = dir.join(format!("{key}.img"));
    let meta_path = dir.join(format!("{key}.meta"));
    let miss_path = dir.join(format!("{key}.miss"));

    // Cached: the meta file holds "content-type\nurl" (the url guards against hash collisions).
    if let (Ok(meta), Ok(body)) = (fs::read_to_string(&meta_path), fs::read(&body_path)) {
        if let Some((content_type, cached_url)) = meta.split_once('\n') {
            if cached_url == url {
                touch(&body_path);
                return image(content_type, body);
            }
        }
    }
    if is_recent(&miss_path) {
        return status(StatusCode::NOT_FOUND);
    }

    match fetch(url).await {
        Some((content_type, body)) => {
            if fs::create_dir_all(dir).is_ok() {
                let _ = write_atomic(&body_path, &body).and_then(|()| {
                    write_atomic(&meta_path, format!("{content_type}\n{url}").as_bytes())
                });
                if WRITES.fetch_add(1, Ordering::Relaxed) % EVICT_EVERY_WRITES == 0 {
                    let dir = dir.to_path_buf();
                    tauri::async_runtime::spawn_blocking(move || evict(&dir));
                }
            }
            image(&content_type, body)
        }
        None => {
            if fs::create_dir_all(dir).is_ok() {
                let _ = fs::write(&miss_path, b"");
            }
            status(StatusCode::NOT_FOUND)
        }
    }
}

async fn fetch(url: &str) -> Option<(String, Vec<u8>)> {
    let response = client()
        .get(url)
        .send()
        .await
        .ok()?
        .error_for_status()
        .ok()?;
    let content_type = response
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_owned();
    if !content_type.starts_with("image/") {
        return None;
    }
    if response
        .content_length()
        .is_some_and(|len| len as usize > MAX_IMAGE_BYTES)
    {
        return None;
    }
    let body = response.bytes().await.ok()?;
    (body.len() <= MAX_IMAGE_BYTES).then(|| (content_type, body.to_vec()))
}

fn image(content_type: &str, body: Vec<u8>) -> Response<Vec<u8>> {
    Response::builder()
        .header(header::CONTENT_TYPE, content_type)
        // The disk cache is the source of truth; let the webview keep it in memory too.
        .header(header::CACHE_CONTROL, "max-age=86400")
        .body(body)
        .unwrap_or_else(|_| status(StatusCode::INTERNAL_SERVER_ERROR))
}

fn status(code: StatusCode) -> Response<Vec<u8>> {
    let mut response = Response::new(Vec::new());
    *response.status_mut() = code;
    response
}

fn write_atomic(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    let tmp = path.with_extension("tmp");
    let mut file = fs::File::create(&tmp)?;
    file.write_all(bytes)?;
    drop(file);
    fs::rename(tmp, path)
}

/// Marks a cache entry as recently used (LRU order is modification time).
fn touch(path: &Path) {
    if let Ok(file) = fs::File::options().write(true).open(path) {
        let _ = file.set_modified(SystemTime::now());
    }
}

fn is_recent(path: &Path) -> bool {
    fs::metadata(path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.elapsed().ok())
        .is_some_and(|age| age < MISS_TTL)
}

/// Deletes least recently used images until the cache is under the limit.
fn evict(dir: &Path) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    let mut images: Vec<(SystemTime, u64, PathBuf)> = entries
        .filter_map(Result::ok)
        .filter(|e| e.path().extension().is_some_and(|x| x == "img"))
        .filter_map(|e| {
            let meta = e.metadata().ok()?;
            Some((meta.modified().ok()?, meta.len(), e.path()))
        })
        .collect();
    let mut total: u64 = images.iter().map(|(_, len, _)| len).sum();
    if total <= MAX_CACHE_BYTES {
        return;
    }
    images.sort_by_key(|(modified, _, _)| *modified);
    for (_, len, path) in images {
        if total <= EVICT_TO_BYTES {
            break;
        }
        if fs::remove_file(&path).is_ok() {
            let _ = fs::remove_file(path.with_extension("meta"));
            total = total.saturating_sub(len);
        }
    }
}

/// FNV-1a, 64-bit: a stable file name for a URL (collisions are caught by the meta file).
fn fnv1a(bytes: &[u8]) -> u64 {
    bytes.iter().fold(0xcbf2_9ce4_8422_2325, |hash, b| {
        (hash ^ u64::from(*b)).wrapping_mul(0x0100_0000_01b3)
    })
}

/// Decodes `%XX` escapes (the URL arrives percent-encoded as one path segment).
fn percent_decode(input: &str) -> Option<String> {
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' {
            let hex = std::str::from_utf8(bytes.get(i + 1..i + 3)?).ok()?;
            out.push(u8::from_str_radix(hex, 16).ok()?);
            i += 3;
        } else {
            out.push(bytes[i]);
            i += 1;
        }
    }
    String::from_utf8(out).ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decodes_an_encoded_url() {
        assert_eq!(
            percent_decode("http%3A%2F%2Fimg.example%2Fa%20b.png").as_deref(),
            Some("http://img.example/a b.png")
        );
        assert_eq!(percent_decode("%zz"), None);
    }

    #[test]
    fn hashes_are_stable() {
        assert_eq!(fnv1a(b""), 0xcbf2_9ce4_8422_2325);
        assert_ne!(fnv1a(b"http://a/1.png"), fnv1a(b"http://a/2.png"));
    }
}
