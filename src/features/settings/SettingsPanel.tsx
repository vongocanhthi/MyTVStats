import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LogOut, RefreshCw } from "lucide-react";
import { useRef, useState } from "react";
import {
  getSettings,
  getStats,
  invalidateDataCache,
  refreshLiveData,
  setServiceAccountFromRawJson,
  setServiceAccountJson,
} from "../../lib/api";
import { getStoredSession, logout } from "../../lib/auth";
import { getServiceAccountLabel } from "../../lib/service-account-store";
import { PACKAGE_NAME } from "../../lib/play-console-links";
import { formatDate } from "../../lib/utils";

interface SettingsPanelProps {
  onLogout: () => void;
}

export function SettingsPanel({ onLogout }: SettingsPanelProps) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSavingFile, setIsSavingFile] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageKind, setMessageKind] = useState<"info" | "success" | "error">("info");
  const session = getStoredSession();

  const settingsQuery = useQuery({
    queryKey: ["settings"],
    queryFn: getSettings,
  });

  const serviceAccountLabel =
    settingsQuery.data?.serviceAccountPath ?? getServiceAccountLabel();
  const hasCustomServiceAccount = serviceAccountLabel.startsWith("custom");

  const statsQuery = useQuery({
    queryKey: ["stats"],
    queryFn: getStats,
  });

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
      setServiceAccountFromRawJson(raw);
      await queryClient.invalidateQueries({ queryKey: ["settings"] });
      await queryClient.invalidateQueries({ queryKey: ["stats"] });
      await queryClient.invalidateQueries({ queryKey: ["reviews"] });
      await settingsQuery.refetch();
      setMessageKind("success");
      setMessage("Đã lưu file custom. Bấm Tải lại để lấy dữ liệu mới từ Google Play API.");
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
    setMessage("Đang chuyển về snapshot public...");
    try {
      setServiceAccountJson(null);
      await queryClient.invalidateQueries({ queryKey: ["settings"] });
      await queryClient.invalidateQueries({ queryKey: ["stats"] });
      await queryClient.invalidateQueries({ queryKey: ["reviews"] });
      await settingsQuery.refetch();
      setMessageKind("success");
      setMessage("Đã chuyển về snapshot public mặc định.");
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

  const messageStyles =
    messageKind === "error"
      ? "border-rose-500/20 bg-rose-500/10 text-rose-100"
      : messageKind === "success"
        ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-100"
        : "border-sky-500/20 bg-sky-500/10 text-sky-100";

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-4 text-sm text-amber-100">
        <p className="font-medium text-amber-50">Chế độ web</p>
        <p className="mt-1">
          Mặc định đọc snapshot JSON public. Nếu cần dữ liệu live, upload file Service Account JSON
          — file được lưu trên trình duyệt này.
        </p>
      </div>

      {message ? (
        <div className={`rounded-2xl border px-4 py-3 text-sm ${messageStyles}`}>
          {isRefreshing || isSavingFile ? (
            <span className="inline-flex items-center gap-2">
              <RefreshCw size={14} className="animate-spin" />
              {message}
            </span>
          ) : (
            message
          )}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-lg font-medium text-white">Dữ liệu reviews</h2>
          <p className="mt-2 text-sm text-slate-400">
            Cửa sổ <strong className="text-slate-200">7 ngày</strong>. Snapshot public hoặc live API
            khi đã upload Service Account.
          </p>

          <div className="mt-5 space-y-3">
            <div className="rounded-xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-slate-400">
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
                <span className="text-slate-300">Nguồn dữ liệu:</span>{" "}
                {serviceAccountLabel}
              </p>
            </div>

            <div className="rounded-xl border border-white/10 bg-slate-950/40 px-4 py-4 text-sm text-slate-300">
              <p className="font-medium text-white">Service Account custom (tùy chọn)</p>
              <p className="mt-1 text-slate-400">
                Upload file JSON từ Google Cloud để lấy dữ liệu live trực tiếp. Để trống / bấm mặc định
                để dùng snapshot public.
              </p>
              <label className="mt-4 block text-sm text-slate-300">
                File JSON Service Account
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
                    void handleUseDefaultAccount();
                  }}
                  disabled={isSavingFile}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-200 hover:bg-white/5 disabled:opacity-50"
                >
                  Dùng snapshot mặc định
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                void handleRefresh();
              }}
              disabled={isRefreshing}
              className="inline-flex items-center gap-2 rounded-xl bg-sky-500 px-4 py-2 text-sm font-medium text-white hover:bg-sky-400 disabled:opacity-50"
            >
              <RefreshCw size={16} className={isRefreshing ? "animate-spin" : ""} />
              {isRefreshing ? "Đang tải lại..." : hasCustomServiceAccount ? "Tải lại dữ liệu" : "Tải lại snapshot"}
            </button>
          </div>
        </section>

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
      </div>
    </div>
  );
}
