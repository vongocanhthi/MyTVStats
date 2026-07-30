use serde::{Deserialize, Serialize};

pub const PACKAGE_NAME: &str = "vn.mytvnet.mobileb2c";
pub const PLAY_SCOPE: &str = "https://www.googleapis.com/auth/androidpublisher";
/// Cửa sổ sync / thống kê recent — khớp giới hạn Google Play API (~7 ngày).
pub const RECENT_WINDOW_DAYS: i64 = 7;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Review {
    pub review_id: String,
    pub author_name: Option<String>,
    pub star_rating: i32,
    pub text: Option<String>,
    pub original_text: Option<String>,
    pub reviewer_language: Option<String>,
    pub device: Option<String>,
    pub app_version_code: Option<i32>,
    pub app_version_name: Option<String>,
    pub android_os_version: Option<i32>,
    pub manufacturer: Option<String>,
    pub device_class: Option<String>,
    pub thumbs_up: i32,
    pub thumbs_down: i32,
    pub has_developer_reply: bool,
    pub developer_reply: Option<String>,
    pub submitted_at: Option<i64>,
    pub last_modified_at: i64,
    pub source: String,
    pub synced_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PeriodStats {
    pub review_count: i64,
    pub average_rating: f64,
    pub reply_rate: f64,
    pub rating_distribution: Vec<RatingBucket>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyPeriodStats {
    pub day: String,
    pub review_count: i64,
    pub average_rating: f64,
    pub reply_rate: f64,
    pub rating_distribution: Vec<RatingBucket>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StatsOverview {
    /// Always `recent_only` — app chỉ dùng Play API 7 ngày.
    pub data_scope: String,
    pub csv_review_count: i64,
    pub api_review_count: i64,
    pub total_reviews: i64,
    pub average_rating: f64,
    pub rating_distribution: Vec<RatingBucket>,
    pub reviews_last_7_days: i64,
    pub reply_rate: f64,
    /// Thống kê trong ngày hôm nay (theo UTC calendar day).
    pub today: PeriodStats,
    /// Thống kê 7 ngày gần nhất.
    pub last_7_days: PeriodStats,
    pub daily_trend: Vec<DailyTrendPoint>,
    /// PeriodStats đầy đủ theo từng ngày (giờ VN) trong cửa sổ 7 ngày.
    pub daily_breakdown: Vec<DailyPeriodStats>,
    pub monthly_trend: Vec<MonthlyTrendPoint>,
    pub top_versions: Vec<VersionStats>,
    pub last_sync_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyTrendPoint {
    pub day: String,
    pub count: i64,
    pub average_rating: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RatingBucket {
    pub stars: i32,
    pub count: i64,
    pub percentage: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MonthlyTrendPoint {
    pub month: String,
    pub count: i64,
    pub average_rating: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VersionStats {
    pub version_name: String,
    pub count: i64,
    pub average_rating: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewsPage {
    pub items: Vec<Review>,
    pub total: i64,
    pub page: u32,
    pub page_size: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub service_account_path: Option<String>,
    pub package_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub enum ReportDayTarget {
    #[default]
    Yesterday,
    Today,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScheduleSettings {
    pub enabled: bool,
    pub hour: u8,
    pub minute: u8,
    pub recipient: String,
    #[serde(default)]
    pub cc: Option<String>,
    #[serde(default)]
    pub bcc: Option<String>,
    pub smtp_email: Option<String>,
    pub smtp_app_password: Option<String>,
    pub autostart_enabled: bool,
    pub start_minimized: bool,
    #[serde(default)]
    pub report_day_target: ReportDayTarget,
    pub last_run_day: Option<String>,
    pub last_run_at: Option<i64>,
    pub last_run_status: Option<ScheduleRunStatus>,
    pub last_run_error: Option<String>,
    /// Các key đã được override từ `.env` / `.env.local` (không lưu disk).
    #[serde(default)]
    pub env_overrides: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ScheduleRunStatus {
    Success,
    Failed,
    Skipped,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReviewFilters {
    pub page: Option<u32>,
    #[serde(alias = "pageSize")]
    pub page_size: Option<u32>,
    pub search: Option<String>,
    #[serde(alias = "minRating")]
    pub min_rating: Option<i32>,
    #[serde(alias = "maxRating")]
    pub max_rating: Option<i32>,
    #[serde(alias = "versionName")]
    pub version_name: Option<String>,
    #[serde(alias = "sortBy")]
    pub sort_by: Option<String>,
    #[serde(alias = "sortOrder")]
    pub sort_order: Option<String>,
}
