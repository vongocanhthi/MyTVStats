mod commands;
mod error;
mod models;
mod play_api;
mod settings_store;
mod stats;
mod web_server;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            commands::get_stats,
            commands::list_reviews,
            commands::get_settings,
            commands::set_service_account_path,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// Start HTTP server for browser/web usage (live Play API, no database).
pub async fn run_web_server(port: u16) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    web_server::run(port).await
}
