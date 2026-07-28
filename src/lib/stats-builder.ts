import { RECENT_WINDOW_DAYS } from "./play-client";
import type {
  DailyPeriodStats,
  DailyTrendPoint,
  PeriodStats,
  RatingBucket,
  Review,
  ReviewFilters,
  ReviewsPage,
  StatsOverview,
  VersionStats,
} from "./types";

function dayKeyVn(timestamp: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(timestamp * 1000));
}

function todayKeyVn(): string {
  return dayKeyVn(Math.floor(Date.now() / 1000));
}

function todayStartUtc(): number {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / 1000;
}

function periodStats(reviews: Review[]): PeriodStats {
  const reviewCount = reviews.length;
  if (reviewCount === 0) {
    return {
      reviewCount: 0,
      averageRating: 0,
      replyRate: 0,
      ratingDistribution: [1, 2, 3, 4, 5].map((stars) => ({
        stars,
        count: 0,
        percentage: 0,
      })),
    };
  }

  const sum = reviews.reduce((acc, review) => acc + review.starRating, 0);
  const replied = reviews.filter((review) => review.hasDeveloperReply).length;
  const counts = [0, 0, 0, 0, 0, 0];
  for (const review of reviews) {
    const stars = Math.min(5, Math.max(1, review.starRating));
    counts[stars] += 1;
  }

  const ratingDistribution: RatingBucket[] = [1, 2, 3, 4, 5].map((stars) => ({
    stars,
    count: counts[stars],
    percentage: (counts[stars] / reviewCount) * 100,
  }));

  return {
    reviewCount,
    averageRating: sum / reviewCount,
    replyRate: (replied / reviewCount) * 100,
    ratingDistribution,
  };
}

function dailyBreakdown(reviews: Review[]): DailyPeriodStats[] {
  const byDay = new Map<string, Review[]>();
  for (const review of reviews) {
    const key = dayKeyVn(review.lastModifiedAt);
    const list = byDay.get(key) ?? [];
    list.push(review);
    byDay.set(key, list);
  }

  const todayKey = todayKeyVn();
  const todayDate = new Date(`${todayKey}T00:00:00+07:00`);
  const filled: DailyPeriodStats[] = [];
  for (let i = RECENT_WINDOW_DAYS - 1; i >= 0; i -= 1) {
    const dayDate = new Date(todayDate.getTime() - i * 24 * 60 * 60 * 1000);
    const key = dayKeyVn(Math.floor(dayDate.getTime() / 1000));
    const dayReviews = byDay.get(key) ?? [];
    const stats = periodStats(dayReviews);
    filled.push({
      day: key,
      ...stats,
    });
  }
  return filled;
}

function dailyTrend(breakdown: DailyPeriodStats[]): DailyTrendPoint[] {
  return breakdown.map((day) => ({
    day: day.day,
    count: day.reviewCount,
    averageRating: day.averageRating,
  }));
}

function topVersions(reviews: Review[]): VersionStats[] {
  const byVersion = new Map<string, { count: number; sum: number }>();
  for (const review of reviews) {
    const name = review.appVersionName?.trim();
    if (!name) continue;
    const entry = byVersion.get(name) ?? { count: 0, sum: 0 };
    entry.count += 1;
    entry.sum += review.starRating;
    byVersion.set(name, entry);
  }

  return [...byVersion.entries()]
    .map(([versionName, { count, sum }]) => ({
      versionName,
      count,
      averageRating: count > 0 ? sum / count : 0,
    }))
    .sort((a, b) => b.count - a.count || a.versionName.localeCompare(b.versionName))
    .slice(0, 8);
}

export function buildStats(reviews: Review[]): StatsOverview {
  const windowStart = Math.floor(Date.now() / 1000) - RECENT_WINDOW_DAYS * 24 * 60 * 60;
  const inWindow = reviews.filter((review) => review.lastModifiedAt >= windowStart);
  const todayStart = todayStartUtc();
  const todayReviews = inWindow.filter((review) => review.lastModifiedAt >= todayStart);
  const last7Days = periodStats(inWindow);
  const breakdown = dailyBreakdown(inWindow);

  return {
    dataScope: "recent_only",
    csvReviewCount: 0,
    apiReviewCount: inWindow.length,
    totalReviews: last7Days.reviewCount,
    averageRating: last7Days.averageRating,
    ratingDistribution: last7Days.ratingDistribution,
    reviewsLast7Days: last7Days.reviewCount,
    replyRate: last7Days.replyRate,
    today: periodStats(todayReviews),
    last7Days,
    dailyTrend: dailyTrend(breakdown),
    dailyBreakdown: breakdown,
    monthlyTrend: [],
    topVersions: topVersions(inWindow),
    lastSyncAt: Math.floor(Date.now() / 1000),
  };
}

export function listReviewsFromData(reviews: Review[], filters: ReviewFilters): ReviewsPage {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(200, Math.max(1, filters.pageSize ?? 50));
  const search = filters.search?.trim().toLowerCase();
  const sortBy = filters.sortBy === "starRating" ? "starRating" : "lastModifiedAt";
  const sortOrder = filters.sortOrder === "asc" ? "asc" : "desc";

  let filtered = reviews.filter((review) => {
    if (filters.minRating != null && review.starRating < filters.minRating) return false;
    if (filters.maxRating != null && review.starRating > filters.maxRating) return false;
    if (filters.versionName?.trim() && review.appVersionName !== filters.versionName.trim()) {
      return false;
    }
    if (search) {
      const hay = `${review.text ?? ""} ${review.authorName ?? ""} ${review.reviewId}`.toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });

  filtered = [...filtered].sort((a, b) => {
    const primary =
      sortBy === "starRating" ? a.starRating - b.starRating : a.lastModifiedAt - b.lastModifiedAt;
    const ordered = sortOrder === "asc" ? primary : -primary;
    return ordered || a.reviewId.localeCompare(b.reviewId);
  });

  const total = filtered.length;
  const start = (page - 1) * pageSize;
  return {
    items: filtered.slice(start, start + pageSize),
    total,
    page,
    pageSize,
  };
}
