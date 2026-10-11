mod db;
#[cfg(debug_assertions)]
mod debug_stream;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_sql::Builder::new().build())
        .plugin(tauri_plugin_libmpv::init());

    // generate_handler! takes no #[cfg] items, so dev builds list the debug
    // commands (they read .env.local) in their own handler.
    #[cfg(debug_assertions)]
    let builder = builder.invoke_handler(tauri::generate_handler![
        db::db_batch,
        debug_stream::debug_stream_load,
        debug_stream::debug_trace,
        debug_stream::debug_autorun
    ]);
    #[cfg(not(debug_assertions))]
    let builder = builder.invoke_handler(tauri::generate_handler![
        db::db_batch
    ]);

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
