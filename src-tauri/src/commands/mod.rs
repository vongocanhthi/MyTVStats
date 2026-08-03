use crate::deepseek;
use crate::error::AppResult;
use crate::models::{
    AppSettings, DeepSeekGenerateResult, DeepSeekSettings, ReviewFilters, ReviewsPage,
    ScheduleSettings, StatsOverview,
};
use crate::play_api;
use crate::scheduler;
use crate::settings_store;
use crate::stats;
use tauri::command;
use tauri_plugin_autostart::ManagerExt;

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
    let label = settings_store::service_account_label(&app)?;
    Ok(stats::default_settings(label))
}

#[command]
pub fn set_service_account_path(
    app: tauri::AppHandle,
    path: Option<String>,
) -> AppResult<AppSettings> {
    settings_store::save_custom_service_account_path(&app, path)?;
    let label = settings_store::service_account_label(&app)?;
    Ok(stats::default_settings(label))
}

#[command]
pub fn set_service_account_json(
    app: tauri::AppHandle,
    raw: Option<String>,
) -> AppResult<AppSettings> {
    settings_store::save_service_account_json(&app, raw)?;
    let label = settings_store::service_account_label(&app)?;
    Ok(stats::default_settings(label))
}

#[command]
pub fn get_schedule_settings(app: tauri::AppHandle) -> AppResult<ScheduleSettings> {
    Ok(mask_schedule_for_ui(settings_store::load_schedule_settings(
        &app,
    )?))
}

#[command]
pub async fn set_schedule_settings(
    app: tauri::AppHandle,
    mut settings: ScheduleSettings,
) -> AppResult<ScheduleSettings> {
    // Placeholder mask từ UI không được ghi đè password thật.
    if settings.smtp_app_password.as_deref() == Some("********") {
        settings.smtp_app_password = None;
    }
    sync_autostart(&app, settings.autostart_enabled)?;
    let saved = settings_store::save_schedule_settings(&app, settings)?;
    // Đổi giờ / bật-tắt lịch → gỡ cron cũ, đăng ký lại.
    scheduler::reschedule_from_settings(&app).await?;
    crate::refresh_tray_status(&app);
    Ok(mask_schedule_for_ui(saved))
}

#[command]
pub async fn run_daily_report_now(app: tauri::AppHandle) -> AppResult<ScheduleSettings> {
    Ok(mask_schedule_for_ui(
        scheduler::run_daily_report_job(&app, true).await?,
    ))
}

#[command]
pub async fn send_report_now(
    app: tauri::AppHandle,
    day: String,
    subject: Option<String>,
    body: Option<String>,
) -> AppResult<ScheduleSettings> {
    Ok(mask_schedule_for_ui(
        scheduler::send_report_now_for_day(
            &app,
            &day,
            subject.as_deref(),
            body.as_deref(),
        )
        .await?,
    ))
}

#[command]
pub fn set_autostart_enabled(
    app: tauri::AppHandle,
    enabled: bool,
) -> AppResult<ScheduleSettings> {
    sync_autostart(&app, enabled)?;
    let mut settings = settings_store::load_schedule_settings(&app)?;
    settings.autostart_enabled = enabled;
    Ok(mask_schedule_for_ui(settings_store::save_schedule_settings(
        &app, settings,
    )?))
}

#[command]
pub fn get_deepseek_settings(app: tauri::AppHandle) -> AppResult<DeepSeekSettings> {
    Ok(mask_deepseek_for_ui(settings_store::load_deepseek_settings(
        &app,
    )?))
}

#[command]
pub fn set_deepseek_settings(
    app: tauri::AppHandle,
    mut settings: DeepSeekSettings,
) -> AppResult<DeepSeekSettings> {
    if settings.api_key.as_deref() == Some("********") {
        settings.api_key = None;
    }
    // Settings UI chỉ cập nhật key/prompt — không xoá báo cáo đã lưu.
    settings.last_report_day = None;
    settings.last_report_text = None;
    Ok(mask_deepseek_for_ui(settings_store::save_deepseek_settings(
        &app, settings,
    )?))
}

#[command]
pub async fn generate_deepseek_report(
    app: tauri::AppHandle,
    day: String,
    source_report: String,
) -> AppResult<DeepSeekGenerateResult> {
    let settings = settings_store::load_deepseek_settings(&app)?;
    let text = deepseek::generate_report(&settings, &day, &source_report).await?;
    let saved = settings_store::save_deepseek_report(&app, &day, &text)?;
    Ok(DeepSeekGenerateResult {
        day,
        text,
        settings: mask_deepseek_for_ui(saved),
    })
}

#[command]
pub fn save_deepseek_report_text(
    app: tauri::AppHandle,
    day: String,
    text: String,
) -> AppResult<DeepSeekSettings> {
    Ok(mask_deepseek_for_ui(settings_store::save_deepseek_report(
        &app, &day, &text,
    )?))
}

fn sync_autostart(app: &tauri::AppHandle, enabled: bool) -> AppResult<()> {
    let manager = app.autolaunch();
    if enabled {
        manager
            .enable()
            .map_err(|err| {
                crate::error::AppError::Message(format!("Không bật được autostart: {err}"))
            })?;
    } else {
        manager
            .disable()
            .map_err(|err| {
                crate::error::AppError::Message(format!("Không tắt được autostart: {err}"))
            })?;
    }
    Ok(())
}

fn mask_schedule_for_ui(mut settings: ScheduleSettings) -> ScheduleSettings {
    if settings
        .smtp_app_password
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .is_some()
    {
        settings.smtp_app_password = Some("********".to_string());
    }
    settings
}

fn mask_deepseek_for_ui(mut settings: DeepSeekSettings) -> DeepSeekSettings {
    if settings
        .api_key
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .is_some()
    {
        settings.api_key = Some("********".to_string());
    }
    settings
}
