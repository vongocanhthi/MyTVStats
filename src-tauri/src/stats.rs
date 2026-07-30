use crate::models::{
    DailyPeriodStats, DailyTrendPoint, PeriodStats, RatingBucket, Review, ReviewFilters,
    ReviewsPage, StatsOverview, VersionStats, PACKAGE_NAME, RECENT_WINDOW_DAYS,
};
use chrono::{Duration, FixedOffset, NaiveDate, NaiveTime, TimeZone, Utc};
use std::collections::HashMap;

const RECENT_ONLY_SCOPE: &str = "recent_only";

fn vietnam_tz() -> FixedOffset {
    FixedOffset::east_opt(7 * 3600).expect("valid VN offset")
}

fn day_key_vn(timestamp: i64) -> String {
    vietnam_tz()
        .timestamp_opt(timestamp, 0)
        .single()
        .map(|dt| dt.format("%Y-%m-%d").to_string())
        .unwrap_or_else(|| "unknown".into())
}

pub fn build_stats(reviews: &[Review]) -> StatsOverview {
    let window_start = (Utc::now() - Duration::days(RECENT_WINDOW_DAYS)).timestamp();
    let today_start = Utc
        .from_utc_datetime(
            &Utc::now()
                .date_naive()
                .and_time(NaiveTime::from_hms_opt(0, 0, 0).expect("valid midnight")),
        )
        .timestamp();

    let in_window: Vec<&Review> = reviews
        .iter()
        .filter(|r| r.last_modified_at >= window_start)
        .collect();

    let today = period_stats(
        &in_window
            .iter()
            .copied()
            .filter(|r| r.last_modified_at >= today_start)
            .collect::<Vec<_>>(),
    );
    let last_7_days = period_stats(&in_window);
    let daily_trend = daily_trend(&in_window);
    let daily_breakdown = daily_breakdown(&in_window);
    let top_versions = top_versions(&in_window);

    StatsOverview {
        data_scope: RECENT_ONLY_SCOPE.to_string(),
        csv_review_count: 0,
        api_review_count: in_window.len() as i64,
        total_reviews: last_7_days.review_count,
        average_rating: last_7_days.average_rating,
        rating_distribution: last_7_days.rating_distribution.clone(),
        reviews_last_7_days: last_7_days.review_count,
        reply_rate: last_7_days.reply_rate,
        today,
        last_7_days,
        daily_trend,
        daily_breakdown,
        monthly_trend: Vec::new(),
        top_versions,
        last_sync_at: Some(Utc::now().timestamp()),
    }
}

pub fn list_reviews(reviews: &[Review], filters: ReviewFilters) -> ReviewsPage {
    let page = filters.page.unwrap_or(1).max(1);
    let page_size = filters.page_size.unwrap_or(50).clamp(1, 200);

    let search = filters
        .search
        .as_ref()
        .map(|s| s.trim().to_lowercase())
        .filter(|s| !s.is_empty());

    let mut filtered: Vec<&Review> = reviews
        .iter()
        .filter(|review| {
            if let Some(min) = filters.min_rating {
                if review.star_rating < min {
                    return false;
                }
            }
            if let Some(max) = filters.max_rating {
                if review.star_rating > max {
                    return false;
                }
            }
            if let Some(version) = filters.version_name.as_ref().filter(|s| !s.trim().is_empty()) {
                if review.app_version_name.as_deref() != Some(version.as_str()) {
                    return false;
                }
            }
            if let Some(q) = &search {
                let text = review.text.as_deref().unwrap_or("").to_lowercase();
                let author = review.author_name.as_deref().unwrap_or("").to_lowercase();
                let id = review.review_id.to_lowercase();
                if !(text.contains(q) || author.contains(q) || id.contains(q)) {
                    return false;
                }
            }
            true
        })
        .collect();

    let sort_by = filters.sort_by.as_deref().unwrap_or("lastModifiedAt");
    let ascending = matches!(
        filters.sort_order.as_deref(),
        Some("asc") | Some("Asc") | Some("ASC")
    );

    filtered.sort_by(|a, b| {
        let primary = match sort_by {
            "starRating" | "star_rating" => a.star_rating.cmp(&b.star_rating),
            _ => a.last_modified_at.cmp(&b.last_modified_at),
        };
        let ordered = if ascending {
            primary
        } else {
            primary.reverse()
        };
        ordered.then_with(|| a.review_id.cmp(&b.review_id))
    });

    let total = filtered.len() as i64;
    let start = ((page - 1) * page_size) as usize;
    let items = filtered
        .into_iter()
        .skip(start)
        .take(page_size as usize)
        .cloned()
        .collect();

    ReviewsPage {
        items,
        total,
        page,
        page_size,
    }
}

