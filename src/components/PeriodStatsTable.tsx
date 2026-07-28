import type { PeriodStats } from "../lib/types";
import { formatNumber, formatPercent, formatRating } from "../lib/utils";

interface PeriodStatsTableProps {
  title: string;
  subtitle: string;
  stats: PeriodStats;
}

export function PeriodStatsTable({ title, subtitle, stats }: PeriodStatsTableProps) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <h3 className="text-lg font-medium text-white">{title}</h3>
      <p className="mt-1 text-xs text-slate-400">{subtitle}</p>

      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="text-slate-400">
            <tr>
              <th className="px-3 py-2 font-medium">Chỉ số</th>
              <th className="px-3 py-2 font-medium">Giá trị</th>
            </tr>
          </thead>
          <tbody className="text-slate-200">
            <tr className="border-t border-white/5">
              <td className="px-3 py-3">Reviews</td>
              <td className="px-3 py-3 font-medium text-white">
                {formatNumber(stats.reviewCount)}
              </td>
            </tr>
            <tr className="border-t border-white/5">
              <td className="px-3 py-3">Rating trung bình</td>
              <td className="px-3 py-3 font-medium text-white">
                {formatRating(stats.averageRating)}
              </td>
            </tr>
            <tr className="border-t border-white/5">
              <td className="px-3 py-3">Tỷ lệ đã reply</td>
              <td className="px-3 py-3 font-medium text-white">
                {formatPercent(stats.replyRate)}
              </td>
            </tr>
            {stats.ratingDistribution.map((bucket) => (
              <tr key={bucket.stars} className="border-t border-white/5">
                <td className="px-3 py-3">{bucket.stars}★</td>
                <td className="px-3 py-3">
                  {formatNumber(bucket.count)}
                  <span className="ml-2 text-slate-400">
                    ({bucket.percentage.toFixed(1)}%)
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
