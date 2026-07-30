import { fetchRecentReviews } from "./play-client";
import {
  clearCustomServiceAccount,
  getServiceAccountLabel,
  loadCustomServiceAccount,
  parseServiceAccountJson,
  saveCustomServiceAccount,
  type ServiceAccountCredentials,
} from "./service-account-store";
import { buildStats, listReviewsFromData } from "./stats-builder";
import type {
  AppSettings,
  Review,
  ReviewFilters,
  ReviewsPage,
  ReviewSortField,
  SortOrder,
  StatsOverview,
} from "./types";

const API_BASE = import.meta.env.VITE_API_BASE_URL ? String(import.meta.env.VITE_API_BASE_URL) : "";
const SNAPSHOT_BASE = (import.meta.env.BASE_URL || "/").replace(/\/?$/, "/");

function withApiBase(path: string): string {
  return `${API_BASE}${path}`;
}

function snapshotUrl(filename: string): string {
  return `${SNAPSHOT_BASE}snapshots/${filename}`;
}

async function expectJson<T>(res: Response): Promise<T> {
  const contentType = res.headers.get("content-type") ?? "";
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(body || `Request failed: ${res.status}`);
  }
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Error(`Unexpected response content-type: ${contentType}`);
  }
  return (await res.json()) as T;
}

let statsSnapshotPromise: Promise<StatsOverview> | null = null;
let reviewsSnapshotPromise: Promise<Review[]> | null = null;
let settingsSnapshotPromise: Promise<AppSettings> | null = null;
let liveReviewsCache: Review[] | null = null;
let liveReviewsPromise: Promise<Review[]> | null = null;

async function fetchSnapshot<T>(filename: string): Promise<T> {
  const res = await fetch(snapshotUrl(filename), { cache: "no-store" });
  return expectJson<T>(res);
}

function getStatsSnapshot(): Promise<StatsOverview> {
  statsSnapshotPromise ??= fetchSnapshot<StatsOverview>("stats.json");
  return statsSnapshotPromise;
}

function getReviewsSnapshot(): Promise<Review[]> {
  reviewsSnapshotPromise ??= fetchSnapshot<Review[]>("reviews.json");
  return reviewsSnapshotPromise;
}

function getSettingsSnapshot(): Promise<AppSettings> {
  settingsSnapshotPromise ??= fetchSnapshot<AppSettings>("settings.json");
  return settingsSnapshotPromise;
}

function hasCustomServiceAccount(): boolean {
  return loadCustomServiceAccount() != null;
}

async function getLiveReviews(force = false): Promise<Review[]> {
  const credentials = loadCustomServiceAccount();
  if (!credentials) {
    throw new Error("Chưa cấu hình Service Account custom.");
  }
  if (!force && liveReviewsCache) {
    return liveReviewsCache;
  }
  if (!force && liveReviewsPromise) {
    return liveReviewsPromise;
  }

  liveReviewsPromise = fetchRecentReviews(credentials)
    .then((reviews) => {
      liveReviewsCache = reviews;
      return reviews;
    })
    .finally(() => {
      liveReviewsPromise = null;
    });

  return liveReviewsPromise;
}

export function invalidateDataCache(): void {
  statsSnapshotPromise = null;
  reviewsSnapshotPromise = null;
  settingsSnapshotPromise = null;
  liveReviewsCache = null;
  liveReviewsPromise = null;
}

function normalizeSortOrder(sortOrder?: SortOrder): SortOrder {
  return sortOrder === "asc" ? "asc" : "desc";
}

function normalizeSortField(sortBy?: ReviewSortField): ReviewSortField {
  return sortBy === "starRating" ? "starRating" : "lastModifiedAt";
}

function filterAndPaginateReviews(reviews: Review[], filters: ReviewFilters): ReviewsPage {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(200, Math.max(1, filters.pageSize ?? 50));
  const search = filters.search?.trim().toLowerCase();
  const sortBy = normalizeSortField(filters.sortBy);
  const sortOrder = normalizeSortOrder(filters.sortOrder);

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

export async function getStats(): Promise<StatsOverview> {
  if (API_BASE) {
    const res = await fetch(withApiBase("/api/stats"));
    return expectJson<StatsOverview>(res);
  }
  if (hasCustomServiceAccount()) {
    const reviews = await getLiveReviews();
    return buildStats(reviews);
  }
  return getStatsSnapshot();
}

export async function listReviews(filters: ReviewFilters): Promise<ReviewsPage> {
  if (API_BASE) {
    const params = new URLSearchParams();

    if (filters.page !== undefined) params.set("page", String(filters.page));
    if (filters.pageSize !== undefined) params.set("pageSize", String(filters.pageSize));
    if (filters.search) params.set("search", filters.search);
    if (filters.minRating !== undefined) params.set("minRating", String(filters.minRating));
    if (filters.maxRating !== undefined) params.set("maxRating", String(filters.maxRating));
    if (filters.versionName) params.set("versionName", filters.versionName);
    if (filters.sortBy) params.set("sortBy", filters.sortBy);
    if (filters.sortOrder) params.set("sortOrder", filters.sortOrder);

    const res = await fetch(withApiBase(`/api/reviews?${params.toString()}`));
    return expectJson<ReviewsPage>(res);
  }

  if (hasCustomServiceAccount()) {
    const reviews = await getLiveReviews();
    return listReviewsFromData(reviews, filters);
  }

  const reviews = await getReviewsSnapshot();
  return filterAndPaginateReviews(reviews, filters);
}

export async function getSettings(): Promise<AppSettings> {
  if (API_BASE) {
    const res = await fetch(withApiBase("/api/settings"));
    return expectJson<AppSettings>(res);
  }

  const snapshot = await getSettingsSnapshot();
  return {
    ...snapshot,
    serviceAccountPath: getServiceAccountLabel(),
  };
}

export async function setServiceAccountJson(
  credentials: ServiceAccountCredentials | null,
): Promise<void> {
  invalidateDataCache();
  if (credentials) {
    saveCustomServiceAccount(credentials);
    return;
  }
  clearCustomServiceAccount();
}

export async function setServiceAccountFromRawJson(raw: string): Promise<void> {
  await setServiceAccountJson(parseServiceAccountJson(raw));
}

export async function refreshLiveData(): Promise<void> {
  if (!hasCustomServiceAccount()) {
    invalidateDataCache();
    return;
  }
  invalidateDataCache();
  await getLiveReviews(true);
}
