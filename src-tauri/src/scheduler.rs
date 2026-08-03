use crate::deepseek;
use crate::email;
use crate::env_config;
use crate::error::{AppError, AppResult};
use crate::models::{ReportDayTarget, ScheduleRunStatus, ScheduleSettings};
use crate::play_api;
use crate::report::{
    build_daily_report_text, build_report_subject, build_zero_review_report_body,
    extract_deepseek_subject, filter_reviews_by_day, strip_deepseek_subject_line, today_day_key_vn,
    yesterday_day_key_vn,
};
use crate::settings_store;
use crate::stats;
use chrono::Utc;
use chrono_tz::Asia::Ho_Chi_Minh;
use tauri::{AppHandle, Manager};
use tokio::sync::Mutex;
use tokio_cron_scheduler::{Job, JobScheduler};
use uuid::Uuid;

/// Giữ JobScheduler + job hiện tại để đổi giờ lịch thì gỡ cron cũ rồi gắn cron mới.
pub struct ScheduleRunner {
    scheduler: JobScheduler,
    current_job: Mutex<Option<Uuid>>,
}

pub async fn start_scheduler(app: AppHandle) -> AppResult<ScheduleRunner> {
    let scheduler = JobScheduler::new()
        .await
        .map_err(|err| AppError::Message(format!("Không khởi tạo được scheduler: {err}")))?;

    scheduler
        .start()
        .await
        .map_err(|err| AppError::Message(format!("Không start được scheduler: {err}")))?;

    let runner = ScheduleRunner {
        scheduler,
        current_job: Mutex::new(None),
    };
    runner.reschedule(&app).await?;
    Ok(runner)
}

impl ScheduleRunner {
    /// Xoá cron cũ (nếu có) rồi đăng ký lại theo settings hiện tại.
    pub async fn reschedule(&self, app: &AppHandle) -> AppResult<()> {
        {
            let mut guard = self.current_job.lock().await;
            if let Some(job_id) = guard.take() {
                if let Err(err) = self.scheduler.remove(&job_id).await {
                    eprintln!("remove old cron job failed ({job_id}): {err}");
                } else {
                    eprintln!("removed old daily report cron job ({job_id})");
                }
            }
        }

        let settings = settings_store::load_schedule_settings(app)?;
        if !settings.enabled {
            eprintln!(
                "daily report scheduler idle (lịch đang tắt) — Asia/Ho_Chi_Minh ({})",
                env_config::env_file_hint()
            );
            return Ok(());
        }

        let cron = format!("0 {} {} * * *", settings.minute, settings.hour);
        let app_handle = app.clone();
        let job = Job::new_async_tz(cron.as_str(), Ho_Chi_Minh, move |_uuid, _lock| {
            let app = app_handle.clone();
            Box::pin(async move {
                if let Err(err) = run_daily_report_job(&app, false).await {
                    eprintln!("daily report job failed: {err}");
                }
            })
        })
        .map_err(|err| AppError::Message(format!("Không tạo được cron job `{cron}`: {err}")))?;

        let job_id = self
            .scheduler
            .add(job)
            .await
            .map_err(|err| AppError::Message(format!("Không thêm được cron job: {err}")))?;

        *self.current_job.lock().await = Some(job_id);

        eprintln!(
            "daily report scheduler set to {:02}:{:02} Asia/Ho_Chi_Minh (job {job_id}, {})",
            settings.hour,
            settings.minute,
            env_config::env_file_hint()
        );

        Ok(())
    }
}

/// Gọi sau khi lưu settings lịch — xoá job cũ, gắn giờ mới.
pub async fn reschedule_from_settings(app: &AppHandle) -> AppResult<()> {
    let runner = app
        .try_state::<ScheduleRunner>()
        .ok_or_else(|| AppError::Message("Scheduler chưa sẵn sàng.".into()))?;
    runner.reschedule(app).await
}

