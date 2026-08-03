import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ExternalLink, Eye, EyeOff, Info, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  getDeepSeekSettings,
  getScheduleSettings,
  getSettings,
  getStats,
  runDailyReportNow,
  setAutostartEnabled,
  setDeepSeekSettings,
  setServiceAccountFromRawJson,
  setServiceAccountJson,
  setScheduleSettings,
} from "../../lib/api";
import { PACKAGE_NAME } from "../../lib/play-console-links";
import { DEFAULT_DEEPSEEK_PROMPT } from "../../lib/deepseek-prompt";
import type { AppSettings, DeepSeekSettings, ReportDayTarget, ScheduleSettings } from "../../lib/types";
import {
  formatDayLabelVn,
  todayDayKeyVn,
  yesterdayDayKeyVn,
} from "../../lib/report";
import { formatDate } from "../../lib/utils";
import { ScheduleTimePicker } from "./ScheduleTimePicker";

const SCHEDULE_AUTOSAVE_MS = 700;

export function SettingsPanel() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scheduleFormRef = useRef<ScheduleSettings | null>(null);
  const skipScheduleAutoSaveRef = useRef(false);
  const scheduleSavingRef = useRef(false);
  const scheduleNeedsResaveRef = useRef(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSavingFile, setIsSavingFile] = useState(false);
  const [isSavingSchedule, setIsSavingSchedule] = useState(false);
  const [isRunningNow, setIsRunningNow] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageKind, setMessageKind] = useState<"info" | "success" | "error">("info");
  const [scheduleForm, setScheduleForm] = useState<ScheduleSettings | null>(null);
  const [scheduleAutoSaveStatus, setScheduleAutoSaveStatus] = useState<
    "idle" | "pending" | "saving" | "saved" | "error"
  >("idle");
  const [showSmtpPassword, setShowSmtpPassword] = useState(false);
  const [savedJsonFileName, setSavedJsonFileName] = useState<string | null>(null);
  const deepseekFormRef = useRef<DeepSeekSettings | null>(null);
  const skipDeepseekAutoSaveRef = useRef(false);
  const deepseekSavingRef = useRef(false);
  const deepseekNeedsResaveRef = useRef(false);
  const [deepseekForm, setDeepseekForm] = useState<DeepSeekSettings | null>(null);
  const [showDeepseekKey, setShowDeepseekKey] = useState(false);
  const [deepseekAutoSaveStatus, setDeepseekAutoSaveStatus] = useState<
    "idle" | "pending" | "saving" | "saved" | "error"
  >("idle");

  const settingsQuery = useQuery({
    queryKey: ["settings"],
    queryFn: getSettings,
  });

  const serviceAccountLabel = settingsQuery.data?.serviceAccountPath ?? "chưa cấu hình";
  const hasCustomServiceAccount = serviceAccountLabel.startsWith("custom");
  const serviceAccountEmail = hasCustomServiceAccount
    ? serviceAccountLabel.replace(/^custom\s*\(/, "").replace(/\)$/, "")
    : null;

  const statsQuery = useQuery({
    queryKey: ["stats"],
    queryFn: getStats,
  });

  const scheduleQuery = useQuery({
    queryKey: ["schedule-settings"],
    queryFn: getScheduleSettings,
  });

  const deepseekQuery = useQuery({
    queryKey: ["deepseek-settings"],
    queryFn: getDeepSeekSettings,
  });

  scheduleFormRef.current = scheduleForm;
  deepseekFormRef.current = deepseekForm;

  function applyServerSchedule(settings: ScheduleSettings) {
    skipScheduleAutoSaveRef.current = true;
    setScheduleForm(settings);
    queryClient.setQueryData<ScheduleSettings>(["schedule-settings"], settings);
  }

  function applyServerDeepseek(settings: DeepSeekSettings) {
    skipDeepseekAutoSaveRef.current = true;
    setDeepseekForm(settings);
    queryClient.setQueryData<DeepSeekSettings>(["deepseek-settings"], settings);
  }

  // Chỉ hydrate lần đầu — không ghi đè khi user đang nhập.
  useEffect(() => {
    if (scheduleQuery.data && scheduleForm === null) {
      skipScheduleAutoSaveRef.current = true;
      setScheduleForm(scheduleQuery.data);
    }
  }, [scheduleQuery.data, scheduleForm]);

  useEffect(() => {
    if (deepseekQuery.data && deepseekForm === null) {
      skipDeepseekAutoSaveRef.current = true;
      setDeepseekForm(deepseekQuery.data);
    }
  }, [deepseekQuery.data, deepseekForm]);

  // Tự lưu local khi nhập (debounce) — lần sau mở app vẫn còn.
  useEffect(() => {
    if (!scheduleForm) return;
    if (skipScheduleAutoSaveRef.current) {
      skipScheduleAutoSaveRef.current = false;
      return;
    }

    setScheduleAutoSaveStatus("pending");
    const timer = window.setTimeout(() => {
      void (async () => {
        if (scheduleSavingRef.current) {
          scheduleNeedsResaveRef.current = true;
          return;
        }

        scheduleSavingRef.current = true;
        setScheduleAutoSaveStatus("saving");
        try {
          do {
            scheduleNeedsResaveRef.current = false;
            const snapshot = scheduleFormRef.current;
            if (!snapshot) break;

            const saved = await setScheduleSettings(snapshot);
            queryClient.setQueryData<ScheduleSettings>(["schedule-settings"], saved);

            if (scheduleFormRef.current === snapshot) {
              skipScheduleAutoSaveRef.current = true;
              setScheduleForm(saved);
            } else if (
              scheduleFormRef.current &&
              scheduleFormRef.current.smtpAppPassword === snapshot.smtpAppPassword
            ) {
              skipScheduleAutoSaveRef.current = true;
              setScheduleForm({
                ...scheduleFormRef.current,
                smtpAppPassword: saved.smtpAppPassword,
              });
            }
          } while (scheduleNeedsResaveRef.current);

          setScheduleAutoSaveStatus("saved");
        } catch {
          setScheduleAutoSaveStatus("error");
        } finally {
          scheduleSavingRef.current = false;
        }
      })();
    }, SCHEDULE_AUTOSAVE_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [scheduleForm, queryClient]);

  // Tự lưu DeepSeek API key + prompt local.
  useEffect(() => {
    if (!deepseekForm) return;
    if (skipDeepseekAutoSaveRef.current) {
      skipDeepseekAutoSaveRef.current = false;
      return;
    }

    setDeepseekAutoSaveStatus("pending");
    const timer = window.setTimeout(() => {
      void (async () => {
        if (deepseekSavingRef.current) {
          deepseekNeedsResaveRef.current = true;
          return;
        }

        deepseekSavingRef.current = true;
        setDeepseekAutoSaveStatus("saving");
        try {
          do {
            deepseekNeedsResaveRef.current = false;
            const snapshot = deepseekFormRef.current;
            if (!snapshot) break;

            const saved = await setDeepSeekSettings({
              apiKey: snapshot.apiKey,
              prompt: snapshot.prompt,
            });
            queryClient.setQueryData<DeepSeekSettings>(["deepseek-settings"], saved);

            if (deepseekFormRef.current === snapshot) {
              skipDeepseekAutoSaveRef.current = true;
              setDeepseekForm(saved);
            } else if (
              deepseekFormRef.current &&
              deepseekFormRef.current.apiKey === snapshot.apiKey
            ) {
              skipDeepseekAutoSaveRef.current = true;
              setDeepseekForm({
                ...deepseekFormRef.current,
                apiKey: saved.apiKey,
                lastReportDay: saved.lastReportDay,
                lastReportText: saved.lastReportText,
              });
            }
          } while (deepseekNeedsResaveRef.current);

          setDeepseekAutoSaveStatus("saved");
        } catch {
          setDeepseekAutoSaveStatus("error");
        } finally {
          deepseekSavingRef.current = false;
        }
      })();
    }, SCHEDULE_AUTOSAVE_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [deepseekForm, queryClient]);

  async function handleRefresh() {
    setIsRefreshing(true);
    setMessageKind("info");
    setMessage(
      hasCustomServiceAccount
        ? "Đang tải dữ liệu từ Google Play API..."
        : "Cần upload Service Account trước khi tải dữ liệu.",
    );
    try {
      await queryClient.invalidateQueries({ queryKey: ["stats"] });
      await queryClient.invalidateQueries({ queryKey: ["reviews"] });
      await queryClient.invalidateQueries({ queryKey: ["settings"] });
      await queryClient.fetchQuery({ queryKey: ["stats"], queryFn: getStats });
      setMessageKind("success");
      setMessage("Đã tải lại dữ liệu live.");
    } catch (error) {
      setMessageKind("error");
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsRefreshing(false);
    }
  }

  async function handleServiceAccountFile(file: File | null) {
    if (!file) return;
    setIsSavingFile(true);
    setMessageKind("info");
    setMessage("Đang lưu file Service Account...");
    try {
      const raw = await file.text();
      const updated = await setServiceAccountFromRawJson(raw);
      queryClient.setQueryData<AppSettings>(["settings"], updated);
      setSavedJsonFileName(file.name);
      await queryClient.invalidateQueries({ queryKey: ["settings"] });
      await queryClient.invalidateQueries({ queryKey: ["stats"] });
      await queryClient.invalidateQueries({ queryKey: ["reviews"] });
      await settingsQuery.refetch();
      setMessageKind("success");
      setMessage(`Đã lưu “${file.name}” trên máy. Lần sau không cần upload lại.`);
    } catch (error) {
      setMessageKind("error");
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSavingFile(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  async function handleUseDefaultAccount() {
    setIsSavingFile(true);
    setMessageKind("info");
    setMessage("Đang xóa Service Account local...");
    try {
      const updated = await setServiceAccountJson(null);
      queryClient.setQueryData<AppSettings>(["settings"], updated);
      setSavedJsonFileName(null);
      await queryClient.invalidateQueries({ queryKey: ["settings"] });
      await queryClient.invalidateQueries({ queryKey: ["stats"] });
      await queryClient.invalidateQueries({ queryKey: ["reviews"] });
      await settingsQuery.refetch();
      setMessageKind("success");
      setMessage("Đã xóa Service Account local. Upload lại khi cần dùng API.");
    } catch (error) {
      setMessageKind("error");
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSavingFile(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  async function handleSaveSchedule() {
    if (!scheduleForm) return;
    setIsSavingSchedule(true);
    setScheduleAutoSaveStatus("saving");
    setMessageKind("info");
    setMessage("Đang lưu cấu hình báo cáo tự động...");
    try {
      const saved = await setScheduleSettings(scheduleForm);
      applyServerSchedule(saved);
      setScheduleAutoSaveStatus("saved");
      setMessageKind("success");
      setMessage("Đã lưu cấu hình báo cáo tự động.");
    } catch (error) {
      setScheduleAutoSaveStatus("error");
      setMessageKind("error");
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSavingSchedule(false);
    }
  }

  async function handleRunNow() {
    setIsRunningNow(true);
    setMessageKind("info");
    setMessage("Đang sync dữ liệu và gửi mail báo cáo...");
    try {
      const updated = await runDailyReportNow();
      applyServerSchedule(updated);
      await queryClient.invalidateQueries({ queryKey: ["stats"] });
      await queryClient.invalidateQueries({ queryKey: ["reviews"] });
      setMessageKind(updated.lastRunStatus === "success" ? "success" : "error");
      setMessage(
        updated.lastRunStatus === "success"
          ? "Đã gửi mail báo cáo thành công."
          : updated.lastRunError ?? "Gửi mail báo cáo thất bại.",
      );
    } catch (error) {
      setMessageKind("error");
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsRunningNow(false);
    }
  }

  async function handleAutostartToggle(enabled: boolean) {
    if (!scheduleForm) return;
    setIsSavingSchedule(true);
    setMessageKind("info");
    setMessage(enabled ? "Đang bật khởi động cùng hệ thống..." : "Đang tắt khởi động cùng hệ thống...");
    try {
      const updated = await setAutostartEnabled(enabled);
      applyServerSchedule(updated);
      setScheduleAutoSaveStatus("saved");
      setMessageKind("success");
      setMessage(enabled ? "Đã bật khởi động cùng hệ thống." : "Đã tắt khởi động cùng hệ thống.");
    } catch (error) {
      setMessageKind("error");
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSavingSchedule(false);
    }
  }

  const messageStyles =
    messageKind === "error"
      ? "border-rose-500/20 bg-rose-500/10 text-rose-100"
      : messageKind === "success"
        ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-100"
        : "border-sky-500/20 bg-sky-500/10 text-sky-100";

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-sky-500/30 bg-sky-500/10 px-4 py-4 text-sm text-sky-100">
        <p className="font-medium text-sky-50">Desktop only (Windows & macOS)</p>
        <p className="mt-1">
          Toàn bộ cấu hình nằm trong Settings và lưu local trên máy — không cần file{" "}
          <code className="text-sky-200">.env</code>. Upload Service Account một lần, điền Gmail /
          lịch gửi, rồi Lưu.
        </p>
      </div>

      {message ? (
        <div className={`rounded-2xl border px-4 py-3 text-sm ${messageStyles}`}>
          {isRefreshing || isSavingFile || isSavingSchedule || isRunningNow ? (
            <span className="inline-flex items-center gap-2">
              <RefreshCw size={14} className="animate-spin" />
              {message}
            </span>
          ) : (
            message
          )}
        </div>
      ) : null}

      <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <h2 className="text-lg font-medium text-white">1. Service Account JSON</h2>
        <p className="mt-2 text-sm text-slate-400">
          Upload file JSON từ Google Cloud một lần. App lưu local trên máy — lần sau mở app không
          cần chọn lại.
        </p>

        {hasCustomServiceAccount ? (
          <div className="mt-4 flex items-start gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
            <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-300" />
            <div>
              <p className="font-medium text-emerald-50">Đã lưu trên máy này</p>
              <p className="mt-1 break-all text-emerald-100/90">
                {serviceAccountEmail ?? serviceAccountLabel}
              </p>
              {savedJsonFileName ? (
                <p className="mt-1 text-xs text-emerald-200/80">File: {savedJsonFileName}</p>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            Chưa có Service Account. Chọn file JSON bên dưới để bắt đầu.
          </div>
        )}

        <label className="mt-4 block text-sm text-slate-300">
          Chọn file JSON
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            disabled={isSavingFile}
            onChange={(event) => {
              const file = event.target.files?.[0] ?? null;
              void handleServiceAccountFile(file);
            }}
            className="mt-1.5 block w-full cursor-pointer rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2.5 text-sm text-white file:mr-3 file:rounded-lg file:border-0 file:bg-sky-500 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-sky-400"
          />
        </label>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              void handleRefresh();
            }}
            disabled={isRefreshing || !hasCustomServiceAccount}
            className="inline-flex items-center gap-2 rounded-xl bg-sky-500 px-4 py-2 text-sm font-medium text-white hover:bg-sky-400 disabled:opacity-50"
          >
            <RefreshCw size={16} className={isRefreshing ? "animate-spin" : ""} />
            {isRefreshing ? "Đang tải lại..." : "Tải lại dữ liệu"}
          </button>
          <button
            type="button"
            onClick={() => {
              void handleUseDefaultAccount();
            }}
            disabled={isSavingFile || !hasCustomServiceAccount}
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-200 hover:bg-white/5 disabled:opacity-50"
          >
            Xóa file đã lưu
          </button>
        </div>
      </section>

      {scheduleForm ? (
        <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-lg font-medium text-white">2. Báo cáo tự động</h2>
          <p className="mt-2 text-sm text-slate-400">
            App chạy nền trên Windows / macOS, sync theo giờ cấu hình (Asia/Ho_Chi_Minh). Ngày có
            review (&gt;0): tạo tóm tắt bằng DeepSeek rồi gửi Gmail. Ngày 0 review: gửi mẫu mặc định
            (không gọi API). Các ô bên dưới{" "}
            <strong className="font-medium text-slate-300">tự lưu local khi nhập</strong>.
          </p>
          <p className="mt-1.5 text-xs text-slate-500">
            {scheduleAutoSaveStatus === "pending"
              ? "Đang chờ lưu…"
              : scheduleAutoSaveStatus === "saving" || isSavingSchedule
                ? "Đang lưu cấu hình…"
                : scheduleAutoSaveStatus === "saved"
                  ? "Đã lưu trên máy này."
                  : scheduleAutoSaveStatus === "error"
                    ? "Lưu thất bại — thử bấm Lưu ngay."
                    : null}
          </p>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <label className="rounded-xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-slate-300">
              <span className="block text-slate-200">Bật lịch hàng ngày</span>
              <input
                type="checkbox"
                checked={scheduleForm.enabled}
                onChange={(event) =>
                  setScheduleForm((current) =>
                    current ? { ...current, enabled: event.target.checked } : current,
                  )
                }
                className="mt-3 h-4 w-4 accent-sky-500"
              />
            </label>

            <label className="rounded-xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-slate-300">
              <span className="block text-slate-200">Khởi động cùng hệ thống</span>
              <input
                type="checkbox"
                checked={scheduleForm.autostartEnabled}
                onChange={(event) => {
                  void handleAutostartToggle(event.target.checked);
                }}
                className="mt-3 h-4 w-4 accent-sky-500"
              />
            </label>

            <label className="text-sm text-slate-300 md:col-span-2">
              Email nhận (To)
              <input
                type="text"
                value={scheduleForm.recipient}
                onChange={(event) =>
                  setScheduleForm((current) =>
                    current ? { ...current, recipient: event.target.value } : current,
                  )
                }
                placeholder="a@gmail.com, b@gmail.com"
                className="mt-1.5 block w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2.5 text-sm text-white outline-none ring-sky-500/30 focus:ring-2"
              />
              <span className="mt-1.5 block text-xs text-slate-500">
                Nhiều email: cách nhau bằng dấu phẩy hoặc chấm phẩy.
              </span>
            </label>

            <label className="text-sm text-slate-300">
              <span className="inline-flex items-center gap-1.5">
                Cc
                <span className="group relative inline-flex">
                  <Info
                    size={14}
                    className="cursor-help text-slate-500 transition group-hover:text-sky-300"
                    aria-hidden
                  />
                  <span
                    role="tooltip"
                    className="pointer-events-none absolute left-0 top-full z-50 mt-2 w-60 rounded-lg border border-white/10 bg-slate-900 px-2.5 py-2 text-xs leading-relaxed text-slate-200 opacity-0 shadow-lg transition group-hover:opacity-100"
                  >
                    Carbon Copy — gửi thêm bản sao cho người khác. Họ thấy được danh sách To và Cc.
                  </span>
                </span>
              </span>
              <input
                type="text"
                value={scheduleForm.cc ?? ""}
                onChange={(event) =>
                  setScheduleForm((current) =>
                    current ? { ...current, cc: event.target.value } : current,
                  )
                }
                placeholder="cc1@gmail.com, cc2@gmail.com"
                className="mt-1.5 block w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2.5 text-sm text-white outline-none ring-sky-500/30 focus:ring-2"
              />
            </label>

            <label className="text-sm text-slate-300">
              <span className="inline-flex items-center gap-1.5">
                Bcc
                <span className="group relative inline-flex">
                  <Info
                    size={14}
                    className="cursor-help text-slate-500 transition group-hover:text-sky-300"
                    aria-hidden
                  />
                  <span
                    role="tooltip"
                    className="pointer-events-none absolute right-0 top-full z-50 mt-2 w-60 rounded-lg border border-white/10 bg-slate-900 px-2.5 py-2 text-xs leading-relaxed text-slate-200 opacity-0 shadow-lg transition group-hover:opacity-100"
                  >
                    Blind Carbon Copy — gửi ẩn danh. Người nhận Bcc không hiện với To/Cc và với nhau.
                  </span>
                </span>
              </span>
              <input
                type="text"
                value={scheduleForm.bcc ?? ""}
                onChange={(event) =>
                  setScheduleForm((current) =>
                    current ? { ...current, bcc: event.target.value } : current,
                  )
                }
                placeholder="bcc@gmail.com"
                className="mt-1.5 block w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2.5 text-sm text-white outline-none ring-sky-500/30 focus:ring-2"
              />
            </label>

            <label className="block text-sm text-slate-300 md:col-span-2">
              Ngày review cần báo cáo
              <select
                value={scheduleForm.reportDayTarget ?? "yesterday"}
                onChange={(event) => {
                  const value = event.target.value as ReportDayTarget;
                  setScheduleForm((current) =>
                    current ? { ...current, reportDayTarget: value } : current,
                  );
                }}
                className="mt-1.5 w-full max-w-md rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2.5 text-sm text-white outline-none ring-sky-500/30 focus:ring-2"
              >
                <option value="yesterday">
                  {formatDayLabelVn(yesterdayDayKeyVn())} · Hôm qua
                </option>
                <option value="today">
                  {formatDayLabelVn(todayDayKeyVn())} · Hôm nay
                </option>
              </select>
              <p className="mt-2 text-xs text-slate-500">
                Lịch tự động / Chạy thử lấy reviews theo ngày này (giờ Việt Nam). Mặc định: Hôm qua.
              </p>
            </label>

            <label className="text-sm text-slate-300">
              Gmail gửi
              <input
                type="email"
                value={scheduleForm.smtpEmail ?? ""}
                onChange={(event) =>
                  setScheduleForm((current) =>
                    current ? { ...current, smtpEmail: event.target.value } : current,
                  )
                }
                placeholder="you@gmail.com"
                className="mt-1.5 block w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2.5 text-sm text-white outline-none ring-sky-500/30 focus:ring-2"
              />
            </label>

            <div className="text-sm text-slate-300">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>Gmail App Password</span>
                <a
                  href="https://myaccount.google.com/apppasswords"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-sky-300 underline decoration-sky-500/40 underline-offset-2 hover:text-sky-200"
                >
                  Tạo App Password
                  <ExternalLink size={12} />
                </a>
              </div>
              <div className="relative mt-1.5">
                <input
                  type={showSmtpPassword ? "text" : "password"}
                  value={
                    scheduleForm.smtpAppPassword === "********"
                      ? ""
                      : (scheduleForm.smtpAppPassword ?? "")
                  }
                  onChange={(event) =>
                    setScheduleForm((current) =>
                      current ? { ...current, smtpAppPassword: event.target.value } : current,
                    )
                  }
                  placeholder={
                    scheduleForm.smtpAppPassword === "********"
                      ? "Đã lưu — nhập lại nếu muốn đổi"
                      : "Dán 16 ký tự App Password vào đây"
                  }
                  className="block w-full rounded-xl border border-white/10 bg-slate-950/60 py-2.5 pl-3 pr-11 text-sm text-white outline-none ring-sky-500/30 focus:ring-2"
                />
                <button
                  type="button"
                  onClick={() => setShowSmtpPassword((current) => !current)}
                  aria-label={showSmtpPassword ? "Ẩn App Password" : "Hiện App Password"}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 hover:text-slate-200"
                >
                  {showSmtpPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <p className="mt-1.5 text-xs text-slate-500">
                Cần bật 2-Step Verification trước. Chọn app Mail → Other → copy mật khẩu 16 ký tự
                rồi dán vào ô trên.
              </p>
            </div>

            <div className="text-sm text-slate-300 md:col-span-2">
              <span className="block">Giờ gửi (Asia/Ho_Chi_Minh)</span>
              <ScheduleTimePicker
                hour={scheduleForm.hour}
                minute={scheduleForm.minute}
                onChange={(nextHour, nextMinute) =>
                  setScheduleForm((current) =>
                    current
                      ? { ...current, hour: nextHour, minute: nextMinute }
                      : current,
                  )
                }
              />
            </div>
          </div>

          <div className="mt-5 rounded-xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-slate-400">
            <p>
              <span className="text-slate-300">Lần chạy gần nhất:</span>{" "}
              {formatDate(scheduleForm.lastRunAt)}
            </p>
            <p className="mt-1">
              <span className="text-slate-300">Trạng thái:</span>{" "}
              {scheduleForm.lastRunStatus ?? "—"}
            </p>
            <p className="mt-1">
              <span className="text-slate-300">Ngày đã gửi:</span>{" "}
              {scheduleForm.lastRunDay ?? "—"}
            </p>
            <p className="mt-1">
              <span className="text-slate-300">Lỗi gần nhất:</span>{" "}
              {scheduleForm.lastRunError ?? "—"}
            </p>
          </div>

          <p className="mt-3 text-xs text-slate-500">
            Gmail cần 2-Step Verification +{" "}
            <a
              href="https://myaccount.google.com/apppasswords"
              target="_blank"
              rel="noreferrer"
              className="text-sky-300 underline decoration-sky-500/40 underline-offset-2 hover:text-sky-200"
            >
              App Password
            </a>
            . Không dùng mật khẩu đăng nhập Gmail thường.
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                void handleSaveSchedule();
              }}
              disabled={isSavingSchedule || isRunningNow}
              className="inline-flex items-center gap-2 rounded-xl bg-sky-500 px-4 py-2 text-sm font-medium text-white hover:bg-sky-400 disabled:opacity-50"
            >
              {isSavingSchedule ? "Đang lưu..." : "Lưu ngay"}
            </button>
            <button
              type="button"
              onClick={() => {
                void handleRunNow();
              }}
              disabled={isSavingSchedule || isRunningNow}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-200 hover:bg-white/5 disabled:opacity-50"
            >
              {isRunningNow ? "Đang chạy..." : "Chạy thử ngay"}
            </button>
          </div>
        </section>
      ) : null}

      {deepseekForm ? (
        <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-lg font-medium text-white">3. DeepSeek</h2>
          <p className="mt-2 text-sm text-slate-400">
            API key và prompt dùng để tạo lại báo cáo bằng DeepSeek trên tab Báo cáo. Tự lưu local
            khi nhập.
          </p>
          <p className="mt-1.5 text-xs text-slate-500">
            {deepseekAutoSaveStatus === "pending"
              ? "Đang chờ lưu…"
              : deepseekAutoSaveStatus === "saving"
                ? "Đang lưu cấu hình DeepSeek…"
                : deepseekAutoSaveStatus === "saved"
                  ? "Đã lưu trên máy này."
                  : deepseekAutoSaveStatus === "error"
                    ? "Lưu thất bại — kiểm tra lại rồi sửa ô nhập."
                    : null}
          </p>

          <div className="mt-5 grid gap-4">
            <div className="text-sm text-slate-300">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>DeepSeek API key</span>
                <a
                  href="https://platform.deepseek.com/api_keys"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-sky-300 underline decoration-sky-500/40 underline-offset-2 hover:text-sky-200"
                >
                  Lấy API key
                  <ExternalLink size={12} />
                </a>
              </div>
              <div className="relative mt-1.5">
                <input
                  type={showDeepseekKey ? "text" : "password"}
                  value={
                    deepseekForm.apiKey === "********" ? "" : (deepseekForm.apiKey ?? "")
                  }
                  onChange={(event) =>
                    setDeepseekForm((current) =>
                      current ? { ...current, apiKey: event.target.value } : current,
                    )
                  }
                  placeholder={
                    deepseekForm.apiKey === "********"
                      ? "Đã lưu — nhập lại nếu muốn đổi"
                      : "sk-..."
                  }
                  className="block w-full rounded-xl border border-white/10 bg-slate-950/60 py-2.5 pl-3 pr-11 text-sm text-white outline-none ring-sky-500/30 focus:ring-2"
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={() => setShowDeepseekKey((current) => !current)}
                  aria-label={showDeepseekKey ? "Ẩn API key" : "Hiện API key"}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 hover:text-slate-200"
                >
                  {showDeepseekKey ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <label className="block text-sm text-slate-300">
              <span className="flex flex-wrap items-center justify-between gap-2">
                <span>Prompt tạo báo cáo</span>
                <button
                  type="button"
                  onClick={() =>
                    setDeepseekForm((current) =>
                      current ? { ...current, prompt: DEFAULT_DEEPSEEK_PROMPT } : current,
                    )
                  }
                  className="text-xs text-sky-300 underline decoration-sky-500/40 underline-offset-2 hover:text-sky-200"
                >
                  Khôi phục mặc định
                </button>
              </span>
              <textarea
                value={deepseekForm.prompt}
                onChange={(event) =>
                  setDeepseekForm((current) =>
                    current ? { ...current, prompt: event.target.value } : current,
                  )
                }
                rows={18}
                placeholder="Hướng dẫn DeepSeek viết báo cáo…"
                className="mt-1.5 w-full min-w-0 resize-y rounded-xl border border-white/10 bg-slate-950/60 px-3 py-3 text-sm leading-relaxed text-slate-100 outline-none ring-sky-500/30 focus:ring-2"
                spellCheck={false}
              />
              <span className="mt-1.5 block text-xs text-slate-500">
                Placeholder <code className="text-slate-400">{"{{REPORT}}"}</code> sẽ được thay bằng
                dữ liệu báo cáo gốc khi bấm “Tạo lại bằng DeepSeek”.
              </span>
            </label>
          </div>

          <div className="mt-4">
            <button
              type="button"
              onClick={() => {
                if (!deepseekForm) return;
                void (async () => {
                  setDeepseekAutoSaveStatus("saving");
                  try {
                    const saved = await setDeepSeekSettings({
                      apiKey: deepseekForm.apiKey,
                      prompt: deepseekForm.prompt,
                    });
                    applyServerDeepseek(saved);
                    setDeepseekAutoSaveStatus("saved");
                    setMessageKind("success");
                    setMessage("Đã lưu cấu hình DeepSeek.");
                  } catch (error) {
                    setDeepseekAutoSaveStatus("error");
                    setMessageKind("error");
                    setMessage(error instanceof Error ? error.message : String(error));
                  }
                })();
              }}
              className="inline-flex items-center gap-2 rounded-xl bg-sky-500 px-4 py-2 text-sm font-medium text-white hover:bg-sky-400"
            >
              Lưu ngay
            </button>
          </div>
        </section>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-lg font-medium text-white">Trạng thái dữ liệu</h2>
          <p className="mt-2 text-sm text-slate-400">
            Cửa sổ <strong className="text-slate-200">7 ngày</strong> từ Google Play API.
          </p>

          <div className="mt-5 rounded-xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-slate-400">
            <p>
              <span className="text-slate-300">Package:</span>{" "}
              {settingsQuery.data?.packageName ?? PACKAGE_NAME}
            </p>
            <p className="mt-1">
              <span className="text-slate-300">Cập nhật lúc:</span>{" "}
              {formatDate(statsQuery.data?.lastSyncAt)}
            </p>
            <p className="mt-1">
              <span className="text-slate-300">Reviews (7 ngày):</span>{" "}
              {statsQuery.data?.apiReviewCount?.toLocaleString("vi-VN") ?? "—"}
            </p>
            <p className="mt-1">
              <span className="text-slate-300">Service Account:</span>{" "}
              {hasCustomServiceAccount ? (
                <span className="text-emerald-300">{serviceAccountEmail ?? "đã lưu"}</span>
              ) : (
                <span className="text-amber-300">chưa cấu hình</span>
              )}
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