pub fn default_settings(service_account_path: Option<String>) -> crate::models::AppSettings {
    crate::models::AppSettings {
        service_account_path,
        package_name: PACKAGE_NAME.to_string(),
    }
}

fn period_stats(reviews: &[&Review]) -> PeriodStats {
    let review_count = reviews.len() as i64;
    if review_count == 0 {
        return PeriodStats {
            review_count: 0,
            average_rating: 0.0,
            reply_rate: 0.0,
            rating_distribution: (1..=5)
                .map(|stars| RatingBucket {
                    stars,
                    count: 0,
                    percentage: 0.0,
                })
                .collect(),
        };
    }

    let sum: i64 = reviews.iter().map(|r| i64::from(r.star_rating)).sum();
    let average_rating = sum as f64 / review_count as f64;
    let replied = reviews.iter().filter(|r| r.has_developer_reply).count() as i64;
    let reply_rate = (replied as f64 / review_count as f64) * 100.0;

    let mut counts = [0i64; 6];
    for review in reviews {
        let stars = review.star_rating.clamp(1, 5) as usize;
        counts[stars] += 1;
    }

    let rating_distribution = (1..=5)
        .map(|stars| {
            let count = counts[stars as usize];
            RatingBucket {
                stars,
                count,
                percentage: (count as f64 / review_count as f64) * 100.0,
            }
        })
        .collect();

    PeriodStats {
        review_count,
        average_rating,
        reply_rate,
        rating_distribution,
    }
}

fn to_daily_period_stats(day: String, stats: PeriodStats) -> DailyPeriodStats {
    DailyPeriodStats {
        day,
        review_count: stats.review_count,
        average_rating: stats.average_rating,
        reply_rate: stats.reply_rate,
        rating_distribution: stats.rating_distribution,
    }
}

fn daily_breakdown(reviews: &[&Review]) -> Vec<DailyPeriodStats> {
    let mut by_day: HashMap<String, Vec<&Review>> = HashMap::new();
    for review in reviews {
        let key = day_key_vn(review.last_modified_at);
        by_day.entry(key).or_default().push(*review);
    }

    let today_vn = Utc::now().with_timezone(&vietnam_tz()).date_naive();
    let start_day = today_vn - Duration::days(RECENT_WINDOW_DAYS - 1);
    let mut filled = Vec::with_capacity(RECENT_WINDOW_DAYS as usize);
    let mut cursor: NaiveDate = start_day;
    while cursor <= today_vn {
        let key = cursor.format("%Y-%m-%d").to_string();
        let day_reviews = by_day.remove(&key).unwrap_or_default();
        filled.push(to_daily_period_stats(key, period_stats(&day_reviews)));
        cursor += Duration::days(1);
    }
    filled
}

fn daily_trend(reviews: &[&Review]) -> Vec<DailyTrendPoint> {
    daily_breakdown(reviews)
        .into_iter()
        .map(|day| DailyTrendPoint {
            day: day.day,
            count: day.review_count,
            average_rating: day.average_rating,
        })
        .collect()
}

fn top_versions(reviews: &[&Review]) -> Vec<VersionStats> {
    let mut by_version: HashMap<String, (i64, i64)> = HashMap::new();
    for review in reviews {
        let Some(name) = review
            .app_version_name
            .as_ref()
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
        else {
            continue;
        };
        let entry = by_version.entry(name.to_string()).or_insert((0, 0));
        entry.0 += 1;
        entry.1 += i64::from(review.star_rating);
    }

    let mut versions: Vec<VersionStats> = by_version
        .into_iter()
        .map(|(version_name, (count, sum))| VersionStats {
            version_name,
            count,
            average_rating: if count > 0 {
                sum as f64 / count as f64
            } else {
                0.0
            },
        })
        .collect();
    versions.sort_by(|a, b| b.count.cmp(&a.count).then_with(|| a.version_name.cmp(&b.version_name)));
    versions.truncate(8);
    versions
}
