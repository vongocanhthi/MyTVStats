import { AlertTriangle, Info } from "lucide-react";
import type { StatsOverview } from "../lib/types";

interface ScopeBannerProps {
  stats: StatsOverview;
}

export function ScopeBanner({ stats }: ScopeBannerProps) {
  return (
    <div className="flex gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-4 text-sm text-amber-100">
      <AlertTriangle className="mt-0.5 shrink-0" size={18} />
      <div>
        <p className="font-medium text-amber-50">Realtime 7 ngày từ Play API</p>
        <p className="mt-1 text-amber-100/90">
          Không lưu database. Mỗi lần tải trang, app gọi Google Play API và tính thống kê{" "}
          <strong>hôm nay</strong> / <strong>7 ngày</strong>. Số liệu không phải rating tổng trên Store.
        </p>
        <p className="mt-2 flex items-start gap-1.5 text-amber-100/80">
          <Info size={14} className="mt-0.5 shrink-0" />
          Đang hiển thị {stats.apiReviewCount.toLocaleString("vi-VN")} review từ API.
        </p>
      </div>
    </div>
  );
}
