import { ChevronLeft } from "lucide-react";
import { useLocation, useParams } from "wouter";
import AppShell from "../../components/AppShell";
import GuestBanner from "../../components/GuestBanner";
import { useSrsItems } from "../../hooks/useTracker";

function SurahDetailContent({ surahNum }: { surahNum: number }) {
  const { items } = useSrsItems();
  const [, navigate] = useLocation();

  const matching = items.filter((i) => {
    const m = i.reference.match(/^(?:ayah|surah):(\d+)/);
    return m && parseInt(m[1], 10) === surahNum;
  });

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
          <p className="text-xs text-muted-foreground">{matching.length} tracked references</p>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        The detailed surah heatmap returns in the next update.
      </p>

      {matching.length > 0 && (
        <div className="bg-card border border-border rounded-xl divide-y divide-border/50">
          {matching.map((item) => (
            <div key={item.id} className="flex items-center gap-3 px-4 py-3">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{item.reference}</div>
                <div className="text-xs text-muted-foreground">
                  EF {(item.easeFactor / 100).toFixed(2)} · {item.repetitions} reps
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function SurahDetailPage() {
  const params = useParams<{ surah: string }>();
  const surahNum = parseInt(params.surah ?? "1", 10);

  return (
    <AppShell centerContent={<span className="text-sm font-medium text-muted-foreground">Surah {surahNum}</span>}>
      <main className="flex-1">
        <GuestBanner />
        <SurahDetailContent surahNum={surahNum} />
      </main>
    </AppShell>
  );
}
