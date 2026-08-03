import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";
import { Layout } from "./components/Layout";
import { LoginDialog } from "./features/auth/LoginDialog";
import { Dashboard } from "./features/dashboard/Dashboard";
import { ReportPanel } from "./features/report/ReportPanel";
import { ReviewsTable } from "./features/reviews/ReviewsTable";
import { SettingsPanel } from "./features/settings/SettingsPanel";
import { isAuthenticated } from "./lib/auth";
import { isTauriRuntime } from "./lib/runtime";
import type { TabId } from "./lib/types";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    },
  },
});

function AppContent() {
  const [activeTab, setActiveTab] = useState<TabId>("dashboard");
  const [authed, setAuthed] = useState(() => isTauriRuntime() || isAuthenticated());

  useEffect(() => {
    if (!isTauriRuntime()) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;

    void listen<string>("navigate-tab", (event) => {
      const tab = event.payload;
      if (
        tab === "dashboard" ||
        tab === "reviews" ||
        tab === "report" ||
        tab === "settings"
      ) {
        setActiveTab(tab);
      }
    }).then((fn) => {
      if (disposed) fn();
      else unlisten = fn;
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  if (!authed) {
    return <LoginDialog onSuccess={() => setAuthed(true)} />;
  }

  return (
    <Layout activeTab={activeTab} onTabChange={setActiveTab}>
      {activeTab === "dashboard" ? <Dashboard /> : null}
      {activeTab === "reviews" ? <ReviewsTable /> : null}
      {activeTab === "report" ? <ReportPanel /> : null}
      {activeTab === "settings" ? <SettingsPanel /> : null}
    </Layout>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppContent />
    </QueryClientProvider>
  );
}
