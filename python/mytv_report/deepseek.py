from __future__ import annotations

import requests

from .config import DeepSeekConfig

DEEPSEEK_CHAT_URL = "https://api.deepseek.com/chat/completions"


def generate_report(settings: DeepSeekConfig, day: str, source_report: str) -> str:
    api_key = settings.api_key.strip()
    if not api_key or api_key == "********":
        raise ValueError("Chưa cấu hình DeepSeek API key trong config.json.")

    prompt = settings.prompt.strip()
    if not prompt:
        raise ValueError("Chưa cấu hình prompt DeepSeek.")

    report_payload = f"Ngày báo cáo: {day}\n\n{source_report}"
    if "{{REPORT}}" in prompt:
        user_content = prompt.replace("{{REPORT}}", report_payload)
    else:
        user_content = f"{prompt}\n\nDữ liệu báo cáo:\n\n{report_payload}"

    body = {
        "model": settings.model,
        "messages": [{"role": "user", "content": user_content}],
        "stream": False,
        "thinking": {"type": "disabled"},
    }

    response = requests.post(
        DEEPSEEK_CHAT_URL,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        json=body,
        timeout=120,
    )

    raw = response.text
    if not response.ok:
        raise RuntimeError(f"DeepSeek API lỗi ({response.status_code}): {_truncate(raw, 400)}")

    try:
        payload = response.json()
    except ValueError as err:
        raise RuntimeError(
            f"Phản hồi DeepSeek không hợp lệ: {err}. Body: {_truncate(raw, 300)}"
        ) from err

    choices = payload.get("choices") or []
    if not choices:
        raise RuntimeError("DeepSeek trả về nội dung rỗng.")

    text = ((choices[0].get("message") or {}).get("content") or "").strip()
    if not text:
        raise RuntimeError("DeepSeek trả về nội dung rỗng.")
    return text


def _truncate(value: str, max_len: int) -> str:
    trimmed = value.strip()
    if len(trimmed) <= max_len:
        return trimmed
    return trimmed[:max_len] + "…"
