import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, FileText, Mail, RefreshCw, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  generateDeepSeekReport,
  getDeepSeekSettings,
  getScheduleSettings,
  getStats,
  listReviews,
  saveDeepSeekReportText,
  sendReportNow,
} from "../../lib/api";
import {
  buildDailyReportText,
  buildReportSubject,
  extractDeepSeekSubject,
  filterReviewsByDay,
  formatDayLabelVn,
  formatDayShortVn,
  resolveDailyBreakdown,
  stripDeepSeekSubjectLine,
  todayDayKeyVn,
  toPeriodStats,
  yesterdayDayKeyVn,
} from "../../lib/report";
import { isTauriRuntime } from "../../lib/runtime";
import { buildZeroReviewReportBody } from "../../lib/deepseek-prompt";
import type { DailyPeriodStats, DeepSeekSettings, Review } from "../../lib/types";

const DEEPSEEK_REPORT_AUTOSAVE_MS = 800;

type SendSource = "original" | "deepseek";

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
  const queryClient = useQueryClient();

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
    queryFn: getScheduleSettings,
    enabled: isDesktop,
  });

  const deepseekQuery = useQuery({
    queryKey: ["deepseek-settings"],
    queryFn: getDeepSeekSettings,
    enabled: isDesktop,
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
  const [deepseekText, setDeepseekText] = useState("");
  const [copied, setCopied] = useState(false);
  const [deepseekCopied, setDeepseekCopied] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sendSource, setSendSource] = useState<SendSource>("original");
  const [isSending, setIsSending] = useState(false);
  const [isGeneratingDeepseek, setIsGeneratingDeepseek] = useState(false);
  const [sendMessage, setSendMessage] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [deepseekMessage, setDeepseekMessage] = useState<string | null>(null);
  const [deepseekError, setDeepseekError] = useState<string | null>(null);
  const [deepseekSaveStatus, setDeepseekSaveStatus] = useState<
    "idle" | "pending" | "saving" | "saved" | "error"
  >("idle");

  const deepseekTextRef = useRef(deepseekText);
  const skipDeepseekTextSaveRef = useRef(false);
  const deepseekTextSavingRef = useRef(false);
  const deepseekTextNeedsResaveRef = useRef(false);
  deepseekTextRef.current = deepseekText;

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

  // Nạp báo cáo DeepSeek đã lưu local (theo ngày).
  // Ngày 0 review → mẫu mail mặc định (không cần API).
  useEffect(() => {
    if (!selectedStats) return;
    const settings = deepseekQuery.data;
    const hasZeroReviews = (selectedStats.reviewCount ?? 0) === 0;
    const savedForDay =
      settings?.lastReportDay === selectedStats.day &&
      settings.lastReportText &&
      settings.lastReportText.trim()
        ? settings.lastReportText
        : null;

    skipDeepseekTextSaveRef.current = true;
    if (savedForDay) {
      setDeepseekText(savedForDay);
    } else if (hasZeroReviews) {
      setDeepseekText(buildZeroReviewReportBody(selectedStats.day));
    } else {
      setDeepseekText("");
    }
  }, [deepseekQuery.data, selectedStats?.day, selectedStats?.reviewCount]);

  // Tự lưu nội dung DeepSeek khi user sửa.
  useEffect(() => {
    if (!isDesktop || !selectedStats) return;
    if (skipDeepseekTextSaveRef.current) {
      skipDeepseekTextSaveRef.current = false;
      return;
    }
    if (!deepseekText.trim()) return;

    setDeepseekSaveStatus("pending");
    const day = selectedStats.day;
    const timer = window.setTimeout(() => {
      void (async () => {
        if (deepseekTextSavingRef.current) {
          deepseekTextNeedsResaveRef.current = true;
          return;
        }
        deepseekTextSavingRef.current = true;
        setDeepseekSaveStatus("saving");
        try {
          do {
            deepseekTextNeedsResaveRef.current = false;
            const snapshot = deepseekTextRef.current;
            const saved = await saveDeepSeekReportText(day, snapshot);
            queryClient.setQueryData<DeepSeekSettings>(["deepseek-settings"], saved);
          } while (deepseekTextNeedsResaveRef.current);
          setDeepseekSaveStatus("saved");
        } catch {
          setDeepseekSaveStatus("error");
        } finally {
          deepseekTextSavingRef.current = false;
        }
      })();
    }, DEEPSEEK_REPORT_AUTOSAVE_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [deepseekText, selectedStats?.day, isDesktop, queryClient]);

  const isFetching = statsFetching || reviewsFetching;
  const recipient = scheduleQuery.data?.recipient?.trim() || "";
  const cc = scheduleQuery.data?.cc?.trim() || "";
  const bcc = scheduleQuery.data?.bcc?.trim() || "";
  const smtpEmail = scheduleQuery.data?.smtpEmail?.trim() || "";
  const hasDeepseekKey = Boolean(
    deepseekQuery.data?.apiKey && deepseekQuery.data.apiKey.trim(),
  );

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

  async function handleCopyDeepseek() {
    try {
      await navigator.clipboard.writeText(deepseekText);
      setDeepseekCopied(true);
      window.setTimeout(() => setDeepseekCopied(false), 2000);
    } catch {
      setDeepseekCopied(false);
    }
  }

  async function handleGenerateDeepseek() {
    if (!selectedStats) return;
    setDeepseekError(null);
    setDeepseekMessage(null);
    if (!isDesktop) {
      setDeepseekError("DeepSeek chỉ khả dụng trên app desktop (Windows / macOS).");
      return;
    }

    const hasZeroReviews =
      (selectedStats.reviewCount ?? 0) === 0 || dayReviews.length === 0;

    // 0 review → mẫu cố định, không gọi API.
    if (hasZeroReviews) {
      const template = buildZeroReviewReportBody(selectedStats.day);
      setIsGeneratingDeepseek(true);
      try {
        skipDeepseekTextSaveRef.current = true;
        setDeepseekText(template);
        const saved = await saveDeepSeekReportText(selectedStats.day, template);
        queryClient.setQueryData<DeepSeekSettings>(["deepseek-settings"], saved);
        setDeepseekSaveStatus("saved");
        setDeepseekMessage(
          "Ngày không có đánh giá — đã dùng mẫu mail mặc định (không gọi DeepSeek).",
        );
      } catch (error) {
        setDeepseekError(error instanceof Error ? error.message : String(error));
      } finally {
        setIsGeneratingDeepseek(false);
      }
      return;
    }

    if (!hasDeepseekKey) {
      setDeepseekError("Chưa cấu hình DeepSeek API key. Vào Cài đặt → DeepSeek để nhập.");
      return;
    }
    if (!reportText.trim()) {
      setDeepseekError("Chưa có nội dung báo cáo gốc để gửi lên DeepSeek.");
      return;
    }

    setIsGeneratingDeepseek(true);
    try {
      const result = await generateDeepSeekReport(selectedStats.day, reportText);
      skipDeepseekTextSaveRef.current = true;
      setDeepseekText(result.text);
      queryClient.setQueryData<DeepSeekSettings>(["deepseek-settings"], result.settings);
      setDeepseekSaveStatus("saved");
      setDeepseekMessage("Đã tạo báo cáo bằng DeepSeek và lưu local.");
    } catch (error) {
      setDeepseekError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsGeneratingDeepseek(false);
    }
  }

  function handleRequestSendNow(source: SendSource = "original") {
    setSendMessage(null);
    setSendError(null);
    setDeepseekMessage(null);
    setDeepseekError(null);
    if (!isDesktop) {
      const msg = "Gửi ngay chỉ khả dụng trên app desktop (Windows / macOS).";
      if (source === "deepseek") setDeepseekError(msg);
      else setSendError(msg);
      return;
    }
    if (!recipient) {
      const msg = "Chưa cấu hình email nhận báo cáo. Vào Cài đặt để điền.";
      if (source === "deepseek") setDeepseekError(msg);
      else setSendError(msg);
      return;
    }
    if (!smtpEmail) {
      const msg = "Chưa cấu hình Gmail gửi. Vào Cài đặt để điền.";
      if (source === "deepseek") setDeepseekError(msg);
      else setSendError(msg);
      return;
    }
    if (source === "deepseek" && !deepseekText.trim()) {
      setDeepseekError("Chưa có nội dung DeepSeek để gửi. Hãy tạo báo cáo trước.");
      return;
    }
    if (source === "original" && !reportSubject.trim()) {
      setSendError("Tiêu đề không được để trống.");
      return;
    }
    setSendSource(source);
    setConfirmOpen(true);
  }

  async function handleConfirmSendNow() {
    if (!selectedStats) return;

    const subject =
      sendSource === "deepseek"
        ? extractDeepSeekSubject(deepseekText, selectedStats.day)
        : reportSubject.trim();
    const body =
      sendSource === "deepseek" ? stripDeepSeekSubjectLine(deepseekText) : undefined;

    if (!subject) {
      const msg = "Tiêu đề không được để trống.";
      if (sendSource === "deepseek") setDeepseekError(msg);
      else setSendError(msg);
      setConfirmOpen(false);
      return;
    }
    if (sendSource === "deepseek" && !body) {
      setDeepseekError("Chưa có nội dung DeepSeek để gửi.");
      setConfirmOpen(false);
      return;
    }

    setIsSending(true);
    setSendError(null);
    setSendMessage(null);
    setDeepseekError(null);
    setDeepseekMessage(null);
    try {
      const result = await sendReportNow(
        selectedStats.day,
        subject,
        sendSource === "deepseek" ? body : null,
      );
      setConfirmOpen(false);
      const okMsg = `Đã gửi báo cáo${sendSource === "deepseek" ? " DeepSeek" : ""} ngày ${formatDayShortVn(selectedStats.day)} tới ${recipient}.`;
      if (result.lastRunStatus === "success") {
        if (sendSource === "deepseek") setDeepseekMessage(okMsg);
        else setSendMessage(okMsg);
      } else {
        const err = result.lastRunError ?? "Gửi mail thất bại.";
        if (sendSource === "deepseek") setDeepseekError(err);
        else setSendError(err);
      }
    } catch (error) {
      const err = error instanceof Error ? error.message : String(error);
      if (sendSource === "deepseek") setDeepseekError(err);
      else setSendError(err);
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
              Chọn ngày trong 7 ngày gần nhất (giờ VN). Nút{" "}
              <strong className="text-slate-200">Gửi ngay</strong> gửi mail qua SMTP ngay, không chờ
              lịch hẹn.
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
              onClick={() => handleRequestSendNow("original")}
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

      <section className="rounded-2xl border border-violet-500/20 bg-white/5 p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-lg font-medium text-white">
              <Sparkles size={18} className="text-violet-300" />
              Báo cáo DeepSeek
            </h3>
            <p className="mt-1 text-sm text-slate-400">
              Ngày có review: tóm tắt bằng DeepSeek. Ngày 0 review: dùng mẫu mail mặc định (không
              gọi API).
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                void handleCopyDeepseek();
              }}
              disabled={!deepseekText.trim()}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-sm text-slate-200 hover:bg-white/5 disabled:opacity-50"
            >
              {deepseekCopied ? <Check size={14} /> : <Copy size={14} />}
              {deepseekCopied ? "Đã sao chép" : "Sao chép"}
            </button>
            <button
              type="button"
              onClick={() => {
                void handleGenerateDeepseek();
              }}
              disabled={isGeneratingDeepseek || isSending}
              className="inline-flex items-center gap-2 rounded-xl bg-violet-500 px-3 py-2 text-sm font-medium text-white hover:bg-violet-400 disabled:opacity-50"
            >
              {isGeneratingDeepseek ? (
                <RefreshCw size={14} className="animate-spin" />
              ) : (
                <Sparkles size={14} />
              )}
              {isGeneratingDeepseek ? "Đang tạo..." : "Tạo lại bằng DeepSeek"}
            </button>
            <button
              type="button"
              onClick={() => handleRequestSendNow("deepseek")}
              disabled={isSending || isGeneratingDeepseek || !deepseekText.trim()}
              className="inline-flex items-center gap-2 rounded-xl bg-sky-500 px-3 py-2 text-sm font-medium text-white hover:bg-sky-400 disabled:opacity-50"
            >
              <Mail size={14} />
              Gửi ngay
            </button>
          </div>
        </div>

        {deepseekMessage ? (
          <div className="mb-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
            {deepseekMessage}
          </div>
        ) : null}
        {deepseekError ? (
          <div className="mb-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
            {deepseekError}
          </div>
        ) : null}

        <label className="block text-sm text-slate-300">
          Nội dung DeepSeek
          <textarea
            value={deepseekText}
            onChange={(event) => setDeepseekText(event.target.value)}
            rows={14}
            placeholder={
              (selectedStats.reviewCount ?? 0) === 0
                ? "Ngày không có review — đang dùng mẫu mail mặc định."
                : hasDeepseekKey
                  ? "Bấm “Tạo lại bằng DeepSeek” để sinh báo cáo…"
                  : "Chưa có API key — vào Cài đặt → DeepSeek để cấu hình."
            }
            className="mt-1.5 w-full min-w-0 resize-y rounded-xl border border-white/10 bg-slate-950/60 px-3 py-3 font-mono text-sm leading-relaxed text-slate-100 outline-none ring-sky-500/30 focus:ring-2"
            spellCheck={false}
          />
        </label>
        <p className="mt-2 text-xs text-slate-500">
          {deepseekSaveStatus === "pending"
            ? "Đang chờ lưu…"
            : deepseekSaveStatus === "saving"
              ? "Đang lưu local…"
              : deepseekSaveStatus === "saved"
                ? "Đã lưu nội dung DeepSeek trên máy này."
                : deepseekSaveStatus === "error"
                  ? "Lưu thất bại."
                  : "Sửa tay cũng được — app tự lưu local."}{" "}
          <strong className="text-slate-300">Gửi ngay</strong> gửi đúng nội dung khung này qua SMTP.
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
                  {sendSource === "deepseek"
                    ? "Xác nhận gửi báo cáo DeepSeek?"
                    : "Xác nhận gửi ngay?"}
                </h3>
                <p className="mt-2 text-sm text-slate-400">
                  Gửi{" "}
                  {sendSource === "deepseek" ? (
                    <span className="font-medium text-violet-200">nội dung DeepSeek</span>
                  ) : (
                    "báo cáo"
                  )}{" "}
                  ngày{" "}
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
                <span className="text-slate-400">Nguồn:</span>{" "}
                {sendSource === "deepseek" ? "Báo cáo DeepSeek" : "Nội dung gửi"}
              </p>
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
                <span className="text-slate-400">Tiêu đề:</span>{" "}
                {sendSource === "deepseek"
                  ? extractDeepSeekSubject(deepseekText, selectedStats.day)
                  : reportSubject.trim() || "—"}
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
