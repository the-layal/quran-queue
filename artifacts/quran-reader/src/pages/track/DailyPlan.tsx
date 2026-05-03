import { useState } from "react";
import { CalendarDays, CheckCircle2, Circle, Loader2, AlertCircle, RefreshCw, Plus } from "lucide-react";
import { useLocation } from "wouter";
import AppShell from "../../components/AppShell";
import AuthRequired from "../../components/AuthRequired";
import LogReviewModal from "../../components/LogReviewModal";
import { useTodayPlan, postLog } from "../../hooks/useTracker";
import type { PlanItem } from "../../hooks/useTracker";

const QUALITY_LABELS: Record<number, string> = {
  0: "0 — Complete blackout",
  1: "1 — Incorrect, familiar",
  2: "2 — Incorrect, easy recall",
  3: "3 — Correct, very difficult",
  4: "4 — Correct, hesitated",
  5: "5 — Perfect recall",
};

function LogModal({ item, onClose, onLogged }: { item: PlanItem; onClose: () => void; onLogged: () => void }) {
  const [quality, setQuality] = useState(4);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await postLog({ surah: item.surah, ayahStart: item.ayahStart, ayahEnd: item.ayahEnd, quality, notes: notes || undefined });
      onLogged();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-x-4 bottom-0 z-50 bg-card border border-border rounded-t-2xl p-6 shadow-2xl max-w-sm mx-auto">
        <h2 className="text-base font-semibold mb-1">Log Review</h2>
        <p className="text-xs text-muted-foreground mb-4">Surah {item.surah} · {item.ayahStart}–{item.ayahEnd}</p>

        {error && <p className="text-xs text-destructive mb-3">{error}</p>}

        <div className="mb-4">
          <label className="text-xs font-medium text-muted-foreground block mb-2">Quality (0–5)</label>
          <div className="flex gap-1.5">
            {[0, 1, 2, 3, 4, 5].map((q) => (
              <button key={q} onClick={() => setQuality(q)}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition-colors ${quality === q ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:bg-muted"}`}>
                {q}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-1.5">{QUALITY_LABELS[quality]}</p>
        </div>

        <div className="mb-4">
          <label className="text-xs font-medium text-muted-foreground block mb-1.5">Notes (optional)</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
            className="w-full text-sm bg-muted rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary resize-none"
            placeholder="Any notes about this review…" />
        </div>

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-muted transition-colors">Cancel</button>
          <button onClick={submit} disabled={submitting}
            className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors">
            {submitting ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </>
  );
}

function DailyPlanContent() {
  const { plan, loading, error, reload, patchPlan } = useTodayPlan();
  const [saving, setSaving] = useState(false);
  const [logItem, setLogItem] = useState<PlanItem | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [, navigate] = useLocation();

  const toggleItem = async (index: number) => {
    if (!plan) return;
    const updated = plan.items.map((item, i) => i === index ? { ...item, completed: !item.completed } : item);
    const allDone = updated.every((i) => i.completed);
    setSaving(true);
    try {
      await patchPlan(plan.id, { items: updated, completed: allDone });
    } finally {
      setSaving(false);
    }
  };

  const markItemDone = async (index: number) => {
    if (!plan) return;
    const updated = plan.items.map((item, i) => i === index ? { ...item, completed: true } : item);
    const allDone = updated.every((i) => i.completed);
    await patchPlan(plan.id, { items: updated, completed: allDone });
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

  if (!plan) return null;

  const completedCount = plan.items.filter((i) => i.completed).length;
  const total = plan.items.length;
  const pct = total > 0 ? Math.round((completedCount / total) * 100) : 100;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Today's Plan</h1>
        <div className="flex items-center gap-2">
          {saving && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
          <button onClick={reload} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-colors" aria-label="Refresh">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="bg-card border border-border rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">Progress</span>
          <span className="text-sm tabular-nums text-muted-foreground">{completedCount} / {total}</span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
        </div>
        {plan.completed && <p className="mt-2 text-xs text-emerald-600 dark:text-emerald-400 font-medium">All done for today!</p>}
      </div>

      {/* Items */}
      {total === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <CalendarDays className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium mb-1">Nothing due today</p>
          <p className="text-xs mb-5">Log a review to add segments to your library, or check back when items are due for review.</p>
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
          {plan.items.map((item, index) => (
            <div key={item.srsItemId}
              className={`flex items-center gap-3 bg-card border border-border rounded-xl px-4 py-3 transition-colors ${item.completed ? "opacity-60" : ""}`}>
              <button onClick={() => toggleItem(index)}
                className="flex-shrink-0 text-muted-foreground hover:text-primary transition-colors"
                aria-label={item.completed ? "Mark incomplete" : "Mark complete"}>
                {item.completed ? <CheckCircle2 className="w-5 h-5 text-emerald-500" /> : <Circle className="w-5 h-5" />}
              </button>
              <div className="flex-1 min-w-0">
                <div className={`text-sm font-medium ${item.completed ? "line-through text-muted-foreground" : ""}`}>
                  Surah {item.surah} · {item.ayahStart}–{item.ayahEnd}
                </div>
              </div>
              {!item.completed && (
                <button onClick={() => setLogItem(item)}
                  className="text-xs px-2.5 py-1 rounded-lg border border-border hover:bg-muted transition-colors text-muted-foreground">
                  Log
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {logItem && (
        <LogModal
          item={logItem}
          onClose={() => setLogItem(null)}
          onLogged={() => {
            const idx = plan.items.findIndex((i) => i.srsItemId === logItem.srsItemId);
            if (idx >= 0) markItemDone(idx);
          }}
        />
      )}

      {addOpen && <LogReviewModal onClose={() => setAddOpen(false)} onSuccess={reload} />}
    </div>
  );
}

export default function DailyPlanPage() {
  return (
    <AppShell centerContent={<span className="text-sm font-medium text-muted-foreground">Daily Plan</span>}>
      <main className="flex-1">
        <AuthRequired>
          <DailyPlanContent />
        </AuthRequired>
      </main>
    </AppShell>
  );
}
