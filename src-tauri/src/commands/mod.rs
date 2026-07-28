use crate::error::AppResult;
use crate::models::{AppSettings, ReviewFilters, ReviewsPage, StatsOverview};
use crate::play_api;
use crate::stats;
use tauri::command;

#[command]
pub async fn get_stats() -> AppResult<StatsOverview> {
    let reviews = play_api::fetch_recent_reviews().await?;
    Ok(stats::build_stats(&reviews))
}

#[command]
pub async fn list_reviews(filters: ReviewFilters) -> AppResult<ReviewsPage> {
    let reviews = play_api::fetch_recent_reviews().await?;
    Ok(stats::list_reviews(&reviews, filters))
}

#[command]
pub fn get_settings() -> AppResult<AppSettings> {
    Ok(stats::default_settings())
}
