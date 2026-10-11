#[cfg(debug_assertions)]
mod debug_stream;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_sql::Builder::new().build())
        .plugin(tauri_plugin_libmpv::init());

    // The debug stream loader reads .env.local and exists in dev builds only.
    #[cfg(debug_assertions)]
    let builder = builder.invoke_handler(tauri::generate_handler![
        debug_stream::debug_stream_load,
        debug_stream::debug_trace,
        debug_stream::debug_autorun
    ]);

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
