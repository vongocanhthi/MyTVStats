use crate::error::AppResult;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

const SETTINGS_FILE_NAME: &str = "service-account-settings.json";

#[derive(Debug, Default, Serialize, Deserialize)]
struct StoredSettings {
    custom_service_account_path: Option<String>,
}

fn settings_file_path(app: &AppHandle) -> AppResult<PathBuf> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|err| crate::error::AppError::Message(err.to_string()))?;
    Ok(dir.join(SETTINGS_FILE_NAME))
}

pub fn load_custom_service_account_path(app: &AppHandle) -> AppResult<Option<String>> {
    let path = settings_file_path(app)?;
    if !path.exists() {
        return Ok(None);
    }

    let raw = fs::read_to_string(path)?;
    let parsed: StoredSettings = serde_json::from_str(&raw)?;
    Ok(parsed
        .custom_service_account_path
        .and_then(|value| {
            let trimmed = value.trim().to_string();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed)
            }
        }))
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

    let file_path = settings_file_path(app)?;
    if let Some(parent) = file_path.parent() {
        fs::create_dir_all(parent)?;
    }

    let payload = StoredSettings {
        custom_service_account_path: normalized.clone(),
    };
    fs::write(file_path, serde_json::to_string_pretty(&payload)?)?;
    Ok(normalized)
}
