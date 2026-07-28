import { RECENT_WINDOW_DAYS } from "./play";
import type {
  DailyTrendPoint,
  PeriodStats,
  RatingBucket,
  Review,
  ReviewFilters,
  ReviewsPage,
  StatsOverview,
  VersionStats,
} from "./types";

function utcDayKey(timestamp: number): string {
  return new Date(timestamp * 1000).toISOString().slice(0, 10);
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

  const sum = reviews.reduce((acc, r) => acc + r.starRating, 0);
  const replied = reviews.filter((r) => r.hasDeveloperReply).length;
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

function dailyTrend(reviews: Review[]): DailyTrendPoint[] {
  const byDay = new Map<string, { count: number; sum: number }>();
  for (const review of reviews) {
    const key = utcDayKey(review.lastModifiedAt);
    const entry = byDay.get(key) ?? { count: 0, sum: 0 };
    entry.count += 1;
    entry.sum += review.starRating;
    byDay.set(key, entry);
  }

  const today = new Date();
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const filled: DailyTrendPoint[] = [];
  for (let i = RECENT_WINDOW_DAYS - 1; i >= 0; i -= 1) {
    const dayMs = todayUtc - i * 24 * 60 * 60 * 1000;
    const key = new Date(dayMs).toISOString().slice(0, 10);
    const entry = byDay.get(key);
    filled.push({
      day: key,
      count: entry?.count ?? 0,
      averageRating: entry && entry.count > 0 ? entry.sum / entry.count : 0,
    });
  }
  return filled;
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
  const inWindow = reviews.filter((r) => r.lastModifiedAt >= windowStart);
  const todayStart = todayStartUtc();
  const todayReviews = inWindow.filter((r) => r.lastModifiedAt >= todayStart);
  const last7Days = periodStats(inWindow);

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
    dailyTrend: dailyTrend(inWindow),
    monthlyTrend: [],
    topVersions: topVersions(inWindow),
    lastSyncAt: Math.floor(Date.now() / 1000),
  };
}

export function listReviews(reviews: Review[], filters: ReviewFilters): ReviewsPage {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(200, Math.max(1, filters.pageSize ?? 50));
  const search = filters.search?.trim().toLowerCase();

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

  const ascending = filters.sortOrder === "asc" || filters.sortOrder === "ASC";
  const sortBy = filters.sortBy ?? "lastModifiedAt";
  filtered = [...filtered].sort((a, b) => {
    const primary =
      sortBy === "starRating" || sortBy === "star_rating"
        ? a.starRating - b.starRating
        : a.lastModifiedAt - b.lastModifiedAt;
    const ordered = ascending ? primary : -primary;
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