pub async fn run_daily_report_job(app: &AppHandle, force: bool) -> AppResult<ScheduleSettings> {
    let mut settings = settings_store::load_schedule_settings(app)?;
    let today = today_day_key_vn();

    if !settings.enabled && !force {
        settings.last_run_day = Some(today);
        settings.last_run_at = Some(Utc::now().timestamp());
        settings.last_run_status = Some(ScheduleRunStatus::Skipped);
        settings.last_run_error = Some("Lịch tự động đang tắt.".to_string());
        let saved = settings_store::save_schedule_settings(app, settings)?;
        crate::refresh_tray_status(app);
        return Ok(saved);
    }

    if !force && settings.last_run_day.as_deref() == Some(today.as_str()) {
        settings.last_run_at = Some(Utc::now().timestamp());
        settings.last_run_status = Some(ScheduleRunStatus::Skipped);
        settings.last_run_error = Some("Đã gửi báo cáo hôm nay rồi.".to_string());
        let saved = settings_store::save_schedule_settings(app, settings)?;
        crate::refresh_tray_status(app);
        return Ok(saved);
    }

    let send_result = send_report(app, &settings).await;
    match send_result {
        Ok(()) => {
            settings.last_run_day = Some(today);
            settings.last_run_at = Some(Utc::now().timestamp());
            settings.last_run_status = Some(ScheduleRunStatus::Success);
            settings.last_run_error = None;
        }
        Err(err) => {
            settings.last_run_day = Some(today);
            settings.last_run_at = Some(Utc::now().timestamp());
            settings.last_run_status = Some(ScheduleRunStatus::Failed);
            settings.last_run_error = Some(err.to_string());
        }
    }

    let saved = settings_store::save_schedule_settings(app, settings)?;
    crate::refresh_tray_status(app);
    Ok(saved)
}

pub async fn send_report_now_for_day(
    app: &AppHandle,
    day_key: &str,
    subject_override: Option<&str>,
    body_override: Option<&str>,
) -> AppResult<ScheduleSettings> {
    let mut settings = settings_store::load_schedule_settings(app)?;
    let day = day_key.trim();
    if day.is_empty() {
        return Err(AppError::Message("Thiếu ngày báo cáo.".to_string()));
    }

    match send_report_for_day(app, &settings, day, subject_override, body_override).await {
        Ok(()) => {
            settings.last_run_at = Some(Utc::now().timestamp());
            settings.last_run_status = Some(ScheduleRunStatus::Success);
            settings.last_run_error = None;
        }
        Err(err) => {
            settings.last_run_at = Some(Utc::now().timestamp());
            settings.last_run_status = Some(ScheduleRunStatus::Failed);
            settings.last_run_error = Some(err.to_string());
            settings_store::save_schedule_settings(app, settings)?;
            return Err(err);
        }
    }

    settings_store::save_schedule_settings(app, settings)
}

async fn send_report(app: &AppHandle, settings: &ScheduleSettings) -> AppResult<()> {
    let day = match settings.report_day_target {
        ReportDayTarget::Today => today_day_key_vn(),
        ReportDayTarget::Yesterday => yesterday_day_key_vn(),
    };
    // Lịch tự động / Chạy thử: DeepSeek (>0 review) hoặc mẫu 0 review.
    send_scheduled_deepseek_report(app, settings, &day).await
}

