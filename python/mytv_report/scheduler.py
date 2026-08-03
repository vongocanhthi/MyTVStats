from __future__ import annotations

import json
import time
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

from .config import AppConfig, load_config
from .pipeline import run_once
from .report import today_day_key_vn

STATE_FILENAME = "schedule_state.json"


def state_path(config: AppConfig) -> Path:
    return config.config_path.parent / "data" / STATE_FILENAME


def load_last_run_day(config: AppConfig) -> str | None:
    path = state_path(config)
    if not path.is_file():
        return None
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    value = raw.get("last_run_day")
    return value if isinstance(value, str) and value else None


def save_last_run_day(config: AppConfig, day_key: str, status: str, error: str | None = None) -> None:
    path = state_path(config)
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "last_run_day": day_key,
        "last_run_at": datetime.now(ZoneInfo(config.schedule.timezone)).isoformat(),
        "last_run_status": status,
        "last_run_error": error,
    }
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def next_run_at(config: AppConfig, now: datetime | None = None) -> datetime:
    tz = ZoneInfo(config.schedule.timezone)
    current = now.astimezone(tz) if now else datetime.now(tz)
    candidate = current.replace(
        hour=config.schedule.hour,
        minute=config.schedule.minute,
        second=0,
        microsecond=0,
    )
    if current >= candidate:
        candidate += timedelta(days=1)
    return candidate


def run_scheduled_job(config: AppConfig, *, force: bool = False) -> str:
    """Chạy job lịch. Trả về status: success | skipped | failed."""
    today = today_day_key_vn()

    if not config.schedule.enabled and not force:
        save_last_run_day(config, today, "skipped", "Lịch tự động đang tắt (schedule.enabled=false).")
        return "skipped"

    if not force and load_last_run_day(config) == today:
        save_last_run_day(config, today, "skipped", "Đã gửi báo cáo hôm nay rồi.")
        return "skipped"

    try:
        result = run_once(config, send=True)
        save_last_run_day(config, today, "success")
        print(
            f"[schedule] OK day={result.day_key} reviews={result.review_count} "
            f"subject={result.subject!r}",
            flush=True,
        )
        return "success"
    except Exception as err:  # noqa: BLE001
        save_last_run_day(config, today, "failed", str(err))
        print(f"[schedule] FAILED: {err}", flush=True)
        return "failed"


def serve_forever(config_path: Path | None = None) -> None:
    """Vòng lặp: đợi tới giờ cấu hình rồi gửi; reload config mỗi vòng."""
    print("[schedule] MyTV report scheduler started", flush=True)

    while True:
        config = load_config(config_path)
        sched = config.schedule

        if not sched.enabled:
            print(
                "[schedule] idle — schedule.enabled=false (sửa config rồi đợi ~60s)",
                flush=True,
            )
            time.sleep(60)
            continue

        target = next_run_at(config)
        now = datetime.now(ZoneInfo(sched.timezone))
        wait_seconds = max(1.0, (target - now).total_seconds())
        print(
            f"[schedule] next run {target.isoformat()} "
            f"({sched.hour:02d}:{sched.minute:02d} {sched.timezone}) "
            f"— sleep {int(wait_seconds)}s",
            flush=True,
        )

        # Ngủ từng đoạn ngắn để kịp nhận thay đổi giờ trong config.
        deadline = time.monotonic() + wait_seconds
        while time.monotonic() < deadline:
            time.sleep(min(30.0, deadline - time.monotonic()))
            refreshed = load_config(config_path)
            if (
                refreshed.schedule.hour != sched.hour
                or refreshed.schedule.minute != sched.minute
                or refreshed.schedule.timezone != sched.timezone
                or refreshed.schedule.enabled != sched.enabled
            ):
                print("[schedule] config schedule changed — reschedule", flush=True)
                break
        else:
            # Hết thời gian chờ → chạy job
            run_scheduled_job(load_config(config_path))
            # Tránh chạy lại ngay trong cùng phút
            time.sleep(61)
