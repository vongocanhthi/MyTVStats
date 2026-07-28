export interface Review {
  reviewId: string;
  authorName?: string | null;
  starRating: number;
  text?: string | null;
  originalText?: string | null;
  reviewerLanguage?: string | null;
  device?: string | null;
  appVersionCode?: number | null;
  appVersionName?: string | null;
  androidOsVersion?: number | null;
  manufacturer?: string | null;
  deviceClass?: string | null;
  thumbsUp: number;
  thumbsDown: number;
  hasDeveloperReply: boolean;
  developerReply?: string | null;
  submittedAt?: number | null;
  lastModifiedAt: number;
  source: string;
}

export interface RatingBucket {
  stars: number;
  count: number;
  percentage: number;
}

export interface DailyTrendPoint {
  day: string;
  count: number;
  averageRating: number;
}

export interface MonthlyTrendPoint {
  month: string;
  count: number;
  averageRating: number;
}

export interface VersionStats {
  versionName: string;
  count: number;
  averageRating: number;
}

export interface PeriodStats {
  reviewCount: number;
  averageRating: number;
  replyRate: number;
  ratingDistribution: RatingBucket[];
}

export type DataScope = "recent_only";

export interface StatsOverview {
  dataScope: DataScope;
  csvReviewCount: number;
  apiReviewCount: number;
  totalReviews: number;
  averageRating: number;
  ratingDistribution: RatingBucket[];
  reviewsLast7Days: number;
  replyRate: number;
  today: PeriodStats;
  last7Days: PeriodStats;
  dailyTrend: DailyTrendPoint[];
  monthlyTrend: MonthlyTrendPoint[];
  topVersions: VersionStats[];
  lastSyncAt?: number | null;
}

export interface ReviewsPage {
  items: Review[];
  total: number;
  page: number;
  pageSize: number;
}

export type ReviewSortField = "starRating" | "lastModifiedAt";
export type SortOrder = "asc" | "desc";

export interface ReviewFilters {
  page?: number;
  pageSize?: number;
  search?: string;
  minRating?: number;
  maxRating?: number;
  versionName?: string;
  sortBy?: ReviewSortField;
  sortOrder?: SortOrder;
}

export interface AppSettings {
  serviceAccountPath?: string | null;
  packageName: string;
}

export type TabId = "dashboard" | "reviews" | "settings";
