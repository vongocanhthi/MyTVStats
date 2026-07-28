import {
  BarChart3,
  FileText,
  MessageSquare,
  Settings,
  Star,
} from "lucide-react";
import mytvLogo from "../assets/mytv-logo.png";
import type { TabId } from "../lib/types";
import { cn } from "../lib/utils";

interface LayoutProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  children: React.ReactNode;
}

const tabs: { id: TabId; label: string; icon: typeof Star }[] = [
  { id: "dashboard", label: "Dashboard", icon: BarChart3 },
  { id: "reviews", label: "Reviews", icon: MessageSquare },
  { id: "report", label: "Báo cáo", icon: FileText },
  { id: "settings", label: "Settings", icon: Settings },
];

export function Layout({ activeTab, onTabChange, children }: LayoutProps) {
  return (
    <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-6 py-6">
      <header className="mb-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <img
            src={mytvLogo}
            alt="MyTV"
            className="h-12 w-auto shrink-0 drop-shadow-md"
            width={54}
            height={48}
          />
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-sky-400">
              MyTV Stats
            </p>
            <h1 className="mt-1 text-2xl font-semibold text-white">
              Google Play Review Analytics
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              vn.mytvnet.mobileb2c
            </p>
          </div>
        </div>
        <nav className="flex rounded-2xl border border-white/10 bg-white/5 p-1">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => onTabChange(id)}
              className={cn(
                "flex items-center gap-2 rounded-xl px-4 py-2 text-sm transition",
                activeTab === id
                  ? "bg-sky-500 text-white shadow-lg shadow-sky-500/20"
                  : "text-slate-300 hover:bg-white/5 hover:text-white",
              )}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </nav>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
