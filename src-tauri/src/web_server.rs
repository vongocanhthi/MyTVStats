use crate::error::AppError;
use crate::models::ReviewFilters;
use crate::play_api;
use crate::stats;
use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::routing::get;
use axum::{Json, Router};
use serde::Serialize;
use std::sync::Arc;

#[derive(Clone, Default)]
struct AppState;

#[derive(Serialize)]
struct ErrorResponse {
    error: String,
}

fn app_error_to_response(err: AppError) -> (StatusCode, Json<ErrorResponse>) {
    let status = match err {
        AppError::Message(_) => StatusCode::BAD_REQUEST,
        _ => StatusCode::INTERNAL_SERVER_ERROR,
    };
    (
        status,
        Json(ErrorResponse {
            error: err.to_string(),
        }),
    )
}

pub async fn run(port: u16) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let app = Router::new()
        .route("/api/stats", get(get_stats))
        .route("/api/reviews", get(get_reviews))
        .route("/api/settings", get(get_settings_handler))
        .with_state(Arc::new(AppState));

    let addr: std::net::SocketAddr = ([127, 0, 0, 1], port).into();
    println!("Web server listening on http://{addr} (live Play API, no DB)");
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
}

async fn get_stats(State(_state): State<Arc<AppState>>) -> impl IntoResponse {
    match play_api::fetch_recent_reviews(None).await {
        Ok(reviews) => Json(stats::build_stats(&reviews)).into_response(),
        Err(err) => app_error_to_response(err).into_response(),
    }
}

async fn get_reviews(
    State(_state): State<Arc<AppState>>,
    Query(filters): Query<ReviewFilters>,
) -> impl IntoResponse {
    match play_api::fetch_recent_reviews(None).await {
        Ok(reviews) => Json(stats::list_reviews(&reviews, filters)).into_response(),
        Err(err) => app_error_to_response(err).into_response(),
    }
}

async fn get_settings_handler() -> impl IntoResponse {
    Json(stats::default_settings(None)).into_response()
}
