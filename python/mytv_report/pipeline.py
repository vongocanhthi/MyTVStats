from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from . import deepseek, email_smtp, play_api, report
from .config import AppConfig


@dataclass
class RunResult:
    day_key: str
    review_count: int
    subject: str
    body: str
    sent: bool
    source_report: str | None = None


def resolve_day_key(config: AppConfig, day_override: str | None = None) -> str:
    if day_override:
        return day_override.strip()
    if config.report_day_target == "today":
        return report.today_day_key_vn()
    return report.yesterday_day_key_vn()


def build_email_content(
    config: AppConfig,
    day_key: str,
    *,
    dry_run: bool = False,
) -> RunResult:
    reviews = play_api.fetch_recent_reviews(
        config.service_account_path,
        config.package_name,
    )
    breakdown = report.build_daily_breakdown(reviews)
    day_reviews = report.filter_reviews_by_day(reviews, day_key)
    stats = breakdown.get(day_key) or report.build_period_stats([])

    review_count = len(day_reviews) if day_reviews else stats.review_count

    if review_count <= 0:
        body = report.build_zero_review_report_body(day_key)
        subject = report.extract_deepseek_subject(body)
        return RunResult(
            day_key=day_key,
            review_count=0,
            subject=subject,
            body=body,
            sent=False,
            source_report=None,
        )

    source_report = report.build_daily_report_text(day_key, stats, reviews)
    if dry_run:
        # dry-run: không gọi DeepSeek — trả source report để xem trước
        return RunResult(
            day_key=day_key,
            review_count=review_count,
            subject=f"Báo cáo MyTV Reviews — {report.format_day_short_vn(day_key)}",
            body=source_report,
            sent=False,
            source_report=source_report,
        )

    generated = deepseek.generate_report(config.deepseek, day_key, source_report)
    subject = report.extract_deepseek_subject(generated)
    body = report.strip_deepseek_subject_line(generated)
    return RunResult(
        day_key=day_key,
        review_count=review_count,
        subject=subject,
        body=body,
        sent=False,
        source_report=source_report,
    )


def run_once(
    config: AppConfig,
    day_key: str | None = None,
    *,
    dry_run: bool = False,
    send: bool = True,
) -> RunResult:
    resolved_day = resolve_day_key(config, day_key)
    result = build_email_content(config, resolved_day, dry_run=dry_run)

    if dry_run or not send:
        return result

    email_smtp.send_report_email(
        from_email=config.gmail.from_email,
        app_password=config.gmail.app_password,
        to=config.gmail.to,
        cc=config.gmail.cc,
        bcc=config.gmail.bcc,
        subject=result.subject,
        body=result.body,
    )
    result.sent = True
    return result


def save_preview(result: RunResult, out_dir: Path) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / f"report-{result.day_key}.txt"
    content = f"Subject: {result.subject}\n\n{result.body}\n"
    path.write_text(content, encoding="utf-8")
    return path
