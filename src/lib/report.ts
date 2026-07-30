import type { DailyPeriodStats, PeriodStats, Review, StatsOverview } from "./types";
import { dayKeyVn, formatDate, formatNumber, formatPercent, formatRating } from "./utils";

export function toPeriodStats(day: DailyPeriodStats): PeriodStats {
  return {
    reviewCount: day.reviewCount,
    averageRating: day.averageRating,
    replyRate: day.replyRate,
    ratingDistribution: day.ratingDistribution?.length
      ? day.ratingDistribution
      : emptyDistribution(),
  };
}

function emptyDistribution(): PeriodStats["ratingDistribution"] {
  return [1, 2, 3, 4, 5].map((stars) => ({
    stars,
    count: 0,
    percentage: 0,
  }));
}

export function todayDayKeyVn(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Ngày hôm qua theo Asia/Ho_Chi_Minh (YYYY-MM-DD). */
export function yesterdayDayKeyVn(): string {
  const today = todayDayKeyVn();
  const [year, month, day] = today.split("-").map((part) => Number.parseInt(part, 10));
  const utcMidnight = Date.UTC(year, month - 1, day) - 24 * 60 * 60 * 1000;
  const date = new Date(utcMidnight);
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Đảm bảo luôn có dailyBreakdown để tab Báo cáo không trống khi API/cache cũ. */
export function resolveDailyBreakdown(data: StatsOverview | undefined): DailyPeriodStats[] {
  if (!data) return [];
  if (data.dailyBreakdown?.length) return data.dailyBreakdown;

  const today = todayDayKeyVn();
  const fromTrend = (data.dailyTrend ?? []).map((point) => {
    if (point.day === today) {
      return { day: point.day, ...data.today };
    }
    return {
      day: point.day,
      reviewCount: point.count,
      averageRating: point.averageRating,
      replyRate: 0,
      ratingDistribution: emptyDistribution(),
    };
  });

  if (fromTrend.length > 0) return fromTrend;

  return [
    {
      day: today,
      ...data.today,
    },
  ];
}

export function formatDayLabelVn(dayKey: string): string {
  const [year, month, day] = dayKey.split("-").map(Number);
  if (!year || !month || !day) return dayKey;
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

export function formatDayShortVn(dayKey: string): string {
  const [year, month, day] = dayKey.split("-").map(Number);
  if (!year || !month || !day) return dayKey;
  return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;
}

export function filterReviewsByDay(reviews: Review[], dayKey: string): Review[] {
  return reviews
    .filter((review) => dayKeyVn(review.lastModifiedAt) === dayKey)
    .sort((a, b) => {
      const byStars = a.starRating - b.starRating;
      if (byStars !== 0) return byStars;
      return b.lastModifiedAt - a.lastModifiedAt;
    });
}

function starsText(stars: number): string {
  return `${"★".repeat(stars)}${"☆".repeat(Math.max(0, 5 - stars))}`;
}

function distributionFromReviews(reviews: Review[]): PeriodStats["ratingDistribution"] {
  const counts = [0, 0, 0, 0, 0, 0];
  for (const review of reviews) {
    const stars = Math.min(5, Math.max(1, Math.round(review.starRating)));
    counts[stars] += 1;
  }
  const total = reviews.length;
  return [1, 2, 3, 4, 5].map((stars) => ({
    stars,
    count: counts[stars],
    percentage: total > 0 ? (counts[stars] / total) * 100 : 0,
  }));
}

/** Ưu tiên phân bố từ reviews ngày; fallback sang stats API. */
export function resolveRatingDistribution(
  stats: PeriodStats,
  dayReviews: Review[],
): PeriodStats["ratingDistribution"] {
  if (dayReviews.length > 0) {
    return distributionFromReviews(dayReviews);
  }
  if (Array.isArray(stats.ratingDistribution) && stats.ratingDistribution.length > 0) {
    return stats.ratingDistribution.map((bucket) => ({
      stars: bucket.stars,
      count: bucket.count ?? 0,
      percentage: Number(bucket.percentage ?? 0),
    }));
  }
  return emptyDistribution();
}

function formatReviewForReport(review: Review, index: number): string {
  const author = review.authorName?.trim() || "Ẩn danh";
  const text = (review.text?.trim() || "(Không có nội dung)").replace(/\t/g, " — ");
  const lines = [
    `${index}. ${starsText(review.starRating)} — ${author}`,
    `   Thời gian: ${formatDate(review.lastModifiedAt)}`,
    `   Nội dung: ${text}`,
  ];
  if (review.hasDeveloperReply) {
    const reply = review.developerReply?.trim() || "(Không có nội dung phản hồi)";
    lines.push(`   Phản hồi: ${reply}`);
  } else {
    lines.push("   Phản hồi: Chưa phản hồi");
  }
  return lines.join("\n");
}

export function buildDailyReportText(
  dayKey: string,
  stats: PeriodStats,
  reviews: Review[] = [],
): string {
  const dateLabel = formatDayShortVn(dayKey);
  const dayReviews = filterReviewsByDay(reviews, dayKey);
  const reviewCount = dayReviews.length > 0 ? dayReviews.length : stats.reviewCount;
  const averageRating =
    dayReviews.length > 0
      ? dayReviews.reduce((sum, r) => sum + r.starRating, 0) / dayReviews.length
      : stats.averageRating;
  const replyRate =
    dayReviews.length > 0
      ? (dayReviews.filter((r) => r.hasDeveloperReply).length / dayReviews.length) * 100
      : stats.replyRate;
  const distribution = resolveRatingDistribution(stats, dayReviews);

  const lines = [
    `📋 Báo cáo MyTV Reviews — ${dateLabel}`,
    "",
    `• Tổng reviews: ${formatNumber(reviewCount)}`,
    `• Rating trung bình: ${formatRating(averageRating)}★`,
    `• Tỷ lệ đã phản hồi: ${formatPercent(replyRate)}`,
    "",
    "Phân bố sao:",
  ];

  for (const bucket of [...distribution].sort((a, b) => b.stars - a.stars)) {
    const pct = Number(bucket.percentage ?? 0);
    lines.push(`• ${bucket.stars}★: ${formatNumber(bucket.count)} (${pct.toFixed(1)}%)`);
  }

  lines.push("", `Chi tiết reviews (${formatNumber(dayReviews.length)}):`);
  if (dayReviews.length === 0) {
    lines.push("(Không có review trong ngày này)");
  } else {
    dayReviews.forEach((review, index) => {
      lines.push("", formatReviewForReport(review, index + 1));
    });
  }

  return lines.join("\n");
}

export function buildReportSubject(dayKey: string): string {
  return `Báo cáo MyTV Reviews — ${formatDayShortVn(dayKey)}`;
}

/** Mở Gmail compose với sẵn subject + body (user có thể chỉnh trước khi gửi). */
export function buildGmailComposeUrl(dayKey: string, body: string, subject?: string): string {
  const params = new URLSearchParams({
    view: "cm",
    fs: "1",
    su: subject?.trim() || buildReportSubject(dayKey),
    body,
  });
  return `https://mail.google.com/mail/?${params.toString()}`;
}
