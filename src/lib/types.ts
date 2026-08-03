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

export interface DailyPeriodStats extends PeriodStats {
  day: string;
}

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
  dailyBreakdown: DailyPeriodStats[];
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

export type ScheduleRunStatus = "success" | "failed" | "skipped";

/** Ngày review dùng cho báo cáo tự động. Mặc định hôm qua. */
export type ReportDayTarget = "yesterday" | "today";

export interface ScheduleSettings {
  enabled: boolean;
  hour: number;
  minute: number;
  recipient: string;
  cc?: string | null;
  bcc?: string | null;
  smtpEmail?: string | null;
  smtpAppPassword?: string | null;
  autostartEnabled: boolean;
  startMinimized: boolean;
  reportDayTarget?: ReportDayTarget;
  lastRunDay?: string | null;
  lastRunAt?: number | null;
  lastRunStatus?: ScheduleRunStatus | null;
  lastRunError?: string | null;
  /** Deprecated: env overrides đã tắt; luôn rỗng. */
  envOverrides?: string[];
}

export interface DeepSeekSettings {
  apiKey?: string | null;
  prompt: string;
  lastReportDay?: string | null;
  lastReportText?: string | null;
}

export interface DeepSeekGenerateResult {
  day: string;
  text: string;
  settings: DeepSeekSettings;
}

export type TabId = "dashboard" | "reviews" | "report" | "settings";
