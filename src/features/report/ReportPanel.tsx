import { useQuery } from "@tanstack/react-query";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Check, Copy, FileText, Mail, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getStats, listReviews } from "../../lib/api";
import {
  buildDailyReportText,
  buildGmailComposeUrl,
  filterReviewsByDay,
  formatDayLabelVn,
  formatDayShortVn,
  resolveDailyBreakdown,
  todayDayKeyVn,
  toPeriodStats,
} from "../../lib/report";
import { isTauriRuntime } from "../../lib/runtime";
import type { DailyPeriodStats, Review } from "../../lib/types";

async function fetchAllRecentReviews(): Promise<Review[]> {
  const all: Review[] = [];
  let page = 1;

  for (;;) {
    const result = await listReviews({
      page,
      pageSize: 200,
      sortBy: "lastModifiedAt",
      sortOrder: "desc",
    });
    all.push(...result.items);
    if (all.length >= result.total || result.items.length === 0) break;
    page += 1;
    if (page > 50) break;
  }

  return all;
}

export function ReportPanel() {
  const {
    data,
    isLoading,
    error,
    isFetching: statsFetching,
    refetch: refetchStats,
  } = useQuery({
    queryKey: ["stats"],
    queryFn: getStats,
  });

  const {
    data: allReviews = [],
    isFetching: reviewsFetching,
    refetch: refetchReviews,
    error: reviewsError,
  } = useQuery({
    queryKey: ["reviews", "report-all"],
    queryFn: fetchAllRecentReviews,
  });

  useEffect(() => {
    void refetchStats();
    void refetchReviews();
  }, [refetchStats, refetchReviews]);

  const days = useMemo(() => resolveDailyBreakdown(data), [data]);

  const defaultDay = useMemo(() => {
    const today = todayDayKeyVn();
    if (days.some((d) => d.day === today)) return today;
    return days.length > 0 ? days[days.length - 1].day : today;
  }, [days]);

  const [selectedDay, setSelectedDay] = useState(defaultDay);
  const [reportText, setReportText] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setSelectedDay(defaultDay);
  }, [defaultDay]);

  const selectedStats: DailyPeriodStats | undefined = useMemo(
    () => days.find((d) => d.day === selectedDay) ?? days[days.length - 1],
    [days, selectedDay],
  );

  const dayReviews = useMemo(() => {
    if (!selectedStats) return [];
    return filterReviewsByDay(allReviews, selectedStats.day);
  }, [allReviews, selectedStats]);

  useEffect(() => {
    if (!selectedStats) {
      setReportText("");
      return;
    }
    setReportText(
      buildDailyReportText(selectedStats.day, toPeriodStats(selectedStats), allReviews),
    );
  }, [selectedStats, allReviews]);

  const isFetching = statsFetching || reviewsFetching;

  async function handleRefresh() {
    await Promise.all([refetchStats(), refetchReviews()]);
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(reportText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  function handleRegenerate() {
    if (!selectedStats) return;
    setReportText(
      buildDailyReportText(selectedStats.day, toPeriodStats(selectedStats), allReviews),
    );
  }

  async function handleOpenGmail() {
    if (!selectedStats) return;
    const url = buildGmailComposeUrl(selectedStats.day, reportText);
    try {
      if (isTauriRuntime()) {
        await openUrl(url);
      } else {
        window.open(url, "_blank", "noopener,noreferrer");
      }
    } catch {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }

  if (isLoading && !data) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-slate-300">
        Đang tải dữ liệu báo cáo...
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-8 text-red-200">
        Không thể tải thống kê: {String(error)}
        {reviewsError ? (
          <p className="mt-2 text-sm text-red-300/80">
            Reviews: {String(reviewsError)}
          </p>
        ) : null}
      </div>
    );
  }

  if (!data || !selectedStats) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-dashed border-white/15 bg-white/5 p-10 text-center text-slate-400">
          Chưa có dữ liệu thống kê. Hãy Sync trên Dashboard rồi bấm Làm mới data.
        </div>
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => {
              void handleRefresh();
            }}
            disabled={isFetching}
            className="inline-flex items-center gap-2 rounded-xl bg-sky-500 px-4 py-2 text-sm font-medium text-white hover:bg-sky-400 disabled:opacity-50"
          >
            <RefreshCw size={16} className={isFetching ? "animate-spin" : ""} />
            Làm mới data
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-medium text-white">
              <FileText size={18} />
              Báo cáo theo ngày
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              Chọn ngày trong 7 ngày gần nhất (giờ VN). Báo cáo gồm thống kê + chi tiết từng review.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              void handleRefresh();
            }}
            disabled={isFetching}
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-sm text-slate-200 hover:bg-white/5 disabled:opacity-50"
          >
            <RefreshCw size={16} className={isFetching ? "animate-spin" : ""} />
            Làm mới data
          </button>
        </div>

        <label className="mt-5 block text-sm text-slate-300">
          Ngày báo cáo
          <select
            value={selectedStats.day}
            onChange={(event) => setSelectedDay(event.target.value)}
            className="mt-1.5 w-full max-w-md rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2.5 text-sm text-white outline-none ring-sky-500/30 focus:ring-2"
          >
            {[...days].reverse().map((day) => (
              <option key={day.day} value={day.day}>
                {formatDayLabelVn(day.day)}
                {day.reviewCount > 0 ? ` · ${day.reviewCount} reviews` : " · không có review"}
              </option>
            ))}
          </select>
        </label>
        <p className="mt-2 text-xs text-slate-500">
          Đã nạp {dayReviews.length} review cho ngày {formatDayShortVn(selectedStats.day)}
          {reviewsFetching ? " · đang tải..." : ""}.
        </p>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-medium text-white">Nội dung gửi</h3>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleRegenerate}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-sm text-slate-200 hover:bg-white/5"
            >
              <RefreshCw size={14} />
              Tạo lại
            </button>
            <button
              type="button"
              onClick={() => {
                void handleCopy();
              }}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-sm text-slate-200 hover:bg-white/5"
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? "Đã sao chép" : "Sao chép"}
            </button>
            <button
              type="button"
              onClick={() => {
                void handleOpenGmail();
              }}
              className="inline-flex items-center gap-2 rounded-xl bg-sky-500 px-3 py-2 text-sm font-medium text-white hover:bg-sky-400"
            >
              <Mail size={14} />
              Gửi Gmail
            </button>
          </div>
        </div>
        <textarea
          value={reportText}
          onChange={(event) => setReportText(event.target.value)}
          rows={18}
          className="w-full min-w-0 resize-y rounded-xl border border-white/10 bg-slate-950/60 px-3 py-3 font-mono text-sm leading-relaxed text-slate-100 outline-none ring-sky-500/30 focus:ring-2"
          spellCheck={false}
        />
        <p className="mt-2 text-xs text-slate-500">
          Báo cáo gồm thống kê + danh sách review trong ngày (sao thấp xếp trước). Có thể sửa tay rồi
          Sao chép hoặc Gửi Gmail. Nếu nội dung quá dài, Gmail có thể cắt — dùng Sao chép an toàn hơn.
        </p>
      </section>
    </div>
  );
}
