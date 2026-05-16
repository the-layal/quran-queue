import { useState, useEffect } from "react";
import { BookOpen, ChevronDown, ChevronRight, CheckCheck } from "lucide-react";
import { loadChapters } from "../services/quranApi";
import type { ChapterMap } from "../types/quran";
import { cn } from "@/lib/utils";

// Standard juz each surah STARTS in (1-indexed)
const SURAH_JUZ: Record<number, number> = {
  1:1,  2:1,  3:3,  4:4,  5:6,  6:7,  7:8,  8:9,  9:10, 10:11,
  11:11,12:12,13:13,14:13,15:14,16:14,17:15,18:15,19:16,20:16,
  21:17,22:17,23:18,24:18,25:18,26:19,27:19,28:20,29:20,30:21,
  31:21,32:21,33:21,34:22,35:22,36:22,37:23,38:23,39:23,40:24,
  41:24,42:25,43:25,44:25,45:25,46:26,47:26,48:26,49:26,50:26,
  51:26,52:27,53:27,54:27,55:27,56:27,57:27,58:28,59:28,60:28,
  61:28,62:28,63:28,64:28,65:28,66:28,67:29,68:29,69:29,70:29,
  71:29,72:29,73:29,74:29,75:29,76:29,77:29,78:30,79:30,80:30,
  81:30,82:30,83:30,84:30,85:30,86:30,87:30,88:30,89:30,90:30,
  91:30,92:30,93:30,94:30,95:30,96:30,97:30,98:30,99:30,100:30,
  101:30,102:30,103:30,104:30,105:30,106:30,107:30,108:30,109:30,110:30,
  111:30,112:30,113:30,114:30,
};

const VIBE_LABELS = ["Forgetful","Needs work","Familiar","Solid","Mastered"];

interface SurahSelection {
  vibe: number; // 1-5, 0 = not selected
}

interface PriorKnowledgeSetupProps {
  onComplete: (selections: Array<{ reference: string; vibe: number }>) => void;
  onSkip: () => void;
}

