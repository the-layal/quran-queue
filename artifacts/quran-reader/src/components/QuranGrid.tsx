import { useLocation } from "wouter";
import { SURAHS } from "../data/quran";
import type { SrsItem } from "../hooks/useTracker";
import { masteryLevel } from "../hooks/useTracker";

interface QuranGridProps {
  items: SrsItem[];
  onSurahClick?: (surah: number) => void;
}

function surahMasteryColor(items: SrsItem[], surah: number, today: string): string {
  const surahItems = items.filter((i) => i.surah === surah);
  if (surahItems.length === 0) return "bg-muted hover:bg-muted/80";

  const hasDue = surahItems.some((i) => i.nextReview <= today);
  const levels = surahItems.map((i) => masteryLevel(i.easeFactor, i.repetitions));

  if (levels.every((l) => l === "mastered")) return hasDue ? "bg-emerald-400 dark:bg-emerald-600" : "bg-emerald-500 dark:bg-emerald-500";
  if (levels.some((l) => l === "struggling")) return "bg-orange-400 dark:bg-orange-500";
  if (levels.some((l) => l === "reviewing")) return "bg-yellow-400 dark:bg-yellow-500";
  if (levels.some((l) => l === "learning")) return "bg-blue-400 dark:bg-blue-500";
  return "bg-muted";
}

function surahTooltip(items: SrsItem[], surah: number): string {
  const surahItems = items.filter((i) => i.surah === surah);
  if (surahItems.length === 0) return "Not started";
  return `${surahItems.length} segment${surahItems.length !== 1 ? "s" : ""} tracked`;
}

const LEGEND = [
  { label: "Not started", className: "bg-muted" },
  { label: "Struggling", className: "bg-orange-400" },
  { label: "Reviewing", className: "bg-yellow-400" },
  { label: "Learning", className: "bg-blue-400" },
  { label: "Mastered", className: "bg-emerald-500" },
];

export default function QuranGrid({ items, onSurahClick }: QuranGridProps) {
  const [, navigate] = useLocation();
  const today = new Date().toISOString().slice(0, 10);

  const handleClick = (surah: number) => {
    if (onSurahClick) {
      onSurahClick(surah);
    } else {
      navigate(`/track/library/${surah}`);
    }
  };

  const trackedCount = new Set(items.map((i) => i.surah)).size;

  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold">Quran Progress</h2>
        <span className="text-xs text-muted-foreground">{trackedCount} / 114 surahs</span>
      </div>

      <div className="grid gap-1" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(36px, 1fr))" }}>
        {SURAHS.map((s) => {
          const color = surahMasteryColor(items, s.number, today);
          const tip = surahTooltip(items, s.number);
          const hasItems = items.some((i) => i.surah === s.number);
          const hasDue = items.some((i) => i.surah === s.number && i.nextReview <= today);

          return (
            <button
              key={s.number}
              onClick={() => handleClick(s.number)}
              title={`${s.number}. ${s.name} (${s.ayahs} ayahs) — ${tip}`}
              className={`relative aspect-square rounded-md transition-all duration-150 hover:scale-110 hover:z-10 focus:outline-none focus:ring-2 focus:ring-primary ${color}`}
            >
              <span className="absolute inset-0 flex items-center justify-center text-[9px] font-medium text-foreground/60 dark:text-background/60">
                {s.number}
              </span>
              {hasDue && hasItems && (
                <span className="absolute top-0 right-0 w-1.5 h-1.5 rounded-full bg-orange-500 border border-card" />
              )}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3">
        {LEGEND.map(({ label, className }) => (
          <div key={label} className="flex items-center gap-1.5">
            <div className={`w-2.5 h-2.5 rounded-sm ${className}`} />
            <span className="text-[10px] text-muted-foreground">{label}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <div className="relative w-2.5 h-2.5">
            <div className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />
            <span className="absolute top-0 right-0 w-1 h-1 rounded-full bg-orange-500 border border-card" />
          </div>
          <span className="text-[10px] text-muted-foreground">Due today</span>
        </div>
      </div>
    </div>
  );
}
