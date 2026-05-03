import { useState } from "react";
import { Library as LibraryIcon, Plus, Loader2, AlertCircle } from "lucide-react";
import AppShell from "../../components/AppShell";
import AuthRequired from "../../components/AuthRequired";
import LogReviewModal from "../../components/LogReviewModal";
import QuranGrid from "../../components/QuranGrid";
import { useSrsItems, masteryColorClass, masteryLabel, masteryBadgeClass } from "../../hooks/useTracker";

function LibraryContent() {
  const { items, loading, error, reload } = useSrsItems();
  const [logOpen, setLogOpen] = useState(false);

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
        <button onClick={reload} className="text-sm text-primary underline">Try again</button>
      </div>
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const grouped = items.reduce<Record<number, typeof items>>((acc, item) => {
    if (!acc[item.surah]) acc[item.surah] = [];
    acc[item.surah].push(item);
    return acc;
  }, {});
  const surahNumbers = Object.keys(grouped).map(Number).sort((a, b) => a - b);

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Library</h1>
          <p className="text-xs text-muted-foreground mt-0.5">{items.length} tracked segments across {surahNumbers.length} surahs</p>
        </div>
        <button
          onClick={() => setLogOpen(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Log Review
        </button>
      </div>

      {/* Quran-wide mastery heatmap */}
      <QuranGrid items={items} />

      {/* Segment list grouped by surah */}
      {surahNumbers.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground">
          <LibraryIcon className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium mb-1">No segments tracked yet</p>
          <p className="text-xs mb-5">
            Log a review to add segments to your library and start tracking memorization.
          </p>
          <button
            onClick={() => setLogOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Log your first review
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {surahNumbers.map((surahNum) => {
            const surahItems = grouped[surahNum];
            const dueCount = surahItems.filter((i) => i.nextReview <= today).length;
            return (
              <div key={surahNum} className="bg-card border border-border rounded-xl overflow-hidden">
                <a href={`/track/library/${surahNum}`} className="flex items-center justify-between px-4 py-3 border-b border-border/50 hover:bg-muted/50 transition-colors">
                  <div>
                    <span className="text-sm font-semibold">Surah {surahNum}</span>
                    {dueCount > 0 && (
                      <span className="ml-2 text-xs px-1.5 py-0.5 rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 font-medium">
                        {dueCount} due
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">{surahItems.length} segments →</span>
                </a>
                <div className="divide-y divide-border/50">
                  {surahItems.sort((a, b) => a.ayahStart - b.ayahStart).map((item) => {
                    const isDue = item.nextReview <= today;
                    return (
                      <div key={item.id} className="flex items-center gap-3 px-4 py-3">
                        <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${masteryColorClass(item.easeFactor, item.repetitions)}`} />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm">
                            {item.ayahStart}–{item.ayahEnd}
                            {isDue && <span className="ml-2 text-xs text-orange-500 font-medium">Due</span>}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${masteryBadgeClass(item.easeFactor, item.repetitions)}`}>
                              {masteryLabel(item.easeFactor, item.repetitions)}
                            </span>
                            <span className="ml-2">EF {item.easeFactor.toFixed(2)} · {item.repetitions} reps</span>
                          </div>
                        </div>
                        <div className="text-xs text-muted-foreground tabular-nums">{item.nextReview}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {logOpen && <LogReviewModal onClose={() => setLogOpen(false)} onSuccess={reload} />}
    </div>
  );
}

export default function LibraryPage() {
  return (
    <AppShell centerContent={<span className="text-sm font-medium text-muted-foreground">Library</span>}>
      <main className="flex-1">
        <AuthRequired>
          <LibraryContent />
        </AuthRequired>
      </main>
    </AppShell>
  );
}
