use crate::error::AppResult;
use crate::models::{AppSettings, ReviewFilters, ReviewsPage, StatsOverview};
use crate::play_api;
use crate::settings_store;
use crate::stats;
use tauri::command;

#[command]
pub async fn get_stats(app: tauri::AppHandle) -> AppResult<StatsOverview> {
    let custom_path = settings_store::load_custom_service_account_path(&app)?;
    let reviews = play_api::fetch_recent_reviews(custom_path.as_deref()).await?;
    Ok(stats::build_stats(&reviews))
}

#[command]
pub async fn list_reviews(
    app: tauri::AppHandle,
    filters: ReviewFilters,
) -> AppResult<ReviewsPage> {
    let custom_path = settings_store::load_custom_service_account_path(&app)?;
    let reviews = play_api::fetch_recent_reviews(custom_path.as_deref()).await?;
    Ok(stats::list_reviews(&reviews, filters))
}

#[command]
pub fn get_settings(app: tauri::AppHandle) -> AppResult<AppSettings> {
    let custom_path = settings_store::load_custom_service_account_path(&app)?;
    Ok(stats::default_settings(custom_path))
}

#[command]
pub fn set_service_account_path(
    app: tauri::AppHandle,
    path: Option<String>,
) -> AppResult<AppSettings> {
    let saved_path = settings_store::save_custom_service_account_path(&app, path)?;
    Ok(stats::default_settings(saved_path))
}
