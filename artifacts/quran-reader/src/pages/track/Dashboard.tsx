import { useState } from "react";
import { BookOpen, Calendar, Flame, Loader2, AlertCircle, Plus } from "lucide-react";
import { useLocation } from "wouter";
import AppShell from "../../components/AppShell";
import QuranGrid from "../../components/QuranGrid";
import GuestBanner from "../../components/GuestBanner";
import LogReviewModal from "../../components/LogReviewModal";
import { useLogs, useStats } from "../../hooks/useTracker";

function StatCard({ icon: Icon, label, value }: { icon: typeof BookOpen; label: string; value: string | number }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-lg font-semibold tabular-nums">{value}</div>
      </div>
    </div>
  );
}

function DashboardContent() {
  const { stats, loading, error, reload } = useStats();
  const { logs } = useLogs();
  const [logOpen, setLogOpen] = useState(false);
  const [, navigate] = useLocation();

  if (loading) {
    return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 px-4">
        <AlertCircle className="w-8 h-8 text-destructive" />
        <p className="text-sm text-destructive text-center">{error}</p>
        <button onClick={reload} className="text-sm text-primary underline">Try again</button>
      </div>
    );
  }
  if (!stats) return null;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <button
          onClick={() => setLogOpen(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Log Review
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard icon={BookOpen} label="Memorized pages" value={stats.memorizedPages} />
        <StatCard icon={Calendar} label="Due today" value={stats.dueToday} />
        <StatCard icon={Flame} label="Day streak" value={stats.dayStreak} />
      </div>

      <QuranGrid logs={logs} />

      <button
        onClick={() => navigate("/track/plan")}
        className="w-full px-4 py-3 rounded-xl border border-border text-sm font-medium hover:bg-muted transition-colors"
      >
        Open today&apos;s plan
      </button>

      {logOpen && <LogReviewModal onClose={() => setLogOpen(false)} onSuccess={reload} />}
    </div>
  );
}

export default function DashboardPage() {
  return (
    <AppShell centerContent={<span className="text-sm font-medium text-muted-foreground">Dashboard</span>}>
      <main className="flex-1">
        <GuestBanner />
        <DashboardContent />
      </main>
    </AppShell>
  );
}
