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
#[serde(rename_all = "camelCase")]
pub struct DeepSeekSettings {
    pub api_key: Option<String>,
    pub prompt: String,
    #[serde(default)]
    pub last_report_day: Option<String>,
    #[serde(default)]
    pub last_report_text: Option<String>,
}

impl Default for DeepSeekSettings {
    fn default() -> Self {
        Self {
            api_key: None,
            prompt: DEFAULT_DEEPSEEK_PROMPT.to_string(),
            last_report_day: None,
            last_report_text: None,
        }
    }
}

pub const DEFAULT_DEEPSEEK_PROMPT: &str = "Bạn là chuyên viên phân tích phản hồi khách hàng của ứng dụng MyTV.

Nhiệm vụ:
Phân tích báo cáo review dưới đây và viết nội dung tóm tắt để gửi email nội bộ.

Yêu cầu:
- Viết bằng tiếng Việt.
- Văn phong chuyên nghiệp, ngắn gọn, dễ đọc.
- Tiêu đề email (Subject): Báo cáo đánh giá MyTV (chỉ để tham khảo khi gửi email, không đưa vào nội dung)
- Trong nội dung email, chỉ ghi ngày của báo cáo (lấy từ dữ liệu đầu vào) ở câu mở đầu, không tạo dòng tiêu đề riêng.
- Chia thành đúng 2 phần:
  1. Đánh giá tích cực
  2. Đánh giá tiêu cực
- Mỗi phần phải bắt đầu bằng số lượng đánh giá thuộc nhóm đó.
- Tổng hợp các ý giống nhau thành một nhận định, không liệt kê từng review.
- Có thể sử dụng các số liệu như tổng số review, điểm trung bình và tỷ lệ phản hồi để làm rõ nhận định.
- Nếu không có đánh giá tích cực hoặc tiêu cực thì ghi rõ \"Không ghi nhận ...\".
- Không thêm thông tin ngoài dữ liệu.

Định dạng đầu ra:

Kính gửi Anh/Chị,

Dưới đây là tóm tắt đánh giá của khách hàng trên Google Play trong kỳ báo cáo ngày [Ngày của báo cáo].

Đánh giá tích cực (X đánh giá)
- ...

Đánh giá tiêu cực (Y đánh giá)
- ...

Trân trọng.

Dữ liệu báo cáo:

{{REPORT}}";

/// Prompt mặc định cũ (v1) — migrate máy đã lưu local.
pub const LEGACY_DEFAULT_DEEPSEEK_PROMPT_V1: &str = "Bạn là trợ lý phân tích reviews Google Play cho app MyTV. \
Viết lại báo cáo ngắn gọn, rõ ràng bằng tiếng Việt dựa trên dữ liệu được cung cấp. \
Giữ số liệu chính xác, nêu điểm nổi bật (sao thấp, phản hồi, phiên bản), \
và kết luận ngắn cho team. Không bịa thêm số liệu.";

/// Prompt mặc định cũ (v2 — có dòng Tiêu đề kèm ngày).
pub const LEGACY_DEFAULT_DEEPSEEK_PROMPT_V2: &str = "Bạn là chuyên viên phân tích phản hồi khách hàng của ứng dụng MyTV.

Nhiệm vụ:
Phân tích báo cáo review dưới đây và viết nội dung tóm tắt để gửi email nội bộ.

Yêu cầu:
- Viết bằng tiếng Việt.
- Văn phong chuyên nghiệp, ngắn gọn, dễ đọc.
- Bắt đầu email bằng dòng tiêu đề nêu rõ ngày của báo cáo (lấy từ dữ liệu đầu vào).
- Chia thành đúng 2 phần:
  1. Đánh giá tích cực
  2. Đánh giá tiêu cực
- Mỗi phần phải bắt đầu bằng số lượng đánh giá thuộc nhóm đó.
- Tổng hợp các ý giống nhau thành một nhận định, không liệt kê từng review.
- Có thể sử dụng các số liệu như tổng số review, điểm trung bình và tỷ lệ phản hồi để làm rõ nhận định.
- Nếu không có đánh giá tích cực hoặc tiêu cực thì ghi rõ \"Không ghi nhận ...\".
- Không thêm thông tin ngoài dữ liệu.

Định dạng đầu ra:

Tiêu đề: Báo cáo đánh giá MyTV – [Ngày của báo cáo]

Kính gửi Anh/Chị,

Dưới đây là tóm tắt đánh giá của khách hàng trên Google Play trong kỳ báo cáo.

Đánh giá tích cực (X đánh giá)
- ...

Đánh giá tiêu cực (Y đánh giá)
- ...

Trân trọng.

Dữ liệu báo cáo:

{{REPORT}}";

/// Prompt mặc định cũ (v3 — có dòng Subject trong output).
pub const LEGACY_DEFAULT_DEEPSEEK_PROMPT_V3: &str = "Bạn là chuyên viên phân tích phản hồi khách hàng của ứng dụng MyTV.

Nhiệm vụ:
Phân tích báo cáo review dưới đây và viết nội dung tóm tắt để gửi email nội bộ.

Yêu cầu:
- Viết bằng tiếng Việt.
- Văn phong chuyên nghiệp, ngắn gọn, dễ đọc.
- Tiêu đề email (Subject): Báo cáo đánh giá MyTV
- Trong nội dung email, chỉ ghi ngày của báo cáo (lấy từ dữ liệu đầu vào) ở câu mở đầu, không tạo dòng tiêu đề riêng.
- Chia thành đúng 2 phần:
  1. Đánh giá tích cực
  2. Đánh giá tiêu cực
- Mỗi phần phải bắt đầu bằng số lượng đánh giá thuộc nhóm đó.
- Tổng hợp các ý giống nhau thành một nhận định, không liệt kê từng review.
- Có thể sử dụng các số liệu như tổng số review, điểm trung bình và tỷ lệ phản hồi để làm rõ nhận định.
- Nếu không có đánh giá tích cực hoặc tiêu cực thì ghi rõ \"Không ghi nhận ...\".
- Không thêm thông tin ngoài dữ liệu.

Định dạng đầu ra:

Subject: Báo cáo đánh giá MyTV

Kính gửi Anh/Chị,

Dưới đây là tóm tắt đánh giá của khách hàng trên Google Play trong kỳ báo cáo ngày [Ngày của báo cáo].

Đánh giá tích cực (X đánh giá)
- ...

Đánh giá tiêu cực (Y đánh giá)
- ...

Trân trọng.

Dữ liệu báo cáo:

{{REPORT}}";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeepSeekGenerateResult {
    pub day: String,
    pub text: String,
    pub settings: DeepSeekSettings,
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
