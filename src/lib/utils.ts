import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("vi-VN").format(value);
}

export function formatRating(value: number): string {
  return value.toFixed(2);
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function formatDate(timestamp?: number | null): string {
  if (!timestamp) return "—";
  // Unix seconds → luôn hiển thị theo giờ Việt Nam (UTC+7).
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp * 1000));
}

export function formatDateMs(timestampMs?: number | null): string {
  if (!timestampMs) return "—";
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestampMs));
}

/** Play API `androidOsVersion` is the Android API level (e.g. 34). */
const ANDROID_API_NAMES: Record<number, string> = {
  21: "5.0",
  22: "5.1",
  23: "6.0",
  24: "7.0",
  25: "7.1",
  26: "8.0",
  27: "8.1",
  28: "9",
  29: "10",
  30: "11",
  31: "12",
  32: "12L",
  33: "13",
  34: "14",
  35: "15",
  36: "16",
};

export function formatApiLevel(apiLevel?: number | null): string {
  if (apiLevel == null) return "—";
  const name = ANDROID_API_NAMES[apiLevel];
  return name ? `API ${apiLevel} · Android ${name}` : `API ${apiLevel}`;
}

/** YYYY-MM-DD theo giờ Việt Nam — dùng tô màu nhóm dòng theo ngày. */
export function dayKeyVn(timestamp?: number | null): string {
  if (!timestamp) return "unknown";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(timestamp * 1000));
}

const DAY_ROW_TONES = [
  "bg-sky-500/10 hover:bg-sky-500/15",
  "bg-violet-500/10 hover:bg-violet-500/15",
  "bg-emerald-500/10 hover:bg-emerald-500/15",
  "bg-amber-500/10 hover:bg-amber-500/15",
  "bg-rose-500/10 hover:bg-rose-500/15",
  "bg-cyan-500/10 hover:bg-cyan-500/15",
  "bg-fuchsia-500/10 hover:bg-fuchsia-500/15",
] as const;

export function dayRowToneClass(dayIndex: number): string {
  return DAY_ROW_TONES[((dayIndex % DAY_ROW_TONES.length) + DAY_ROW_TONES.length) % DAY_ROW_TONES.length];
}

export function starsLabel(stars: number): string {
  return "★".repeat(stars) + "☆".repeat(5 - stars);
}
