import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { useState } from "react";
import { PeriodStatsTable } from "../../components/PeriodStatsTable";
import { ScopeBanner } from "../../components/ScopeBanner";
import { getStats } from "../../lib/api";
import { cn, formatDate, formatDateMs, formatNumber, formatRating } from "../../lib/utils";

export function Dashboard() {
  const queryClient = useQueryClient();
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [lastSyncedAtMs, setLastSyncedAtMs] = useState<number | null>(null);
  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["stats"],
    queryFn: getStats,
    refetchInterval: 60_000,
  });

  async function handleSync() {
    setSyncMessage("Đang sync reviews 7 ngày từ Play API...");
    try {
      await queryClient.invalidateQueries({ queryKey: ["reviews"] });
      const result = await refetch();
      if (result.error) {
        setSyncMessage(
          result.error instanceof Error ? result.error.message : String(result.error),
        );
        return;
      }
      setLastSyncedAtMs(Date.now());
      setSyncMessage("Đã sync xong.");
    } catch (syncError) {
      setSyncMessage(
        syncError instanceof Error ? syncError.message : String(syncError),
      );
    }
  }

  function SyncButton({ className }: { className?: string }) {
    return (
      <button
        type="button"
        onClick={() => {
          void handleSync();
        }}
        disabled={isFetching}
        className={cn(
          "inline-flex items-center gap-2 rounded-xl bg-sky-500 px-4 py-2.5 text-sm font-medium text-white",
          "hover:bg-sky-400 disabled:opacity-50",
          className,
        )}
      >
        <RefreshCw size={16} className={isFetching ? "animate-spin" : ""} />
        {isFetching ? "Đang sync..." : "Sync ngay"}
      </button>
    );
  }

  const lastFetchedLabel = lastSyncedAtMs
    ? formatDateMs(lastSyncedAtMs)
    : formatDate(data?.lastSyncAt);

  const toolbar = (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
      <div className="min-w-0 text-sm text-slate-300">
        <p className="font-medium text-white">Dữ liệu realtime 7 ngày</p>
        <p className="mt-0.5 text-slate-400">
          Lần lấy gần nhất: {lastFetchedLabel}
          {syncMessage ? ` · ${syncMessage}` : ""}
        </p>
      </div>
      <SyncButton />
    </div>
  );

  if (isLoading && !data) {
    return (
      <div className="space-y-4">
        {toolbar}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-slate-300">
          Đang tải thống kê...
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="space-y-4">
        {toolbar}
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-8 text-red-200">
          Không thể tải thống kê: {String(error)}
        </div>
      </div>
    );
  }

  if (!data || data.totalReviews === 0) {
    return (
      <div className="space-y-4">
        {toolbar}
        <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 px-4 py-4 text-sm text-amber-100">
          <p className="font-medium">Realtime 7-day snapshot</p>
          <p className="mt-1">
            Bấm <strong>Sync ngay</strong> để lấy reviews 7 ngày từ Play API.
          </p>
        </div>
        <div className="rounded-2xl border border-dashed border-white/15 bg-white/5 p-10 text-center">
          <h2 className="text-xl font-semibold text-white">Chưa có dữ liệu review</h2>
          <p className="mt-3 text-slate-400">
            Kiểm tra Service Account / quyền Play API, rồi bấm Sync ngay.
          </p>
          <div className="mt-5 flex justify-center">
            <SyncButton />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("space-y-6", isFetching && "opacity-90")}>
      {toolbar}
      <ScopeBanner stats={data} />

      <div className="grid gap-6 xl:grid-cols-2">
        <PeriodStatsTable
          title="Thống kê 1 ngày (hôm nay)"
          subtitle="Review tạo/sửa trong ngày hôm nay (UTC)"
          stats={data.today}
        />
        <PeriodStatsTable
          title="Thống kê 7 ngày"
          subtitle="Review tạo/sửa trong 7 ngày gần nhất"
          stats={data.last7Days}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <h3 className="mb-1 text-lg font-medium text-white">Phân bố sao (7 ngày)</h3>
          <p className="mb-4 text-xs text-slate-400">Trong cửa sổ 7 ngày API</p>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.ratingDistribution}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="stars" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip
                  contentStyle={{
                    background: "#111827",
                    border: "1px solid #334155",
                    borderRadius: 12,
                  }}
                />
                <Bar dataKey="count" fill="#38bdf8" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <h3 className="mb-1 text-lg font-medium text-white">Trend theo ngày (7 ngày)</h3>
          <p className="mb-4 text-xs text-slate-400">Số review và rating TB mỗi ngày</p>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data.dailyTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="day" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="left" stroke="#94a3b8" />
                <YAxis yAxisId="right" orientation="right" stroke="#94a3b8" domain={[1, 5]} />
                <Tooltip
                  contentStyle={{
                    background: "#111827",
                    border: "1px solid #334155",
                    borderRadius: 12,
                  }}
                />
                <Bar yAxisId="left" dataKey="count" fill="#818cf8" radius={[8, 8, 0, 0]} />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="averageRating"
                  stroke="#fbbf24"
                  strokeWidth={2}
                  dot
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <h3 className="mb-1 text-lg font-medium text-white">Top phiên bản (7 ngày)</h3>
        <p className="mb-4 text-xs text-slate-400">Version có review trong 7 ngày qua</p>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-slate-400">
              <tr>
                <th className="px-3 py-2 font-medium">Version</th>
                <th className="px-3 py-2 font-medium">Reviews</th>
                <th className="px-3 py-2 font-medium">Avg rating</th>
              </tr>
            </thead>
            <tbody>
              {data.topVersions.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-3 py-6 text-slate-400">
                    Không có dữ liệu version trong phạm vi này.
                  </td>
                </tr>
              ) : (
                data.topVersions.map((version) => (
                  <tr key={version.versionName} className="border-t border-white/5 text-slate-200">
                    <td className="px-3 py-3">{version.versionName}</td>
                    <td className="px-3 py-3">{formatNumber(version.count)}</td>
                    <td className="px-3 py-3">{formatRating(version.averageRating)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
