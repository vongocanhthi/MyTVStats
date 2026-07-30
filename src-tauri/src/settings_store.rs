use crate::env_config;
use crate::error::AppResult;
use crate::models::{ReportDayTarget, ScheduleRunStatus, ScheduleSettings};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

const SETTINGS_FILE_NAME: &str = "service-account-settings.json";
const SERVICE_ACCOUNT_FILE_NAME: &str = "service_account.json";
const DEFAULT_RECIPIENT: &str = "";

#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredSettings {
    custom_service_account_path: Option<String>,
    #[serde(default)]
    schedule: Option<StoredScheduleSettings>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredScheduleSettings {
    enabled: bool,
    hour: u8,
    minute: u8,
    recipient: String,
    #[serde(default)]
    cc: Option<String>,
    #[serde(default)]
    bcc: Option<String>,
    smtp_email: Option<String>,
    smtp_app_password: Option<String>,
    autostart_enabled: bool,
    start_minimized: bool,
    #[serde(default)]
    report_day_target: ReportDayTarget,
    last_run_day: Option<String>,
    last_run_at: Option<i64>,
    last_run_status: Option<ScheduleRunStatus>,
    last_run_error: Option<String>,
}

impl Default for StoredScheduleSettings {
    fn default() -> Self {
        Self {
            enabled: true,
            hour: 9,
            minute: 0,
            recipient: DEFAULT_RECIPIENT.to_string(),
            cc: None,
            bcc: None,
            smtp_email: None,
            smtp_app_password: None,
            autostart_enabled: true,
            start_minimized: true,
            report_day_target: ReportDayTarget::Yesterday,
            last_run_day: None,
            last_run_at: None,
            last_run_status: None,
            last_run_error: None,
        }
    }
}

impl From<StoredScheduleSettings> for ScheduleSettings {
    fn from(value: StoredScheduleSettings) -> Self {
        Self {
            enabled: value.enabled,
            hour: value.hour,
            minute: value.minute,
            recipient: value.recipient,
            cc: value.cc,
            bcc: value.bcc,
            smtp_email: value.smtp_email,
            smtp_app_password: value.smtp_app_password,
            autostart_enabled: value.autostart_enabled,
            start_minimized: value.start_minimized,
            report_day_target: value.report_day_target,
            last_run_day: value.last_run_day,
            last_run_at: value.last_run_at,
            last_run_status: value.last_run_status,
            last_run_error: value.last_run_error,
            env_overrides: Vec::new(),
        }
    }
}

impl From<&ScheduleSettings> for StoredScheduleSettings {
    fn from(value: &ScheduleSettings) -> Self {
        Self {
            enabled: value.enabled,
            hour: value.hour,
            minute: value.minute,
            recipient: value.recipient.clone(),
            cc: value.cc.clone(),
            bcc: value.bcc.clone(),
            smtp_email: value.smtp_email.clone(),
            smtp_app_password: value.smtp_app_password.clone(),
            autostart_enabled: value.autostart_enabled,
            start_minimized: value.start_minimized,
            report_day_target: value.report_day_target.clone(),
            last_run_day: value.last_run_day.clone(),
            last_run_at: value.last_run_at,
            last_run_status: value.last_run_status.clone(),
            last_run_error: value.last_run_error.clone(),
        }
    }
}

fn app_config_dir(app: &AppHandle) -> AppResult<PathBuf> {
    app.path()
        .app_config_dir()
        .map_err(|err| crate::error::AppError::Message(err.to_string()))
}

fn settings_file_path(app: &AppHandle) -> AppResult<PathBuf> {
    Ok(app_config_dir(app)?.join(SETTINGS_FILE_NAME))
}

fn local_service_account_path(app: &AppHandle) -> AppResult<PathBuf> {
    Ok(app_config_dir(app)?.join(SERVICE_ACCOUNT_FILE_NAME))
}

pub fn load_custom_service_account_path(app: &AppHandle) -> AppResult<Option<String>> {
    let parsed = load_settings(app)?;
    let stored = parsed.custom_service_account_path.and_then(|value| {
        let trimmed = value.trim().to_string();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed)
        }
    });

    if let Some(path) = stored {
        if PathBuf::from(&path).exists() {
            return Ok(Some(path));
        }
    }

    let local_path = local_service_account_path(app)?;
    if local_path.exists() {
        return Ok(Some(local_path.to_string_lossy().to_string()));
    }

    Ok(None)
}

pub fn service_account_label(app: &AppHandle) -> AppResult<Option<String>> {
    let Some(path) = load_custom_service_account_path(app)? else {
        return Ok(None);
    };

    let raw = fs::read_to_string(&path).map_err(|err| {
        crate::error::AppError::Message(format!(
            "Không đọc được Service Account đã lưu: {err}"
        ))
    })?;
    let parsed: serde_json::Value = serde_json::from_str(&raw).map_err(|err| {
        crate::error::AppError::Message(format!("Service Account JSON không hợp lệ: {err}"))
    })?;
    let email = parsed
        .get("client_email")
        .and_then(|value| value.as_str())
        .unwrap_or("đã lưu");
    Ok(Some(format!("custom ({email})")))
}

pub fn save_custom_service_account_path(
    app: &AppHandle,
    custom_path: Option<String>,
) -> AppResult<Option<String>> {
    let normalized = custom_path.and_then(|value| {
        let trimmed = value.trim().to_string();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed)
        }
    });

    if normalized.is_none() {
        clear_local_service_account_file(app)?;
    }

    let mut payload = load_settings(app)?;
    payload.custom_service_account_path = normalized.clone();
    save_settings(app, &payload)?;
    Ok(normalized)
}

