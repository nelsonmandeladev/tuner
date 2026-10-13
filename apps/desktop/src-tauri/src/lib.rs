mod accounts;
mod db;
#[cfg(debug_assertions)]
mod debug_stream;
mod images;
mod search_store;
mod secrets;
mod streams;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(debug_assertions)]
    debug_stream::mark_process_start();
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_sql::Builder::new().build())
        .plugin(tauri_plugin_libmpv::init())
        .register_asynchronous_uri_scheme_protocol(images::SCHEME, images::handle);

    // generate_handler! takes no #[cfg] items, so dev builds list the debug
    // commands (they read .env.local) in their own handler.
    #[cfg(debug_assertions)]
    let builder = builder.invoke_handler(tauri::generate_handler![
        db::db_batch,
        accounts::account_db_unload,
        accounts::account_remove,
        accounts::image_cache_size,
        accounts::image_cache_clear,
        secrets::secret_get,
        secrets::secret_set,
        secrets::secret_delete,
        streams::stream_load,
        search_store::search_index_read,
        search_store::search_index_write,
        debug_stream::debug_stream_load,
        debug_stream::debug_trace,
        debug_stream::debug_autorun,
        debug_stream::debug_m2_credentials,
        debug_stream::debug_m3_suite,
        debug_stream::debug_m4_suite,
        debug_stream::debug_m5_suite,
        debug_stream::debug_m6_suite,
        debug_stream::debug_m6_credentials,
        accounts::debug_account_traces,
        debug_stream::debug_process_ms
    ]);
    #[cfg(not(debug_assertions))]
    let builder = builder.invoke_handler(tauri::generate_handler![
        db::db_batch,
        accounts::account_db_unload,
        accounts::account_remove,
        accounts::image_cache_size,
        accounts::image_cache_clear,
        secrets::secret_get,
        secrets::secret_set,
        secrets::secret_delete,
        streams::stream_load,
        search_store::search_index_read,
        search_store::search_index_write
    ]);

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
