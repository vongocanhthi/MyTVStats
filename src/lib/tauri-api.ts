import { invoke } from "@tauri-apps/api/core";
import type { AppSettings, ReviewFilters, ReviewsPage, StatsOverview } from "./types";

export function getStats(): Promise<StatsOverview> {
  return invoke<StatsOverview>("get_stats");
}

export function listReviews(filters: ReviewFilters): Promise<ReviewsPage> {
  return invoke<ReviewsPage>("list_reviews", {
    filters: {
      page: filters.page,
      page_size: filters.pageSize,
      search: filters.search,
      min_rating: filters.minRating,
      max_rating: filters.maxRating,
      version_name: filters.versionName,
      sort_by: filters.sortBy,
      sort_order: filters.sortOrder,
    },
  });
}

export function getSettings(): Promise<AppSettings> {
  return invoke<AppSettings>("get_settings");
}

export function setServiceAccountPath(path?: string | null): Promise<AppSettings> {
  return invoke<AppSettings>("set_service_account_path", {
    path: path?.trim() ? path : null,
  });
}
