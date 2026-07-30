use crate::models::ScheduleSettings;

/// Trước đây đọc `.env` — đã tắt. Cấu hình chỉ qua Settings UI.
pub fn load_dotenv_files() {}

/// Env overrides đã tắt — cấu hình chỉ qua Settings UI (lưu local).
pub fn apply_schedule_env_overrides(_settings: &mut ScheduleSettings) -> Vec<String> {
    Vec::new()
}

pub fn env_file_hint() -> String {
    "Cấu hình qua Settings (không dùng .env)".to_string()
}