/// Lưu nội dung JSON Service Account vào app config local (không hỏi lại lần sau).
pub fn save_service_account_json(
    app: &AppHandle,
    raw_json: Option<String>,
) -> AppResult<Option<String>> {
    match raw_json {
        None => {
            clear_local_service_account_file(app)?;
            let mut payload = load_settings(app)?;
            payload.custom_service_account_path = None;
            save_settings(app, &payload)?;
            Ok(None)
        }
        Some(raw) => {
            let trimmed = raw.trim();
            if trimmed.is_empty() {
                return save_service_account_json(app, None);
            }

            let parsed: serde_json::Value = serde_json::from_str(trimmed).map_err(|err| {
                crate::error::AppError::Message(format!("File JSON không hợp lệ: {err}"))
            })?;
            if parsed.get("client_email").and_then(|v| v.as_str()).is_none()
                || parsed.get("private_key").and_then(|v| v.as_str()).is_none()
            {
                return Err(crate::error::AppError::Message(
                    "File JSON thiếu client_email hoặc private_key.".into(),
                ));
            }

            let path = local_service_account_path(app)?;
            if let Some(parent) = path.parent() {
                fs::create_dir_all(parent)?;
            }
            fs::write(&path, trimmed)?;

            let path_str = path.to_string_lossy().to_string();
            let mut payload = load_settings(app)?;
            payload.custom_service_account_path = Some(path_str.clone());
            save_settings(app, &payload)?;
            Ok(Some(path_str))
        }
    }
}

fn clear_local_service_account_file(app: &AppHandle) -> AppResult<()> {
    let path = local_service_account_path(app)?;
    if path.exists() {
        fs::remove_file(&path).map_err(|err| {
            crate::error::AppError::Message(format!(
                "Không xóa được Service Account local: {err}"
            ))
        })?;
    }
    Ok(())
}

pub fn load_schedule_settings(app: &AppHandle) -> AppResult<ScheduleSettings> {
    let parsed = load_settings(app)?;
    let mut settings: ScheduleSettings = parsed.schedule.unwrap_or_default().into();
    let overrides = env_config::apply_schedule_env_overrides(&mut settings);
    settings.env_overrides = overrides;
    Ok(settings)
}

pub fn save_schedule_settings(
    app: &AppHandle,
    mut settings: ScheduleSettings,
) -> AppResult<ScheduleSettings> {
    let mut payload = load_settings(app)?;
    let previous = payload.schedule.clone().unwrap_or_default();

    // Chuẩn hóa App Password (bỏ khoảng trắng) trước khi lưu.
    if let Some(raw) = settings.smtp_app_password.take() {
        let normalized = crate::email::normalize_gmail_app_password(&raw);
        if normalized.is_empty() || normalized == "********" {
            settings.smtp_app_password = None;
        } else {
            settings.smtp_app_password = Some(normalized);
        }
    }

    // Không ghi đè secret local bằng chuỗi rỗng khi UI để trống.
    if settings
        .smtp_app_password
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .is_none()
    {
        settings.smtp_app_password = previous.smtp_app_password.clone();
    }
    if settings
        .smtp_email
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .is_none()
    {
        settings.smtp_email = previous.smtp_email.clone();
    }

    // Không persist giá trị đã override từ env vào disk — giữ phần local riêng.
    let mut to_store = StoredScheduleSettings::from(&settings);
    if settings.env_overrides.iter().any(|k| k == "SMTP_EMAIL") {
        to_store.smtp_email = previous.smtp_email.clone();
    }
    if settings
        .env_overrides
        .iter()
        .any(|k| k == "SMTP_APP_PASSWORD")
    {
        to_store.smtp_app_password = previous.smtp_app_password.clone();
    }
    if settings
        .env_overrides
        .iter()
        .any(|k| k == "REPORT_RECIPIENT")
    {
        to_store.recipient = previous.recipient.clone();
    }
    if settings
        .env_overrides
        .iter()
        .any(|k| k == "SCHEDULE_ENABLED")
    {
        to_store.enabled = previous.enabled;
    }
    if settings.env_overrides.iter().any(|k| k == "SCHEDULE_HOUR") {
        to_store.hour = previous.hour;
    }
    if settings
        .env_overrides
        .iter()
        .any(|k| k == "SCHEDULE_MINUTE")
    {
        to_store.minute = previous.minute;
    }
    if settings
        .env_overrides
        .iter()
        .any(|k| k == "AUTOSTART_ENABLED")
    {
        to_store.autostart_enabled = previous.autostart_enabled;
    }
    if settings
        .env_overrides
        .iter()
        .any(|k| k == "START_MINIMIZED")
    {
        to_store.start_minimized = previous.start_minimized;
    }

    // last_run* luôn lưu từ runtime.
    to_store.last_run_day = settings.last_run_day.clone();
    to_store.last_run_at = settings.last_run_at;
    to_store.last_run_status = settings.last_run_status.clone();
    to_store.last_run_error = settings.last_run_error.clone();

    payload.schedule = Some(to_store);
    save_settings(app, &payload)?;
    load_schedule_settings(app)
}

fn load_settings(app: &AppHandle) -> AppResult<StoredSettings> {
    let path = settings_file_path(app)?;
    if !path.exists() {
        return Ok(StoredSettings::default());
    }

    let raw = fs::read_to_string(path)?;
    Ok(serde_json::from_str(&raw)?)
}

fn save_settings(app: &AppHandle, settings: &StoredSettings) -> AppResult<()> {
    let file_path = settings_file_path(app)?;
    if let Some(parent) = file_path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(file_path, serde_json::to_string_pretty(settings)?)?;
    Ok(())
}
