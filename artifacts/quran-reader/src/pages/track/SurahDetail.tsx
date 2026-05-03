import { useEffect, useState } from "react";
import { Loader2, AlertCircle, ChevronLeft } from "lucide-react";
import { useLocation, useParams } from "wouter";
import AppShell from "../../components/AppShell";
import GuestBanner from "../../components/GuestBanner";
import { useTrackerStorage } from "../../context/useTrackerStorage";
import type { SrsItem } from "../../storage/trackerStorage";

function masteryColor(ef: number, reps: number): string {
  if (reps === 0) return "bg-muted text-muted-foreground";
  if (ef >= 2.5 && reps >= 5) return "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400";
  if (ef >= 2.0 && reps >= 3) return "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400";
  if (ef >= 1.5) return "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400";
  return "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400";
}

function masteryLabel(ef: number, reps: number): string {
  if (reps === 0) return "New";
  if (ef >= 2.5 && reps >= 5) return "Mastered";
  if (ef >= 2.0 && reps >= 3) return "Learning";
  if (ef >= 1.5) return "Reviewing";
  return "Struggling";
}

const MASTERY_LEVELS = [
  { label: "New", color: "bg-muted" },
  { label: "Struggling", color: "bg-orange-400" },
  { label: "Reviewing", color: "bg-yellow-400" },
  { label: "Learning", color: "bg-blue-500" },
  { label: "Mastered", color: "bg-emerald-500" },
];

function SurahDetailContent({ surahNum }: { surahNum: number }) {
  const { storage } = useTrackerStorage();
  const [items, setItems] = useState<SrsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [, navigate] = useLocation();

  useEffect(() => {
    setLoading(true);
    setError(null);
    storage.getSrsItems()
      .then((all) => setItems(all.filter((i) => i.surah === surahNum)))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [surahNum, storage]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 px-4">
        <AlertCircle className="w-8 h-8 text-destructive" />
        <p className="text-sm text-destructive text-center">{error}</p>
        <button onClick={() => window.location.reload()} className="text-sm text-primary underline">
          Try again
        </button>
      </div>
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const sorted = [...items].sort((a, b) => a.ayahStart - b.ayahStart);

  const masteryCount: Record<string, number> = { New: 0, Struggling: 0, Reviewing: 0, Learning: 0, Mastered: 0 };
  for (const item of items) {
    masteryCount[masteryLabel(item.easeFactor, item.repetitions)]++;
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate("/track/library")}
          className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-colors"
          aria-label="Back to library"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-xl font-semibold">Surah {surahNum}</h1>
          <p className="text-xs text-muted-foreground">{items.length} tracked segments</p>
        </div>
      </div>

      {/* Mastery overview */}
      {items.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <h2 className="text-sm font-semibold mb-3">Mastery Overview</h2>
          <div className="flex gap-1 h-3 rounded-full overflow-hidden mb-3">
            {MASTERY_LEVELS.map(({ label, color }) => {
              const count = masteryCount[label] ?? 0;
              const pct = items.length > 0 ? (count / items.length) * 100 : 0;
              if (pct === 0) return null;
              return (
                <div
                  key={label}
                  className={`${color} transition-all`}
                  style={{ width: `${pct}%` }}
                  title={`${label}: ${count}`}
                />
              );
            })}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {MASTERY_LEVELS.map(({ label, color }) => {
              const count = masteryCount[label] ?? 0;
              if (count === 0) return null;
              return (
                <div key={label} className="flex items-center gap-1.5">
                  <div className={`w-2 h-2 rounded-full ${color}`} />
                  <span className="text-xs text-muted-foreground">{label} ({count})</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Segment list */}
      {sorted.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-sm">No segments tracked for this surah yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map((item) => {
            const isDue = item.nextReview <= today;
            const label = masteryLabel(item.easeFactor, item.repetitions);
            const colors = masteryColor(item.easeFactor, item.repetitions);

            return (
              <div
                key={item.id}
                className="bg-card border border-border rounded-xl px-4 py-3 flex items-center gap-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">
                      {item.ayahStart}–{item.ayahEnd}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colors}`}>
                      {label}
                    </span>
                    {isDue && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 font-medium">
                        Due
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    EF {item.easeFactor.toFixed(2)} · {item.repetitions} reps · next {item.nextReview}
                  </div>
                </div>
                <div className="flex-shrink-0">
                  <div className="text-center">
                    <div className="text-lg font-bold tabular-nums text-primary">{item.repetitions}</div>
                    <div className="text-xs text-muted-foreground">reps</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function SurahDetailPage() {
  const params = useParams<{ surah: string }>();
  const surahNum = parseInt(params.surah ?? "1", 10);

  return (
    <AppShell
      centerContent={
        <span className="text-sm font-medium text-muted-foreground">Surah {surahNum}</span>
      }
    >
      <main className="flex-1">
        <GuestBanner />
        <SurahDetailContent surahNum={surahNum} />
      </main>
    </AppShell>
  );
}
