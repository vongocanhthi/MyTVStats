use crate::models::{PeriodStats, RatingBucket, Review};
use chrono::{Days, TimeZone, Utc};
use chrono_tz::Asia::Ho_Chi_Minh;

pub fn today_day_key_vn() -> String {
    Utc::now()
        .with_timezone(&Ho_Chi_Minh)
        .format("%Y-%m-%d")
        .to_string()
}

pub fn yesterday_day_key_vn() -> String {
    let yesterday = Utc::now()
        .with_timezone(&Ho_Chi_Minh)
        .date_naive()
        .checked_sub_days(Days::new(1))
        .unwrap_or_else(|| Utc::now().with_timezone(&Ho_Chi_Minh).date_naive());
    yesterday.format("%Y-%m-%d").to_string()
}

pub fn filter_reviews_by_day(reviews: &[Review], day_key: &str) -> Vec<Review> {
    let mut filtered: Vec<Review> = reviews
        .iter()
        .filter(|review| day_key_vn(review.last_modified_at) == day_key)
        .cloned()
        .collect();
    filtered.sort_by(|a, b| {
        a.star_rating
            .cmp(&b.star_rating)
            .then_with(|| b.last_modified_at.cmp(&a.last_modified_at))
    });
    filtered
}

pub fn build_daily_report_text(day_key: &str, stats: &PeriodStats, reviews: &[Review]) -> String {
    let day_reviews = filter_reviews_by_day(reviews, day_key);
    let review_count = if day_reviews.is_empty() {
        stats.review_count
    } else {
        day_reviews.len() as i64
    };
    let average_rating = if day_reviews.is_empty() {
        stats.average_rating
    } else {
        day_reviews.iter().map(|review| review.star_rating as f64).sum::<f64>() / day_reviews.len() as f64
    };
    let reply_rate = if day_reviews.is_empty() {
        stats.reply_rate
    } else {
        let replied = day_reviews
            .iter()
            .filter(|review| review.has_developer_reply)
            .count() as f64;
        (replied / day_reviews.len() as f64) * 100.0
    };
    let distribution = resolve_rating_distribution(stats, &day_reviews);

    let mut lines = vec![
        format!("📋 Báo cáo MyTV Reviews — {}", format_day_short_vn(day_key)),
        String::new(),
        format!("• Tổng reviews: {}", format_number(review_count)),
        format!("• Rating trung bình: {}★", format_rating(average_rating)),
        format!("• Tỷ lệ đã phản hồi: {}", format_percent(reply_rate)),
        String::new(),
        "Phân bố sao:".to_string(),
    ];

    let mut sorted_distribution = distribution;
    sorted_distribution.sort_by(|a, b| b.stars.cmp(&a.stars));
    for bucket in sorted_distribution {
        lines.push(format!(
            "• {}★: {} ({:.1}%)",
            bucket.stars,
            format_number(bucket.count),
            bucket.percentage
        ));
    }

    lines.push(String::new());
    lines.push(format!(
        "Chi tiết reviews ({}):",
        format_number(day_reviews.len() as i64)
    ));

    if day_reviews.is_empty() {
        lines.push("(Không có review trong ngày này)".to_string());
    } else {
        for (index, review) in day_reviews.iter().enumerate() {
            lines.push(String::new());
            lines.push(format_review_for_report(review, index + 1));
        }
    }

    lines.join("\n")
}

pub fn build_report_subject(day_key: &str) -> String {
    format!("Báo cáo MyTV Reviews — {}", format_day_short_vn(day_key))
}

fn day_key_vn(timestamp: i64) -> String {
    match Ho_Chi_Minh.timestamp_opt(timestamp, 0).single() {
        Some(value) => value.format("%Y-%m-%d").to_string(),
        None => "unknown".to_string(),
    }
}

fn format_day_short_vn(day_key: &str) -> String {
    let parts: Vec<&str> = day_key.split('-').collect();
    if parts.len() != 3 {
        return day_key.to_string();
    }
    format!("{}/{}/{}", parts[2], parts[1], parts[0])
}

fn format_review_for_report(review: &Review, index: usize) -> String {
    let author = review
        .author_name
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("Ẩn danh");
    let text = review
        .text
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("(Không có nội dung)")
        .replace('\t', " — ");

    let mut lines = vec![
        format!("{}. {} — {}", index, stars_text(review.star_rating), author),
        format!("   Thời gian: {}", format_timestamp_vn(review.last_modified_at)),
        format!("   Nội dung: {}", text),
    ];

    if review.has_developer_reply {
        let reply = review
            .developer_reply
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or("(Không có nội dung phản hồi)");
        lines.push(format!("   Phản hồi: {}", reply));
    } else {
        lines.push("   Phản hồi: Chưa phản hồi".to_string());
    }

    lines.join("\n")
}

fn stars_text(stars: i32) -> String {
    let safe = stars.clamp(1, 5) as usize;
    format!("{}{}", "★".repeat(safe), "☆".repeat(5usize.saturating_sub(safe)))
}

fn distribution_from_reviews(reviews: &[Review]) -> Vec<RatingBucket> {
    let mut counts = [0_i64; 6];
    for review in reviews {
        let stars = review.star_rating.clamp(1, 5) as usize;
        counts[stars] += 1;
    }

    let total = reviews.len() as f64;
    (1..=5)
        .map(|stars| RatingBucket {
            stars,
            count: counts[stars as usize],
            percentage: if total > 0.0 {
                (counts[stars as usize] as f64 / total) * 100.0
            } else {
                0.0
            },
        })
        .collect()
}

fn resolve_rating_distribution(stats: &PeriodStats, day_reviews: &[Review]) -> Vec<RatingBucket> {
    if !day_reviews.is_empty() {
        return distribution_from_reviews(day_reviews);
    }
    if !stats.rating_distribution.is_empty() {
        return stats.rating_distribution.clone();
    }
    (1..=5)
        .map(|stars| RatingBucket {
            stars,
            count: 0,
            percentage: 0.0,
        })
        .collect()
}

fn format_timestamp_vn(timestamp: i64) -> String {
    match Ho_Chi_Minh.timestamp_opt(timestamp, 0).single() {
        Some(value) => value.format("%H:%M %d/%m/%Y").to_string(),
        None => "Không rõ".to_string(),
    }
}

fn format_number(value: i64) -> String {
    let negative = value < 0;
    let digits: Vec<char> = value.abs().to_string().chars().rev().collect();
    let mut parts = String::new();
    for (index, digit) in digits.iter().enumerate() {
        if index > 0 && index % 3 == 0 {
            parts.push('.');
        }
        parts.push(*digit);
    }
    let formatted: String = parts.chars().rev().collect();
    if negative {
        format!("-{formatted}")
    } else {
        formatted
    }
}

fn format_percent(value: f64) -> String {
    format!("{value:.1}%")
}

fn format_rating(value: f64) -> String {
    format!("{value:.2}")
}
