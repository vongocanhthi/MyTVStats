import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { Layout } from "./components/Layout";
import { LoginDialog } from "./features/auth/LoginDialog";
import { Dashboard } from "./features/dashboard/Dashboard";
import { ReviewsTable } from "./features/reviews/ReviewsTable";
import { SettingsPanel } from "./features/settings/SettingsPanel";
import { isAuthenticated } from "./lib/auth";
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
  const [authed, setAuthed] = useState(() => isAuthenticated());

  if (!authed) {
    return <LoginDialog onSuccess={() => setAuthed(true)} />;
  }

  return (
    <Layout activeTab={activeTab} onTabChange={setActiveTab}>
      {activeTab === "dashboard" ? <Dashboard /> : null}
      {activeTab === "reviews" ? <ReviewsTable /> : null}
      {activeTab === "settings" ? (
        <SettingsPanel onLogout={() => setAuthed(false)} />
      ) : null}
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