export default function PriorKnowledgeSetup({ onComplete, onSkip }: PriorKnowledgeSetupProps) {
  const [chapters, setChapters] = useState<ChapterMap>({});
  const [loading, setLoading] = useState(true);
  const [selections, setSelections] = useState<Record<number, SurahSelection>>({});
  const [expandedJuz, setExpandedJuz] = useState<Set<number>>(() => new Set([30]));

  useEffect(() => {
    loadChapters()
      .then(setChapters)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const toggleJuz = (juz: number) => {
    setExpandedJuz((prev) => {
      const next = new Set(prev);
      if (next.has(juz)) next.delete(juz);
      else next.add(juz);
      return next;
    });
  };

  const toggleSurah = (surahId: number) => {
    setSelections((prev) => {
      const cur = prev[surahId];
      if (cur && cur.vibe > 0) {
        const next = { ...prev };
        delete next[surahId];
        return next;
      }
      return { ...prev, [surahId]: { vibe: 3 } };
    });
  };

  const setVibe = (surahId: number, vibe: number) => {
    setSelections((prev) => ({ ...prev, [surahId]: { vibe } }));
  };

  const handleContinue = () => {
    const items = Object.entries(selections)
      .filter(([, s]) => s.vibe > 0)
      .map(([id, s]) => ({ reference: `surah:${id}`, vibe: s.vibe }));
    onComplete(items);
  };

  // Group surahs by juz, descending (juz 30 first)
  const surahsByJuz = new Map<number, number[]>();
  for (let s = 1; s <= 114; s++) {
    const juz = SURAH_JUZ[s] ?? 30;
    if (!surahsByJuz.has(juz)) surahsByJuz.set(juz, []);
    surahsByJuz.get(juz)!.push(s);
  }
  const juzList = Array.from(surahsByJuz.keys()).sort((a, b) => b - a);

  const totalSelected = Object.values(selections).filter((s) => s.vibe > 0).length;

  return (
    <div className="max-w-xl mx-auto mt-8 px-2">
      {/* Hero */}
      <div className="text-center mb-6">
        <div className="w-16 h-16 bg-primary/10 text-primary rounded-full flex items-center justify-center mx-auto mb-4">
          <BookOpen size={32} />
        </div>
        <h2 className="text-2xl font-serif font-semibold text-foreground mb-2">
          What have you memorized?
        </h2>
        <p className="text-sm text-muted-foreground leading-relaxed max-w-xs mx-auto">
          Mark the surahs you already know so your first review plan reflects your real progress.
        </p>
        <button
          onClick={onSkip}
          className="mt-3 text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
        >
          I'm starting fresh — skip this
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 rounded-2xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-2 pb-24">
          {juzList.map((juz) => {
            const surahs = surahsByJuz.get(juz) ?? [];
            const isExpanded = expandedJuz.has(juz);
            const selectedInJuz = surahs.filter((s) => (selections[s]?.vibe ?? 0) > 0).length;

            return (
              <div key={juz} className="bg-card border border-border/60 rounded-2xl overflow-hidden">
                {/* Juz header */}
                <button
                  onClick={() => toggleJuz(juz)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/40 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    {isExpanded ? (
                      <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                    )}
                    <span className="text-sm font-semibold text-foreground">Juz {juz}</span>
                    <span className="text-xs text-muted-foreground">
                      {surahs.length} surah{surahs.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  {selectedInJuz > 0 && (
                    <span className="text-xs font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                      {selectedInJuz} selected
                    </span>
                  )}
                </button>

                {/* Surah list */}
                {isExpanded && (
                  <div className="border-t border-border/40 divide-y divide-border/30">
                    {surahs.map((surahId) => {
                      const chapter = chapters[surahId];
                      const sel = selections[surahId];
                      const isSelected = (sel?.vibe ?? 0) > 0;

                      return (
                        <div key={surahId}>
                          <div
                            className={cn(
                              "flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-muted/30 transition-colors",
                              isSelected && "bg-primary/5"
                            )}
                            onClick={() => toggleSurah(surahId)}
                          >
                            {/* Toggle indicator */}
                            <div
                              className={cn(
                                "w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors",
                                isSelected
                                  ? "border-primary bg-primary"
                                  : "border-border"
                              )}
                            >
                              {isSelected && (
                                <CheckCheck className="w-3 h-3 text-primary-foreground" />
                              )}
                            </div>

                            {/* Surah info */}
                            <div className="flex-1 min-w-0 flex items-center gap-2">
                              <span className="text-xs text-muted-foreground font-medium w-6 flex-shrink-0">
                                {surahId}
                              </span>
                              <span
                                className="font-quran text-base leading-none flex-shrink-0"
                                dir="rtl"
                                lang="ar"
                              >
                                {chapter?.nameArabic ?? ""}
                              </span>
                              <span className="text-xs font-medium text-foreground truncate">
                                {chapter?.nameSimple ?? `Surah ${surahId}`}
                              </span>
                              <span className="text-[10px] text-muted-foreground flex-shrink-0">
                                {chapter?.versesCount ?? ""}v
                              </span>
                            </div>

                            {/* Vibe badge when selected */}
                            {isSelected && (
                              <span className="text-[10px] font-bold text-primary flex-shrink-0">
                                {VIBE_LABELS[(sel?.vibe ?? 3) - 1]}
                              </span>
                            )}
                          </div>

                          {/* Inline vibe selector — shown when selected */}
                          {isSelected && (
                            <div
                              className="px-4 pb-3 pt-1 bg-primary/5 flex items-center gap-2"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <span className="text-[10px] text-muted-foreground flex-shrink-0 w-16">
                                How solid?
                              </span>
                              <div className="flex gap-1 flex-1">
                                {[1, 2, 3, 4, 5].map((v) => (
                                  <button
                                    key={v}
                                    onClick={() => setVibe(surahId, v)}
                                    className={cn(
                                      "flex-1 h-7 rounded-lg text-xs font-bold transition-all border",
                                      sel?.vibe === v
                                        ? "bg-primary border-primary text-primary-foreground"
                                        : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                                    )}
                                  >
                                    {v}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Sticky footer */}
      <div className="fixed bottom-0 left-0 right-0 z-10 bg-background/95 backdrop-blur-sm border-t border-border px-4 py-3 flex gap-3">
        <button
          onClick={onSkip}
          className="flex-shrink-0 py-3 px-5 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          Skip
        </button>
        <button
          onClick={handleContinue}
          className="flex-1 py-3 rounded-xl font-bold bg-primary text-primary-foreground shadow-lg shadow-primary/25 hover:shadow-xl transition-all disabled:opacity-60"
        >
          {totalSelected > 0
            ? `Continue with ${totalSelected} surah${totalSelected !== 1 ? "s" : ""} →`
            : "Continue →"}
        </button>
      </div>
    </div>
  );
}
