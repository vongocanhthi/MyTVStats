import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LogOut, RefreshCw } from "lucide-react";
import { useState } from "react";
import { getSettings, getStats } from "../../lib/api";
import { getStoredSession, logout } from "../../lib/auth";
import { PACKAGE_NAME } from "../../lib/play-console-links";
import { isTauriRuntime } from "../../lib/runtime";
import { formatDate } from "../../lib/utils";

interface SettingsPanelProps {
  onLogout: () => void;
}

export function SettingsPanel({ onLogout }: SettingsPanelProps) {
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageKind, setMessageKind] = useState<"info" | "success" | "error">("info");
  const inTauri = isTauriRuntime();
  const session = getStoredSession();

  const settingsQuery = useQuery({
    queryKey: ["settings"],
    queryFn: getSettings,
  });

  const statsQuery = useQuery({
    queryKey: ["stats"],
    queryFn: getStats,
  });

  async function handleRefresh() {
    setIsRefreshing(true);
    setMessageKind("info");
    setMessage("Đang tải lại snapshot public...");
    try {
      await queryClient.invalidateQueries({ queryKey: ["stats"] });
      await queryClient.invalidateQueries({ queryKey: ["reviews"] });
      await queryClient.fetchQuery({ queryKey: ["stats"], queryFn: getStats });
      setMessageKind("success");
      setMessage("Đã tải lại snapshot.");
    } catch (error) {
      setMessageKind("error");
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsRefreshing(false);
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
      {!inTauri ? (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-4 text-sm text-amber-100">
          <p className="font-medium text-amber-50">Chế độ web public — GitHub Pages static</p>
          <p className="mt-1">
            Site đọc snapshot JSON public đã build sẵn, không gọi Google Play API trực tiếp trên client.
          </p>
        </div>
      ) : null}

      {message ? (
        <div className={`rounded-2xl border px-4 py-3 text-sm ${messageStyles}`}>
          {isRefreshing ? (
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
          <h2 className="text-lg font-medium text-white">Snapshot dữ liệu</h2>
          <p className="mt-2 text-sm text-slate-400">
            Web public dùng snapshot reviews trong cửa sổ <strong className="text-slate-200">7 ngày</strong>.
            Snapshot được sinh trước khi deploy và phát hành qua GitHub Pages.
          </p>

          <div className="mt-5 space-y-3">
            <div className="rounded-xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-slate-400">
              <p>
                <span className="text-slate-300">Package:</span>{" "}
                {settingsQuery.data?.packageName ?? PACKAGE_NAME}
              </p>
              <p className="mt-1">
                <span className="text-slate-300">Snapshot cập nhật lúc:</span>{" "}
                {formatDate(statsQuery.data?.lastSyncAt)}
              </p>
              <p className="mt-1">
                <span className="text-slate-300">Reviews (7 ngày):</span>{" "}
                {statsQuery.data?.apiReviewCount?.toLocaleString("vi-VN") ?? "—"}
              </p>
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
              {isRefreshing ? "Đang tải lại..." : "Tải lại snapshot"}
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
