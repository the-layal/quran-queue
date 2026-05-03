import { useState } from "react";
import { CalendarDays, CheckCircle2, Circle, Loader2, AlertCircle, RefreshCw, Plus } from "lucide-react";
import { useLocation } from "wouter";
import AppShell from "../../components/AppShell";
import GuestBanner from "../../components/GuestBanner";
import LogReviewModal from "../../components/LogReviewModal";
import { useTodayPlan } from "../../hooks/useTracker";
import { useTrackerStorage } from "../../context/useTrackerStorage";

function DailyPlanContent() {
  const { plan, loading, error, reload } = useTodayPlan();
  const { storage } = useTrackerStorage();
  const [busy, setBusy] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [, navigate] = useLocation();

  const completeRef = async (reference: string, vibeScale: number) => {
    setBusy(true);
    try {
      await storage.completeItem(reference, vibeScale);
      reload();
    } finally {
      setBusy(false);
    }
  };

  const generate = async () => {
    setBusy(true);
    try {
      await storage.createOrUpdateTodayPlan(5);
      reload();
    } finally {
      setBusy(false);
    }
  };

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

  if (!plan) {
    return (
      <div className="text-center py-12 text-muted-foreground max-w-2xl mx-auto px-4">
        <CalendarDays className="w-12 h-12 mx-auto mb-3 opacity-30" />
        <p className="text-sm font-medium mb-1">No plan for today</p>
        <p className="text-xs mb-5">Generate a daily plan to start reviewing.</p>
        <button
          onClick={generate}
          disabled={busy}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Generate plan
        </button>
      </div>
    );
  }

  const completed = plan.completedItems ?? [];
  const planned = plan.plannedItems ?? [];
  const completedCount = completed.length;
  const total = planned.length;
  const pct = total > 0 ? Math.round((completedCount / total) * 100) : 100;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Today's Plan</h1>
        <div className="flex items-center gap-2">
          {busy && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
          <button onClick={reload} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-colors" aria-label="Refresh">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">Progress</span>
          <span className="text-sm tabular-nums text-muted-foreground">{completedCount} / {total}</span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Bandwidth: {plan.bandwidth} pages · {plan.extraRevisions?.length ?? 0} extra revisions
        </p>
      </div>

      {total === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <CalendarDays className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium mb-1">Nothing in your plan today</p>
          <p className="text-xs mb-5">Log a review or generate a plan with more bandwidth.</p>
          <div className="flex flex-col sm:flex-row gap-2 justify-center">
            <button onClick={() => setAddOpen(true)}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors">
              <Plus className="w-4 h-4" />
              Log a review
            </button>
            <button onClick={() => navigate("/track/library")}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-muted transition-colors">
              View library
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {planned.map((reference) => {
            const isDone = completed.includes(reference);
            return (
              <div key={reference}
                className={`flex items-center gap-3 bg-card border border-border rounded-xl px-4 py-3 transition-colors ${isDone ? "opacity-60" : ""}`}>
                <span className="flex-shrink-0 text-muted-foreground">
                  {isDone ? <CheckCircle2 className="w-5 h-5 text-emerald-500" /> : <Circle className="w-5 h-5" />}
                </span>
                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-medium truncate ${isDone ? "line-through text-muted-foreground" : ""}`}>
                    {reference}
                  </div>
                </div>
                {!isDone && (
                  <button onClick={() => completeRef(reference, 4)} disabled={busy}
                    className="text-xs px-2.5 py-1 rounded-lg border border-border hover:bg-muted transition-colors text-muted-foreground disabled:opacity-50">
                    Mark done
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {addOpen && <LogReviewModal onClose={() => setAddOpen(false)} onSuccess={reload} />}
    </div>
  );
}

export default function DailyPlanPage() {
  return (
    <AppShell centerContent={<span className="text-sm font-medium text-muted-foreground">Daily Plan</span>}>
      <main className="flex-1">
        <GuestBanner />
        <DailyPlanContent />
      </main>
    </AppShell>
  );
}
