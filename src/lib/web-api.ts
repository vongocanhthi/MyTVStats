import type { AppSettings, ReviewFilters, ReviewsPage, StatsOverview } from "./types";

const API_BASE = import.meta.env.VITE_API_BASE_URL ? String(import.meta.env.VITE_API_BASE_URL) : "";

function withApiBase(path: string): string {
  return API_BASE ? `${API_BASE}${path}` : path;
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

export async function getStats(): Promise<StatsOverview> {
  const res = await fetch(withApiBase("/api/stats"));
  return expectJson<StatsOverview>(res);
}

export async function listReviews(filters: ReviewFilters): Promise<ReviewsPage> {
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

export async function getSettings(): Promise<AppSettings> {
  const res = await fetch(withApiBase("/api/settings"));
  return expectJson<AppSettings>(res);
}
