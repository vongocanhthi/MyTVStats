import type { ReactNode } from "react";
import { cn } from "../lib/utils";

interface StatCardProps {
  title: string;
  value: string;
  hint?: string;
  icon?: ReactNode;
  accent?: "blue" | "green" | "amber" | "violet";
}

const accentMap = {
  blue: "from-sky-500/20 to-sky-500/5 border-sky-500/20",
  green: "from-emerald-500/20 to-emerald-500/5 border-emerald-500/20",
  amber: "from-amber-500/20 to-amber-500/5 border-amber-500/20",
  violet: "from-violet-500/20 to-violet-500/5 border-violet-500/20",
};

export function StatCard({
  title,
  value,
  hint,
  icon,
  accent = "blue",
}: StatCardProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border bg-gradient-to-br p-5 shadow-lg shadow-black/20",
        accentMap[accent],
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-slate-400">{title}</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight text-white">
            {value}
          </p>
          {hint ? <p className="mt-2 text-xs text-slate-400">{hint}</p> : null}
        </div>
        {icon ? (
          <div className="rounded-xl bg-white/5 p-2 text-slate-200">{icon}</div>
        ) : null}
      </div>
    </div>
  );
}
