mod db;
#[cfg(debug_assertions)]
mod debug_stream;
mod images;
mod secrets;
mod streams;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_sql::Builder::new().build())
        .plugin(tauri_plugin_libmpv::init())
        .register_asynchronous_uri_scheme_protocol(images::SCHEME, images::handle);

    // generate_handler! takes no #[cfg] items, so dev builds list the debug
    // commands (they read .env.local) in their own handler.
    #[cfg(debug_assertions)]
    let builder = builder.invoke_handler(tauri::generate_handler![
        db::db_batch,
        secrets::secret_get,
        secrets::secret_set,
        secrets::secret_delete,
        streams::stream_load,
        debug_stream::debug_stream_load,
        debug_stream::debug_trace,
        debug_stream::debug_autorun,
        debug_stream::debug_m2_credentials,
        debug_stream::debug_m3_suite
    ]);
    #[cfg(not(debug_assertions))]
    let builder = builder.invoke_handler(tauri::generate_handler![
        db::db_batch,
        secrets::secret_get,
        secrets::secret_set,
        secrets::secret_delete,
        streams::stream_load
    ]);

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
