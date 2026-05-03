import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import QuranPage from "@/pages/QuranPage";
import AnalyticsPage from "@/pages/AnalyticsPage";
import Dashboard from "@/pages/track/Dashboard";
import DailyPlanPage from "@/pages/track/DailyPlan";
import LibraryPage from "@/pages/track/Library";
import SurahDetailPage from "@/pages/track/SurahDetail";
import HistoryPage from "@/pages/track/HistoryPage";
import SettingsPage from "@/pages/track/SettingsPage";
import NotFound from "@/pages/not-found";
import { Toaster } from "@/components/ui/toaster";
import { TrackerStorageProvider } from "@/context/TrackerStorageContext";
import { queryClient } from "@/lib/queryClient";

function Router() {
  return (
    <Switch>
      <Route path="/" component={QuranPage} />
      <Route path="/analytics" component={AnalyticsPage} />
      <Route path="/track" component={Dashboard} />
      <Route path="/track/plan" component={DailyPlanPage} />
      <Route path="/track/library" component={LibraryPage} />
      <Route path="/track/library/:surah" component={SurahDetailPage} />
      <Route path="/track/history" component={HistoryPage} />
      <Route path="/track/settings" component={SettingsPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
      <QueryClientProvider client={queryClient}>
        <TrackerStorageProvider>
          <Router />
          <Toaster />
        </TrackerStorageProvider>
      </QueryClientProvider>
    </WouterRouter>
  );
}

export default App;
