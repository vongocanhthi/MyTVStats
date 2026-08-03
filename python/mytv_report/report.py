from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from .play_api import Review
from .prompt import DEFAULT_DEEPSEEK_EMAIL_SUBJECT

VN_TZ = ZoneInfo("Asia/Ho_Chi_Minh")


@dataclass
class RatingBucket:
    stars: int
    count: int
    percentage: float


@dataclass
class PeriodStats:
    review_count: int
    average_rating: float
    reply_rate: float
    rating_distribution: list[RatingBucket]


def today_day_key_vn() -> str:
    return datetime.now(VN_TZ).strftime("%Y-%m-%d")


def yesterday_day_key_vn() -> str:
    return (datetime.now(VN_TZ).date() - timedelta(days=1)).strftime("%Y-%m-%d")


def day_key_vn(timestamp: int) -> str:
    try:
        return datetime.fromtimestamp(timestamp, tz=VN_TZ).strftime("%Y-%m-%d")
    except (OSError, OverflowError, ValueError):
        return "unknown"


def filter_reviews_by_day(reviews: list[Review], day_key: str) -> list[Review]:
    filtered = [r for r in reviews if day_key_vn(r.last_modified_at) == day_key]
    filtered.sort(key=lambda r: (r.star_rating, -r.last_modified_at))
    return filtered


def build_period_stats(reviews: list[Review]) -> PeriodStats:
    if not reviews:
        return PeriodStats(
            review_count=0,
            average_rating=0.0,
            reply_rate=0.0,
            rating_distribution=_empty_distribution(),
        )

    count = len(reviews)
    avg = sum(r.star_rating for r in reviews) / count
    replied = sum(1 for r in reviews if r.has_developer_reply)
    return PeriodStats(
        review_count=count,
        average_rating=avg,
        reply_rate=(replied / count) * 100.0,
        rating_distribution=distribution_from_reviews(reviews),
    )


def build_daily_breakdown(reviews: list[Review]) -> dict[str, PeriodStats]:
    by_day: dict[str, list[Review]] = defaultdict(list)
    for review in reviews:
        by_day[day_key_vn(review.last_modified_at)].append(review)
    return {day: build_period_stats(items) for day, items in by_day.items()}


def build_daily_report_text(
    day_key: str,
    stats: PeriodStats,
    reviews: list[Review],
) -> str:
    day_reviews = filter_reviews_by_day(reviews, day_key)
    review_count = stats.review_count if not day_reviews else len(day_reviews)
    if day_reviews:
        average_rating = sum(r.star_rating for r in day_reviews) / len(day_reviews)
        replied = sum(1 for r in day_reviews if r.has_developer_reply)
        reply_rate = (replied / len(day_reviews)) * 100.0
        distribution = distribution_from_reviews(day_reviews)
    else:
        average_rating = stats.average_rating
        reply_rate = stats.reply_rate
        distribution = stats.rating_distribution or _empty_distribution()

    lines = [
        f"📋 Báo cáo MyTV Reviews — {format_day_short_vn(day_key)}",
        "",
        f"• Tổng reviews: {_format_number(review_count)}",
        f"• Rating trung bình: {_format_rating(average_rating)}★",
        f"• Tỷ lệ đã phản hồi: {_format_percent(reply_rate)}",
        "",
        "Phân bố sao:",
    ]

    for bucket in sorted(distribution, key=lambda b: b.stars, reverse=True):
        lines.append(
            f"• {bucket.stars}★: {_format_number(bucket.count)} ({bucket.percentage:.1f}%)"
        )

    lines.append("")
    lines.append(f"Chi tiết reviews ({_format_number(len(day_reviews))}):")

    if not day_reviews:
        lines.append("(Không có review trong ngày này)")
    else:
        for index, review in enumerate(day_reviews, start=1):
            lines.append("")
            lines.append(_format_review_for_report(review, index))

    return "\n".join(lines)