/// Luồng lịch tự động: >0 review → DeepSeek rồi gửi mail; 0 review → mẫu mặc định.
async fn send_scheduled_deepseek_report(
    app: &AppHandle,
    settings: &ScheduleSettings,
    day_key: &str,
) -> AppResult<()> {
    let smtp_email = settings
        .smtp_email
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| AppError::Message("Chưa cấu hình Gmail gửi.".to_string()))?;
    let smtp_app_password = settings
        .smtp_app_password
        .as_deref()
        .map(crate::email::normalize_gmail_app_password)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| {
            AppError::Message(
                "Chưa cấu hình App Password Gmail. Vào Settings → Tạo App Password → dán vào ô → Lưu."
                    .to_string(),
            )
        })?;
    let smtp_app_password = smtp_app_password.as_str();
    let recipient = settings.recipient.trim();
    if recipient.is_empty() {
        return Err(AppError::Message(
            "Chưa cấu hình email nhận báo cáo (To). Có thể nhập nhiều email, cách nhau bằng dấu phẩy."
                .to_string(),
        ));
    }

    let custom_path = settings_store::load_custom_service_account_path(app)?;
    let reviews = play_api::fetch_recent_reviews(custom_path.as_deref()).await?;
    let overview = stats::build_stats(&reviews);
    let target_stats = overview
        .daily_breakdown
        .iter()
        .find(|day| day.day == day_key)
        .cloned();

    let day_reviews = filter_reviews_by_day(&reviews, day_key);
    let review_count = if !day_reviews.is_empty() {
        day_reviews.len() as i64
    } else {
        target_stats
            .as_ref()
            .map(|stats| stats.review_count)
            .unwrap_or(0)
    };

    let (subject, body) = if review_count <= 0 {
        let body = build_zero_review_report_body(day_key);
        let _ = settings_store::save_deepseek_report(app, day_key, &body);
        (extract_deepseek_subject(&body), body)
    } else {
        let period = target_stats
            .clone()
            .map(Into::into)
            .ok_or_else(|| {
                AppError::Message(format!("Không tìm thấy dữ liệu cho ngày {day_key}."))
            })?;
        let source_report = build_daily_report_text(day_key, &period, &reviews);
        let deepseek_settings = settings_store::load_deepseek_settings(app)?;
        let generated = deepseek::generate_report(&deepseek_settings, day_key, &source_report).await?;
        let _ = settings_store::save_deepseek_report(app, day_key, &generated);
        let subject = extract_deepseek_subject(&generated);
        let body = strip_deepseek_subject_line(&generated);
        (subject, body)
    };

    email::send_report_email(
        smtp_email,
        smtp_app_password,
        recipient,
        settings.cc.as_deref(),
        settings.bcc.as_deref(),
        &subject,
        &body,
    )
    .await
}

async fn send_report_for_day(
    app: &AppHandle,
    settings: &ScheduleSettings,
    day_key: &str,
    subject_override: Option<&str>,
    body_override: Option<&str>,
) -> AppResult<()> {
    let smtp_email = settings
        .smtp_email
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| AppError::Message("Chưa cấu hình Gmail gửi.".to_string()))?;
    let smtp_app_password = settings
        .smtp_app_password
        .as_deref()
        .map(crate::email::normalize_gmail_app_password)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| {
            AppError::Message(
                "Chưa cấu hình App Password Gmail. Vào Settings → Tạo App Password → dán vào ô → Lưu."
                    .to_string(),
            )
        })?;
    let smtp_app_password = smtp_app_password.as_str();
    let recipient = settings.recipient.trim();
    if recipient.is_empty() {
        return Err(AppError::Message(
            "Chưa cấu hình email nhận báo cáo (To). Có thể nhập nhiều email, cách nhau bằng dấu phẩy."
                .to_string(),
        ));
    }

    let custom_body = body_override
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| value.to_string());

    let (subject, body) = if let Some(body) = custom_body {
        let subject = subject_override
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(|value| value.to_string())
            .unwrap_or_else(|| build_report_subject(day_key));
        (subject, body)
    } else {
        let custom_path = settings_store::load_custom_service_account_path(app)?;
        let reviews = play_api::fetch_recent_reviews(custom_path.as_deref()).await?;
        let overview = stats::build_stats(&reviews);
        let target_stats = overview
            .daily_breakdown
            .iter()
            .find(|day| day.day == day_key)
            .cloned()
            .ok_or_else(|| {
                AppError::Message(format!("Không tìm thấy dữ liệu cho ngày {day_key}."))
            })?;

        let subject = subject_override
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(|value| value.to_string())
            .unwrap_or_else(|| build_report_subject(day_key));
        let body = build_daily_report_text(day_key, &target_stats.into(), &reviews);
        (subject, body)
    };

    email::send_report_email(
        smtp_email,
        smtp_app_password,
        recipient,
        settings.cc.as_deref(),
        settings.bcc.as_deref(),
        &subject,
        &body,
    )
    .await
}

impl From<crate::models::DailyPeriodStats> for crate::models::PeriodStats {
    fn from(value: crate::models::DailyPeriodStats) -> Self {
        Self {
            review_count: value.review_count,
            average_rating: value.average_rating,
            reply_rate: value.reply_rate,
            rating_distribution: value.rating_distribution,
        }
    }
}
