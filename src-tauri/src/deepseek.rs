use crate::error::{AppError, AppResult};
use crate::models::DeepSeekSettings;
use serde::{Deserialize, Serialize};

const DEEPSEEK_CHAT_URL: &str = "https://api.deepseek.com/chat/completions";
const DEEPSEEK_MODEL: &str = "deepseek-v4-flash";

#[derive(Debug, Serialize)]
struct ChatRequest<'a> {
    model: &'a str,
    messages: Vec<ChatMessage<'a>>,
    stream: bool,
    thinking: ThinkingConfig<'a>,
}

#[derive(Debug, Serialize)]
struct ThinkingConfig<'a> {
    #[serde(rename = "type")]
    kind: &'a str,
}

#[derive(Debug, Serialize)]
struct ChatMessage<'a> {
    role: &'a str,
    content: &'a str,
}

#[derive(Debug, Deserialize)]
struct ChatResponse {
    choices: Vec<ChatChoice>,
}

#[derive(Debug, Deserialize)]
struct ChatChoice {
    message: ChatResponseMessage,
}

#[derive(Debug, Deserialize)]
struct ChatResponseMessage {
    content: Option<String>,
}

pub async fn generate_report(
    settings: &DeepSeekSettings,
    day: &str,
    source_report: &str,
) -> AppResult<String> {
    let api_key = settings
        .api_key
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty() && *value != "********")
        .ok_or_else(|| {
            AppError::Message(
                "Chưa cấu hình DeepSeek API key. Vào Cài đặt để nhập key.".into(),
            )
        })?;

    let prompt = settings.prompt.trim();
    if prompt.is_empty() {
        return Err(AppError::Message(
            "Chưa cấu hình prompt DeepSeek. Vào Cài đặt để nhập prompt.".into(),
        ));
    }

    let report_payload = format!("Ngày báo cáo: {day}\n\n{source_report}");
    let user_content = if prompt.contains("{{REPORT}}") {
        prompt.replace("{{REPORT}}", &report_payload)
    } else {
        format!("{prompt}\n\nDữ liệu báo cáo:\n\n{report_payload}")
    };

    let body = ChatRequest {
        model: DEEPSEEK_MODEL,
        messages: vec![ChatMessage {
            role: "user",
            content: &user_content,
        }],
        stream: false,
        thinking: ThinkingConfig { kind: "disabled" },
    };

    let client = reqwest::Client::new();
    let response = client
        .post(DEEPSEEK_CHAT_URL)
        .bearer_auth(api_key)
        .json(&body)
        .send()
        .await
        .map_err(|err| AppError::Message(format!("Không gọi được DeepSeek API: {err}")))?;

    let status = response.status();
    let raw = response
        .text()
        .await
        .map_err(|err| AppError::Message(format!("Không đọc được phản hồi DeepSeek: {err}")))?;

    if !status.is_success() {
        return Err(AppError::Message(format!(
            "DeepSeek API lỗi ({status}): {}",
            truncate(&raw, 400)
        )));
    }

    let parsed: ChatResponse = serde_json::from_str(&raw).map_err(|err| {
        AppError::Message(format!(
            "Phản hồi DeepSeek không hợp lệ: {err}. Body: {}",
            truncate(&raw, 300)
        ))
    })?;

    let text = parsed
        .choices
        .first()
        .and_then(|choice| choice.message.content.as_ref())
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .ok_or_else(|| AppError::Message("DeepSeek trả về nội dung rỗng.".into()))?;

    Ok(text)
}

fn truncate(value: &str, max: usize) -> String {
    let trimmed = value.trim();
    if trimmed.chars().count() <= max {
        return trimmed.to_string();
    }
    let short: String = trimmed.chars().take(max).collect();
    format!("{short}…")
}
