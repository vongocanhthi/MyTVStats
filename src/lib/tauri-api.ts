import { invoke } from "@tauri-apps/api/core";
import type {
  AppSettings,
  DeepSeekGenerateResult,
  DeepSeekSettings,
  ReviewFilters,
  ReviewsPage,
  ScheduleSettings,
  StatsOverview,
} from "./types";

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

export function setServiceAccountFromRawJson(raw: string): Promise<AppSettings> {
  return invoke<AppSettings>("set_service_account_json", { raw });
}

export function setServiceAccountJson(
  credentials: { client_email: string; private_key: string } | null,
): Promise<AppSettings> {
  if (!credentials) {
    return invoke<AppSettings>("set_service_account_json", { raw: null });
  }
  return invoke<AppSettings>("set_service_account_json", {
    raw: JSON.stringify(credentials),
  });
}

export function getScheduleSettings(): Promise<ScheduleSettings> {
  return invoke<ScheduleSettings>("get_schedule_settings");
}

export function setScheduleSettings(settings: ScheduleSettings): Promise<ScheduleSettings> {
  return invoke<ScheduleSettings>("set_schedule_settings", { settings });
}

export function runDailyReportNow(): Promise<ScheduleSettings> {
  return invoke<ScheduleSettings>("run_daily_report_now");
}

export function sendReportNow(
  day: string,
  subject?: string | null,
  body?: string | null,
): Promise<ScheduleSettings> {
  return invoke<ScheduleSettings>("send_report_now", {
    day,
    subject: subject?.trim() ? subject.trim() : null,
    body: body?.trim() ? body.trim() : null,
  });
}

export function setAutostartEnabled(enabled: boolean): Promise<ScheduleSettings> {
  return invoke<ScheduleSettings>("set_autostart_enabled", { enabled });
}

export function getDeepSeekSettings(): Promise<DeepSeekSettings> {
  return invoke<DeepSeekSettings>("get_deepseek_settings");
}

export function setDeepSeekSettings(settings: DeepSeekSettings): Promise<DeepSeekSettings> {
  return invoke<DeepSeekSettings>("set_deepseek_settings", { settings });
}

export function generateDeepSeekReport(
  day: string,
  sourceReport: string,
): Promise<DeepSeekGenerateResult> {
  return invoke<DeepSeekGenerateResult>("generate_deepseek_report", {
    day,
    sourceReport,
  });
}

export function saveDeepSeekReportText(day: string, text: string): Promise<DeepSeekSettings> {
  return invoke<DeepSeekSettings>("save_deepseek_report_text", { day, text });
}
