use crate::error::{AppError, AppResult};
use crate::models::{Review, PACKAGE_NAME, PLAY_SCOPE, RECENT_WINDOW_DAYS};
use chrono::{Duration, Utc};
use jsonwebtoken::{encode, Algorithm, EncodingKey, Header};
use serde::Deserialize;
use std::fs;
use std::path::Path;

const TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
const REVIEWS_URL: &str = "https://androidpublisher.googleapis.com/androidpublisher/v3/applications";

#[derive(Deserialize)]
struct ServiceAccount {
    client_email: String,
    private_key: String,
}

#[derive(serde::Serialize)]
struct Claims {
    iss: String,
    scope: String,
    aud: String,
    exp: i64,
    iat: i64,
}

#[derive(Deserialize)]
struct TokenResponse {
    access_token: String,
}

#[derive(Deserialize)]
struct ReviewsListResponse {
    reviews: Option<Vec<ApiReview>>,
    #[serde(rename = "tokenPagination")]
    token_pagination: Option<TokenPagination>,
}

#[derive(Deserialize)]
struct TokenPagination {
    next_page_token: Option<String>,
}

#[derive(Deserialize)]
struct ApiReview {
    #[serde(rename = "reviewId")]
    review_id: String,
    #[serde(rename = "authorName")]
    author_name: Option<String>,
    comments: Option<Vec<ApiComment>>,
}

#[derive(Deserialize)]
struct ApiComment {
    #[serde(rename = "userComment")]
    user_comment: Option<UserComment>,
    #[serde(rename = "developerComment")]
    developer_comment: Option<DeveloperComment>,
}

#[derive(Deserialize)]
struct UserComment {
    text: Option<String>,
    #[serde(rename = "originalText")]
    original_text: Option<String>,
    #[serde(rename = "lastModified")]
    last_modified: Option<ApiTimestamp>,
    #[serde(rename = "starRating")]
    star_rating: Option<i32>,
    #[serde(rename = "reviewerLanguage")]
    reviewer_language: Option<String>,
    device: Option<String>,
    #[serde(rename = "androidOsVersion")]
    android_os_version: Option<i32>,
    #[serde(rename = "appVersionCode")]
    app_version_code: Option<i32>,
    #[serde(rename = "appVersionName")]
    app_version_name: Option<String>,
    #[serde(rename = "thumbsUpCount")]
    thumbs_up_count: Option<i32>,
    #[serde(rename = "thumbsDownCount")]
    thumbs_down_count: Option<i32>,
    #[serde(rename = "deviceMetadata")]
    device_metadata: Option<DeviceMetadata>,
}

#[derive(Deserialize)]
struct DeveloperComment {
    text: Option<String>,
}

#[derive(Deserialize)]
struct ApiTimestamp {
    seconds: Option<String>,
}

#[derive(Deserialize)]
struct DeviceMetadata {
    manufacturer: Option<String>,
    #[serde(rename = "deviceClass")]
    device_class: Option<String>,
}

pub async fn fetch_recent_reviews(custom_service_account_path: Option<&str>) -> AppResult<Vec<Review>> {
    let credentials = load_service_account(custom_service_account_path)?;
    let access_token = get_access_token(&credentials).await?;
    let window_start = (Utc::now() - Duration::days(RECENT_WINDOW_DAYS)).timestamp();

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()?;
    let mut all_reviews = Vec::new();
    let mut page_token: Option<String> = None;

    loop {
        let mut url = format!("{REVIEWS_URL}/{PACKAGE_NAME}/reviews?maxResults=100");
        if let Some(token) = &page_token {
            url.push_str(&format!("&token={token}"));
        }

        let response = client
            .get(&url)
            .bearer_auth(&access_token)
            .header("x-request-id", uuid::Uuid::new_v4().to_string())
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(AppError::Message(format!(
                "Play API error {status}: {body}"
            )));
        }

        let payload: ReviewsListResponse = response.json().await?;
        let mut any_recent_on_page = false;

        if let Some(reviews) = payload.reviews {
            for api_review in reviews {
                if let Some(review) = map_api_review(api_review) {
                    if review.last_modified_at >= window_start {
                        all_reviews.push(review);
                        any_recent_on_page = true;
                    }
                }
            }
        }

        page_token = payload
            .token_pagination
            .and_then(|pagination| pagination.next_page_token);

        // Play API trả về review mới nhất trước — dừng khi cả trang đều cũ hơn cửa sổ recent.
        if !any_recent_on_page || page_token.is_none() {
            break;
        }
    }

    Ok(all_reviews)
}

