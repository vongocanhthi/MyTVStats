import { useQuery } from "@tanstack/react-query";
import { Check, Copy, FileText, Mail, RefreshCw, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getScheduleSettings, getStats, listReviews, sendReportNow } from "../../lib/api";
import {
  buildDailyReportText,
  buildReportSubject,
  filterReviewsByDay,
  formatDayLabelVn,
  formatDayShortVn,
  resolveDailyBreakdown,
  todayDayKeyVn,
  toPeriodStats,
  yesterdayDayKeyVn,
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
  const isDesktop = isTauriRuntime();

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

  const scheduleQuery = useQuery({
    queryKey: ["schedule-settings"],
    queryFn: async () => {
      if (!getScheduleSettings) {
        throw new Error("Chưa có cấu hình gửi mail trên desktop.");
      }
      return getScheduleSettings();
    },
    enabled: isDesktop && !!getScheduleSettings,
  });

  useEffect(() => {
    void refetchStats();
    void refetchReviews();
  }, [refetchStats, refetchReviews]);

  const days = useMemo(() => resolveDailyBreakdown(data), [data]);

  const defaultDay = useMemo(() => {
    const yesterday = yesterdayDayKeyVn();
    const today = todayDayKeyVn();
    if (days.some((d) => d.day === yesterday)) return yesterday;
    if (days.some((d) => d.day === today)) return today;
    return days.length > 0 ? days[days.length - 1].day : yesterday;
  }, [days]);

  const [selectedDay, setSelectedDay] = useState(defaultDay);
  const [reportSubject, setReportSubject] = useState(() => buildReportSubject(defaultDay));
  const [reportText, setReportText] = useState("");
  const [copied, setCopied] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [sendMessage, setSendMessage] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

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
    setReportSubject(buildReportSubject(selectedStats.day));
    setReportText(
      buildDailyReportText(selectedStats.day, toPeriodStats(selectedStats), allReviews),
    );
  }, [selectedStats, allReviews]);

  const isFetching = statsFetching || reviewsFetching;
  const recipient = scheduleQuery.data?.recipient?.trim() || "";
  const cc = scheduleQuery.data?.cc?.trim() || "";
  const bcc = scheduleQuery.data?.bcc?.trim() || "";
  const smtpEmail = scheduleQuery.data?.smtpEmail?.trim() || "";

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

  function handleRequestSendNow() {
    setSendMessage(null);
    setSendError(null);
    if (!isDesktop || !sendReportNow) {
      setSendError("Gửi ngay chỉ khả dụng trên app desktop (Windows / macOS).");
      return;
    }
    if (!recipient) {
      setSendError("Chưa cấu hình email nhận báo cáo. Vào Cài đặt để điền.");
      return;
    }
    if (!smtpEmail) {
      setSendError("Chưa cấu hình Gmail gửi. Vào Cài đặt để điền.");
      return;
    }
    setConfirmOpen(true);
  }

  async function handleConfirmSendNow() {
    if (!selectedStats || !sendReportNow) return;
    if (!reportSubject.trim()) {
      setSendError("Tiêu đề không được để trống.");
      setConfirmOpen(false);
      return;
    }
    setIsSending(true);
    setSendError(null);
    setSendMessage(null);
    try {
      const result = await sendReportNow(selectedStats.day, reportSubject);
      setConfirmOpen(false);
      if (result.lastRunStatus === "success") {
        setSendMessage(
          `Đã gửi báo cáo ngày ${formatDayShortVn(selectedStats.day)} tới ${recipient}.`,
        );
      } else {
        setSendError(result.lastRunError ?? "Gửi mail thất bại.");
      }
    } catch (error) {
      setSendError(error instanceof Error ? error.message : String(error));
      setConfirmOpen(false);
    } finally {
      setIsSending(false);
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
          <p className="mt-2 text-sm text-red-300/80">Reviews: {String(reviewsError)}</p>
        ) : null}
      </div>
    );
  }

  if (!data || !selectedStats) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-dashed border-white/15 bg-white/5 p-10 text-center text-slate-400">
          Chưa có dữ liệu. Hãy upload Service Account trong Cài đặt rồi tải lại.
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
            Tải lại dữ liệu
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
              Chọn ngày trong 7 ngày gần nhất (giờ VN). Nút <strong className="text-slate-200">Gửi ngay</strong>{" "}
              gửi mail qua SMTP ngay, không chờ lịch hẹn.
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
            Tải lại dữ liệu
          </button>
        </div>

        <label className="mt-5 block text-sm text-slate-300">
          Ngày báo cáo
          <select
            value={selectedStats.day}
            onChange={(event) => setSelectedDay(event.target.value)}
            className="mt-1.5 w-full max-w-md rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2.5 text-sm text-white outline-none ring-sky-500/30 focus:ring-2"
          >
            {[...days].reverse().map((day) => {
              const today = todayDayKeyVn();
              const yesterday = yesterdayDayKeyVn();
              const suffix =
                day.day === yesterday
                  ? " · Hôm qua"
                  : day.day === today
                    ? " · Hôm nay"
                    : "";
              return (
                <option key={day.day} value={day.day}>
                  {formatDayLabelVn(day.day)}
                  {suffix}
                  {day.reviewCount > 0 ? ` · ${day.reviewCount} reviews` : " · không có review"}
                </option>
              );
            })}
          </select>
        </label>
        <p className="mt-2 text-xs text-slate-500">
          Đã nạp {dayReviews.length} review cho ngày {formatDayShortVn(selectedStats.day)}
          {reviewsFetching ? " · đang tải..." : ""}.
        </p>
      </section>

      {sendMessage ? (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
          {sendMessage}
        </div>
      ) : null}
      {sendError ? (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          {sendError}
        </div>
      ) : null}

      <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-medium text-white">Nội dung gửi</h3>
          <div className="flex flex-wrap gap-2">
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
              onClick={handleRequestSendNow}
              disabled={isSending}
              className="inline-flex items-center gap-2 rounded-xl bg-sky-500 px-3 py-2 text-sm font-medium text-white hover:bg-sky-400 disabled:opacity-50"
            >
              <Mail size={14} />
              Gửi ngay
            </button>
          </div>
        </div>
        <label className="mb-3 block text-sm text-slate-300">
          Tiêu đề
          <input
            type="text"
            value={reportSubject}
            onChange={(event) => setReportSubject(event.target.value)}
            className="mt-1.5 block w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2.5 text-sm text-white outline-none ring-sky-500/30 focus:ring-2"
            placeholder="Tiêu đề email báo cáo"
          />
        </label>
        <label className="mb-3 block text-sm text-slate-300">
          Nội dung
          <textarea
            value={reportText}
            onChange={(event) => setReportText(event.target.value)}
            rows={16}
            className="mt-1.5 w-full min-w-0 resize-y rounded-xl border border-white/10 bg-slate-950/60 px-3 py-3 font-mono text-sm leading-relaxed text-slate-100 outline-none ring-sky-500/30 focus:ring-2"
            spellCheck={false}
          />
        </label>
        <p className="mt-2 text-xs text-slate-500">
          Có thể sửa tiêu đề / nội dung rồi Sao chép.{" "}
          <strong className="text-slate-300">Gửi ngay</strong> dùng SMTP trong Cài đặt — gửi liền,
          không phụ thuộc giờ lịch.
        </p>
      </section>

      {confirmOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0b0f19]/80 px-4 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="send-now-title"
            className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-950 p-6 shadow-2xl shadow-black/40"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 id="send-now-title" className="text-lg font-medium text-white">
                  Xác nhận gửi ngay?
                </h3>
                <p className="mt-2 text-sm text-slate-400">
                  Gửi báo cáo ngày{" "}
                  <span className="font-medium text-slate-200">
                    {formatDayLabelVn(selectedStats.day)}
                  </span>{" "}
                  qua Gmail SMTP ngay bây giờ (không chờ lịch hẹn).
                </p>
              </div>
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                disabled={isSending}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-white/5 hover:text-white disabled:opacity-50"
                aria-label="Đóng"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-4 space-y-2 rounded-xl border border-white/10 bg-slate-900/60 px-4 py-3 text-sm text-slate-300">
              <p>
                <span className="text-slate-400">Từ:</span> {smtpEmail || "—"}
              </p>
              <p className="break-words">
                <span className="text-slate-400">To:</span> {recipient || "—"}
              </p>
              {cc ? (
                <p className="break-words">
                  <span className="text-slate-400">Cc:</span> {cc}
                </p>
              ) : null}
              {bcc ? (
                <p className="break-words">
                  <span className="text-slate-400">Bcc:</span> {bcc}
                </p>
              ) : null}
              <p>
                <span className="text-slate-400">Ngày:</span> {formatDayShortVn(selectedStats.day)}
              </p>
              <p className="break-words">
                <span className="text-slate-400">Tiêu đề:</span> {reportSubject.trim() || "—"}
              </p>
            </div>

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                disabled={isSending}
                className="rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-200 hover:bg-white/5 disabled:opacity-50"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={() => {
                  void handleConfirmSendNow();
                }}
                disabled={isSending}
                className="inline-flex items-center gap-2 rounded-xl bg-sky-500 px-4 py-2 text-sm font-medium text-white hover:bg-sky-400 disabled:opacity-50"
              >
                {isSending ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" />
                    Đang gửi...
                  </>
                ) : (
                  <>
                    <Mail size={14} />
                    Xác nhận gửi
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