def build_zero_review_report_body(day_key: str) -> str:
    return (
        "Kính gửi Anh/Chị,\n\n"
        f"Dưới đây là tóm tắt đánh giá của khách hàng trên Google Play "
        f"trong kỳ báo cáo ngày {day_key}.\n\n"
        "Đánh giá tích cực (0 đánh giá)\n"
        "- Không ghi nhận đánh giá tích cực trong kỳ báo cáo.\n\n"
        "Đánh giá tiêu cực (0 đánh giá)\n"
        "- Không ghi nhận đánh giá tiêu cực trong kỳ báo cáo.\n\n"
        "Trân trọng."
    )


def extract_deepseek_subject(text: str) -> str:
    for line in text.splitlines():
        trimmed = line.strip()
        for prefix in ("Subject:", "Tiêu đề:"):
            if trimmed.startswith(prefix):
                value = trimmed[len(prefix) :].strip()
                if value:
                    return value
    return DEFAULT_DEEPSEEK_EMAIL_SUBJECT


def strip_deepseek_subject_line(text: str) -> str:
    lines = text.splitlines()
    if not lines:
        return text.lstrip()

    first = lines[0].strip()
    if first.startswith("Subject:") or first.startswith("Tiêu đề:"):
        rest = lines[1:]
        while rest and not rest[0].strip():
            rest = rest[1:]
        return "\n".join(rest).lstrip()
    return text.lstrip()


def format_day_short_vn(day_key: str) -> str:
    parts = day_key.split("-")
    if len(parts) != 3:
        return day_key
    return f"{parts[2]}/{parts[1]}/{parts[0]}"


def distribution_from_reviews(reviews: list[Review]) -> list[RatingBucket]:
    counts = [0] * 6
    for review in reviews:
        stars = max(1, min(5, review.star_rating))
        counts[stars] += 1
    total = len(reviews) or 1
    return [
        RatingBucket(
            stars=stars,
            count=counts[stars],
            percentage=(counts[stars] / total) * 100.0 if reviews else 0.0,
        )
        for stars in range(1, 6)
    ]


def _empty_distribution() -> list[RatingBucket]:
    return [RatingBucket(stars=s, count=0, percentage=0.0) for s in range(1, 6)]


def _format_review_for_report(review: Review, index: int) -> str:
    author = (review.author_name or "").strip() or "Ẩn danh"
    text = (review.text or "").strip() or "(Không có nội dung)"
    text = text.replace("\t", " — ")

    lines = [
        f"{index}. {_stars_text(review.star_rating)} — {author}",
        f"   Thời gian: {_format_timestamp_vn(review.last_modified_at)}",
        f"   Nội dung: {text}",
    ]
    if review.has_developer_reply:
        reply = (review.developer_reply or "").strip() or "(Không có nội dung phản hồi)"
        lines.append(f"   Phản hồi: {reply}")
    else:
        lines.append("   Phản hồi: Chưa phản hồi")
    return "\n".join(lines)


def _stars_text(stars: int) -> str:
    safe = max(1, min(5, stars))
    return "★" * safe + "☆" * (5 - safe)


def _format_timestamp_vn(timestamp: int) -> str:
    try:
        return datetime.fromtimestamp(timestamp, tz=VN_TZ).strftime("%H:%M %d/%m/%Y")
    except (OSError, OverflowError, ValueError):
        return "Không rõ"


def _format_number(value: int) -> str:
    negative = value < 0
    digits = list(str(abs(value)))[::-1]
    parts: list[str] = []
    for index, digit in enumerate(digits):
        if index > 0 and index % 3 == 0:
            parts.append(".")
        parts.append(digit)
    formatted = "".join(reversed(parts))
    return f"-{formatted}" if negative else formatted


def _format_percent(value: float) -> str:
    return f"{value:.1f}%"


def _format_rating(value: float) -> str:
    return f"{value:.2f}"
