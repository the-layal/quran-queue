import { useLocation } from "wouter";
import { SURAHS } from "../data/quran";
import type { Log } from "../hooks/useTracker";

interface QuranGridProps {
  logs: Log[];
  onSurahClick?: (surah: number) => void;
}

// Stub Quran grid for the data-model rewrite. The real surah-by-surah
// memorization heatmap (driven by per-ayah vibes) ships in task #152.
export default function QuranGrid({ logs, onSurahClick }: QuranGridProps) {
  const [, navigate] = useLocation();

  const trackedSurahs = new Set<number>();
  for (const l of logs) {
    const m = l.reference.match(/^(?:ayah|surah):(\d+)/);
    if (m) trackedSurahs.add(parseInt(m[1], 10));
  }

  const handleClick = (surah: number) => {
    if (onSurahClick) onSurahClick(surah);
    else navigate(`/track/library/${surah}`);
  };

  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold">Quran Progress</h2>
        <span className="text-xs text-muted-foreground">{trackedSurahs.size} / 114 surahs</span>
      </div>

      <div className="grid gap-1" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(36px, 1fr))" }}>
        {SURAHS.map((s) => {
          const tracked = trackedSurahs.has(s.number);
          return (
            <button
              key={s.number}
              onClick={() => handleClick(s.number)}
              title={`${s.number}. ${s.name}`}
              className={`relative aspect-square rounded-md transition-all duration-150 hover:scale-110 hover:z-10 focus:outline-none focus:ring-2 focus:ring-primary ${tracked ? "bg-emerald-400 dark:bg-emerald-600" : "bg-muted hover:bg-muted/80"}`}
            >
              <span className="absolute inset-0 flex items-center justify-center text-[9px] font-medium text-foreground/60 dark:text-background/60">
                {s.number}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
