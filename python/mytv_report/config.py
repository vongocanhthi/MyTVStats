from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .prompt import DEFAULT_DEEPSEEK_PROMPT

PACKAGE_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_CONFIG_PATH = PACKAGE_ROOT / "config.json"
RECENT_WINDOW_DAYS = 7
PLAY_SCOPE = "https://www.googleapis.com/auth/androidpublisher"
DEFAULT_PACKAGE_NAME = "vn.mytvnet.mobileb2c"
DEEPSEEK_MODEL = "deepseek-v4-flash"
DEFAULT_SCHEDULE_HOUR = 9
DEFAULT_SCHEDULE_MINUTE = 0
DEFAULT_SCHEDULE_TIMEZONE = "Asia/Ho_Chi_Minh"


@dataclass(frozen=True)
class GmailConfig:
    from_email: str
    app_password: str
    to: str
    cc: str
    bcc: str


@dataclass(frozen=True)
class ScheduleConfig:
    enabled: bool
    hour: int
    minute: int
    timezone: str


@dataclass(frozen=True)
class AutostartConfig:
    """Muốn khởi động cùng hệ thống — áp dụng bằng: python main.py sync-autostart"""

    enabled: bool


@dataclass(frozen=True)
class DeepSeekConfig:
    api_key: str
    model: str
    prompt: str


@dataclass(frozen=True)
class AppConfig:
    package_name: str
    service_account_path: Path
    report_day_target: str  # "today" | "yesterday"
    gmail: GmailConfig
    deepseek: DeepSeekConfig
    schedule: ScheduleConfig
    autostart: AutostartConfig
    config_path: Path


def _resolve_path(raw: str, base: Path) -> Path:
    path = Path(raw).expanduser()
    if not path.is_absolute():
        path = (base / path).resolve()
    return path


def _strip_json_comments(text: str) -> str:
    """Cho phép // comment trong config.example.jsonc / config.json."""
    result: list[str] = []
    for line in text.splitlines():
        in_string = False
        escaped = False
        cut = len(line)
        i = 0
        while i < len(line):
            ch = line[i]
            if in_string:
                if escaped:
                    escaped = False
                elif ch == "\\":
                    escaped = True
                elif ch == '"':
                    in_string = False
            elif ch == '"':
                in_string = True
            elif ch == "/" and i + 1 < len(line) and line[i + 1] == "/":
                cut = i
                break
            i += 1
        result.append(line[:cut].rstrip())
    return "\n".join(result)


def _parse_bool(value: Any, default: bool) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "on"}
    return bool(value)


def _parse_schedule(raw: dict[str, Any] | None) -> ScheduleConfig:
    data = raw or {}
    hour = int(data.get("hour", DEFAULT_SCHEDULE_HOUR))
    minute = int(data.get("minute", DEFAULT_SCHEDULE_MINUTE))
    if not 0 <= hour <= 23:
        raise ValueError("schedule.hour phải trong khoảng 0–23.")
    if not 0 <= minute <= 59:
        raise ValueError("schedule.minute phải trong khoảng 0–59.")
    timezone = (data.get("timezone") or DEFAULT_SCHEDULE_TIMEZONE).strip()
    if not timezone:
        timezone = DEFAULT_SCHEDULE_TIMEZONE
    return ScheduleConfig(
        enabled=_parse_bool(data.get("enabled"), True),
        hour=hour,
        minute=minute,
        timezone=timezone,
    )


def _parse_autostart(raw: dict[str, Any] | None) -> AutostartConfig:
    data = raw or {}
    return AutostartConfig(enabled=_parse_bool(data.get("enabled"), True))


def load_config(path: Path | None = None) -> AppConfig:
    config_path = path or Path(os.environ.get("MYTV_CONFIG", DEFAULT_CONFIG_PATH))
    if not config_path.is_file():
        raise FileNotFoundError(
            f"Không tìm thấy config: {config_path}\n"
            f"Copy config.example.jsonc → config.json rồi điền credentials."
        )

    raw_text = _strip_json_comments(config_path.read_text(encoding="utf-8"))
    raw: dict[str, Any] = json.loads(raw_text)
    base = config_path.parent

    gmail_raw = raw.get("gmail") or {}
    deepseek_raw = raw.get("deepseek") or {}

    prompt = (deepseek_raw.get("prompt") or "").strip()
    if not prompt:
        prompt = DEFAULT_DEEPSEEK_PROMPT

    sa_path = _resolve_path(
        raw.get("service_account_path") or "credentials/service_account.json",
        base,
    )

    target = (raw.get("report_day_target") or "yesterday").strip().lower()
    if target not in {"today", "yesterday"}:
        raise ValueError('report_day_target phải là "today" hoặc "yesterday".')

    return AppConfig(
        package_name=(raw.get("package_name") or DEFAULT_PACKAGE_NAME).strip(),
        service_account_path=sa_path,
        report_day_target=target,
        gmail=GmailConfig(
            from_email=(gmail_raw.get("from") or "").strip(),
            app_password=(gmail_raw.get("app_password") or "").strip(),
            to=(gmail_raw.get("to") or "").strip(),
            cc=(gmail_raw.get("cc") or "").strip(),
            bcc=(gmail_raw.get("bcc") or "").strip(),
        ),
        deepseek=DeepSeekConfig(
            api_key=(deepseek_raw.get("api_key") or os.environ.get("DEEPSEEK_API_KEY") or "").strip(),
            model=(deepseek_raw.get("model") or DEEPSEEK_MODEL).strip(),
            prompt=prompt,
        ),
        schedule=_parse_schedule(raw.get("schedule")),
        autostart=_parse_autostart(raw.get("autostart")),
        config_path=config_path.resolve(),
    )
