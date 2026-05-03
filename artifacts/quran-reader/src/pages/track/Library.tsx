import { useState } from "react";
import { Library as LibraryIcon, Plus, Loader2, AlertCircle } from "lucide-react";
import AppShell from "../../components/AppShell";
import GuestBanner from "../../components/GuestBanner";
import LogReviewModal from "../../components/LogReviewModal";
import QuranGrid from "../../components/QuranGrid";
import { useLogs, useSrsItems } from "../../hooks/useTracker";

function LibraryContent() {
  const { items, loading, error, reload } = useSrsItems();
  const { logs } = useLogs();
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

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Library</h1>
          <p className="text-xs text-muted-foreground mt-0.5">{items.length} tracked references</p>
        </div>
        <button
          onClick={() => setLogOpen(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Log Review
        </button>
      </div>

      <QuranGrid logs={logs} />

      {items.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground">
          <LibraryIcon className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium mb-1">No references tracked yet</p>
          <p className="text-xs mb-5">
            The full library view returns in the next update. For now, you can see your tracked
            references below.
          </p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl divide-y divide-border/50">
          {items.map((item) => {
            const due = new Date(item.nextReviewDate) <= new Date();
            return (
              <div key={item.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{item.reference}</div>
                  <div className="text-xs text-muted-foreground">
                    EF {(item.easeFactor / 100).toFixed(2)} · {item.repetitions} reps · next {new Date(item.nextReviewDate).toISOString().slice(0, 10)}
                  </div>
                </div>
                {due && (
                  <span className="text-xs px-1.5 py-0.5 rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 font-medium">
                    Due
                  </span>
                )}
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
        <GuestBanner />
        <LibraryContent />
      </main>
    </AppShell>
  );
}
