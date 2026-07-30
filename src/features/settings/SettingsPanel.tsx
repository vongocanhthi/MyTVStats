import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ExternalLink, Eye, EyeOff, Info, LogOut, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  getScheduleSettings,
  getSettings,
  getStats,
  invalidateDataCache,
  refreshLiveData,
  runDailyReportNow,
  setAutostartEnabled,
  setServiceAccountFromRawJson,
  setServiceAccountJson,
  setScheduleSettings,
} from "../../lib/api";
import { getStoredSession, logout } from "../../lib/auth";
import { getServiceAccountLabel } from "../../lib/service-account-store";
import { PACKAGE_NAME } from "../../lib/play-console-links";
import { isTauriRuntime } from "../../lib/runtime";
import type { AppSettings, ReportDayTarget, ScheduleSettings } from "../../lib/types";
import {
  formatDayLabelVn,
  todayDayKeyVn,
  yesterdayDayKeyVn,
} from "../../lib/report";
import { formatDate } from "../../lib/utils";
import { ScheduleTimePicker } from "./ScheduleTimePicker";

interface SettingsPanelProps {
  onLogout: () => void;
}

export function SettingsPanel({ onLogout }: SettingsPanelProps) {
  const isDesktop = isTauriRuntime();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSavingFile, setIsSavingFile] = useState(false);
  const [isSavingSchedule, setIsSavingSchedule] = useState(false);
  const [isRunningNow, setIsRunningNow] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageKind, setMessageKind] = useState<"info" | "success" | "error">("info");
  const [scheduleForm, setScheduleForm] = useState<ScheduleSettings | null>(null);
  const [showSmtpPassword, setShowSmtpPassword] = useState(false);
  const [savedJsonFileName, setSavedJsonFileName] = useState<string | null>(null);
  const session = getStoredSession();

  const settingsQuery = useQuery({
    queryKey: ["settings"],
    queryFn: getSettings,
  });

  const serviceAccountLabel =
    settingsQuery.data?.serviceAccountPath ??
    (isDesktop ? "chưa cấu hình" : getServiceAccountLabel());
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
    queryFn: async () => {
      if (!getScheduleSettings) {
        throw new Error("Desktop scheduler chưa khả dụng.");
      }
      return getScheduleSettings();
    },
    enabled: isDesktop && !!getScheduleSettings,
  });

  useEffect(() => {
    if (scheduleQuery.data) {
      setScheduleForm(scheduleQuery.data);
    }
  }, [scheduleQuery.data]);

  async function handleRefresh() {
    setIsRefreshing(true);
    setMessageKind("info");
    setMessage(
      hasCustomServiceAccount
        ? "Đang tải dữ liệu từ Google Play API..."
        : "Đang tải lại snapshot public...",
    );
    try {
      invalidateDataCache?.();
      if (hasCustomServiceAccount && refreshLiveData) {
        await refreshLiveData();
      }
      await queryClient.invalidateQueries({ queryKey: ["stats"] });
      await queryClient.invalidateQueries({ queryKey: ["reviews"] });
      await queryClient.invalidateQueries({ queryKey: ["settings"] });
      await queryClient.fetchQuery({ queryKey: ["stats"], queryFn: getStats });
      setMessageKind("success");
      setMessage(hasCustomServiceAccount ? "Đã tải lại dữ liệu live." : "Đã tải lại snapshot.");
    } catch (error) {
      setMessageKind("error");
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsRefreshing(false);
    }
  }

  async function handleServiceAccountFile(file: File | null) {
    if (!file || !setServiceAccountFromRawJson) return;
    setIsSavingFile(true);
    setMessageKind("info");
    setMessage("Đang lưu file Service Account...");
    try {
      const raw = await file.text();
      const updated = await setServiceAccountFromRawJson(raw);
      if (updated && typeof updated === "object" && "packageName" in updated) {
        queryClient.setQueryData<AppSettings>(["settings"], updated as AppSettings);
      } else {
        queryClient.setQueryData<AppSettings>(["settings"], (current) => ({
          packageName: current?.packageName ?? PACKAGE_NAME,
          serviceAccountPath: getServiceAccountLabel(),
        }));
      }
      setSavedJsonFileName(file.name);
      await queryClient.invalidateQueries({ queryKey: ["settings"] });
      await queryClient.invalidateQueries({ queryKey: ["stats"] });
      await queryClient.invalidateQueries({ queryKey: ["reviews"] });
      await settingsQuery.refetch();
      setMessageKind("success");
      setMessage(
        isDesktop
          ? `Đã lưu “${file.name}” trên máy. Lần sau không cần upload lại.`
          : `Đã lưu “${file.name}” trên trình duyệt này.`,
      );
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
    if (!setServiceAccountJson) return;
    setIsSavingFile(true);
    setMessageKind("info");
    setMessage(isDesktop ? "Đang xóa Service Account local..." : "Đang chuyển về snapshot public...");
    try {
      const updated = await setServiceAccountJson(null);
      if (updated && typeof updated === "object" && "packageName" in updated) {
        queryClient.setQueryData<AppSettings>(["settings"], updated as AppSettings);
      } else {
        queryClient.setQueryData<AppSettings>(["settings"], (current) =>
          current
            ? { ...current, serviceAccountPath: isDesktop ? null : "snapshot" }
            : current,
        );
      }
      setSavedJsonFileName(null);
      await queryClient.invalidateQueries({ queryKey: ["settings"] });
      await queryClient.invalidateQueries({ queryKey: ["stats"] });
      await queryClient.invalidateQueries({ queryKey: ["reviews"] });
      await settingsQuery.refetch();
      setMessageKind("success");
      setMessage(
        isDesktop
          ? "Đã xóa Service Account local. Upload lại khi cần dùng API."
          : "Đã chuyển về snapshot public mặc định.",
      );
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

  function handleLogout() {
    logout();
    queryClient.clear();
    onLogout();
  }

  async function handleSaveSchedule() {
    if (!scheduleForm || !setScheduleSettings) return;
    setIsSavingSchedule(true);
    setMessageKind("info");
    setMessage("Đang lưu cấu hình báo cáo tự động...");
    try {
      const saved = await setScheduleSettings(scheduleForm);
      setScheduleForm(saved);
      await scheduleQuery.refetch();
      setMessageKind("success");
      setMessage("Đã lưu cấu hình báo cáo tự động.");
    } catch (error) {
      setMessageKind("error");
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSavingSchedule(false);
    }
  }

  async function handleRunNow() {
    if (!runDailyReportNow) return;
    setIsRunningNow(true);
    setMessageKind("info");
    setMessage("Đang sync dữ liệu và gửi mail báo cáo...");
    try {
      const updated = await runDailyReportNow();
      setScheduleForm(updated);
      await scheduleQuery.refetch();
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
    if (!setAutostartEnabled || !scheduleForm) return;
    setIsSavingSchedule(true);
    setMessageKind("info");
    setMessage(enabled ? "Đang bật khởi động cùng hệ thống..." : "Đang tắt khởi động cùng hệ thống...");
    try {
      const updated = await setAutostartEnabled(enabled);
      setScheduleForm(updated);
      await scheduleQuery.refetch();
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
      {isDesktop ? (
        <div className="rounded-2xl border border-sky-500/30 bg-sky-500/10 px-4 py-4 text-sm text-sky-100">
          <p className="font-medium text-sky-50">Desktop only (Windows & macOS)</p>
          <p className="mt-1">
            Toàn bộ cấu hình nằm trong Settings và lưu local trên máy — không cần file{" "}
            <code className="text-sky-200">.env</code>. Upload Service Account một lần, điền Gmail /
            lịch gửi, rồi Lưu.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-4 text-sm text-amber-100">
          <p className="font-medium text-amber-50">Chế độ xem web</p>
          <p className="mt-1">
            Sản phẩm chính là app desktop (Windows & macOS) để chạy nền và gửi mail tự động. Web chỉ
            dùng tạm khi dev — không có lịch gửi báo cáo.
          </p>
        </div>
      )}

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
            disabled={isRefreshing || (isDesktop && !hasCustomServiceAccount)}
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
            {isDesktop ? "Xóa file đã lưu" : "Dùng snapshot mặc định"}
          </button>
        </div>
      </section>

      {isDesktop && scheduleForm ? (
        <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-lg font-medium text-white">2. Báo cáo tự động</h2>
          <p className="mt-2 text-sm text-slate-400">
            App chạy nền trên Windows / macOS, sync theo giờ cấu hình (Asia/Ho_Chi_Minh) và gửi báo
            cáo ngày hôm trước qua Gmail SMTP. Cấu hình bên dưới được lưu local trên máy này.
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
              Lưu cấu hình
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

        {!isDesktop ? (
        <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-lg font-medium text-white">Tài khoản</h2>
          <p className="mt-2 text-sm text-slate-400">
            Phiên đăng nhập được lưu trên trình duyệt / máy này để lần sau không cần nhập lại.
          </p>
          <div className="mt-5 rounded-xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-slate-400">
            <p>
              <span className="text-slate-300">Đang đăng nhập:</span>{" "}
              {session?.username ?? "—"}
            </p>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="mt-4 inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-200 hover:bg-white/5"
          >
            <LogOut size={16} />
            Đăng xuất
          </button>
        </section>
        ) : null}
      </div>
    </div>
  );
}