fn load_service_account(custom_service_account_path: Option<&str>) -> AppResult<ServiceAccount> {
    if let Ok(raw) = std::env::var("GOOGLE_SERVICE_ACCOUNT_JSON") {
        return serde_json::from_str(&raw).map_err(|err| {
            AppError::Message(format!("Service Account JSON (env) không hợp lệ: {err}"))
        });
    }

    if let Some(custom_path) = custom_service_account_path {
        let path = Path::new(custom_path);
        let raw = fs::read_to_string(path).map_err(|err| {
            AppError::Message(format!(
                "Không đọc được custom Service Account file `{}`: {err}",
                path.display()
            ))
        })?;
        return serde_json::from_str(&raw).map_err(|err| {
            AppError::Message(format!(
                "Custom Service Account JSON `{}` không hợp lệ: {err}",
                path.display()
            ))
        });
    }

    const RAW: &str = include_str!("../../credentials/service_account.json");
    serde_json::from_str(RAW).map_err(|err| {
        AppError::Message(format!("Service Account JSON không hợp lệ: {err}"))
    })
}

async fn get_access_token(credentials: &ServiceAccount) -> AppResult<String> {
    let now = Utc::now();
    let claims = Claims {
        iss: credentials.client_email.clone(),
        scope: PLAY_SCOPE.to_string(),
        aud: TOKEN_URL.to_string(),
        iat: now.timestamp(),
        exp: (now + Duration::minutes(55)).timestamp(),
    };

    let header = Header::new(Algorithm::RS256);
    let key = EncodingKey::from_rsa_pem(credentials.private_key.as_bytes())?;
    let assertion = encode(&header, &claims, &key)?;

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()?;
    let response = client
        .post(TOKEN_URL)
        .form(&[
            ("grant_type", "urn:ietf:params:oauth:grant-type:jwt-bearer"),
            ("assertion", assertion.as_str()),
        ])
        .send()
        .await?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(AppError::Message(format!(
            "OAuth token error {status}: {body}"
        )));
    }

    let token: TokenResponse = response.json().await?;
    Ok(token.access_token)
}

fn map_api_review(review: ApiReview) -> Option<Review> {
    let user_comment = review
        .comments
        .as_ref()?
        .iter()
        .find_map(|comment| comment.user_comment.as_ref())?;

    let developer_reply = review.comments.as_ref().and_then(|comments| {
        comments
            .iter()
            .find_map(|comment| comment.developer_comment.as_ref())
            .and_then(|dev| dev.text.clone())
    });

    let star_rating = user_comment.star_rating?;
    let last_modified_at = user_comment
        .last_modified
        .as_ref()
        .and_then(|ts| ts.seconds.as_ref())
        .and_then(|seconds| seconds.parse::<i64>().ok())
        .unwrap_or_else(|| Utc::now().timestamp());

    let synced_at = Utc::now().timestamp();

    Some(Review {
        review_id: review.review_id,
        author_name: review.author_name,
        star_rating,
        text: user_comment.text.clone(),
        original_text: user_comment.original_text.clone(),
        reviewer_language: user_comment.reviewer_language.clone(),
        device: user_comment.device.clone(),
        app_version_code: user_comment.app_version_code,
        app_version_name: user_comment.app_version_name.clone(),
        android_os_version: user_comment.android_os_version,
        manufacturer: user_comment
            .device_metadata
            .as_ref()
            .and_then(|meta| meta.manufacturer.clone()),
        device_class: user_comment
            .device_metadata
            .as_ref()
            .and_then(|meta| meta.device_class.clone()),
        thumbs_up: user_comment.thumbs_up_count.unwrap_or(0),
        thumbs_down: user_comment.thumbs_down_count.unwrap_or(0),
        has_developer_reply: developer_reply.is_some(),
        developer_reply,
        submitted_at: None,
        last_modified_at,
        source: "api".into(),
        synced_at,
    })
}
