import { Bookmark, CloudCheck, ChevronRight } from "lucide-react";
import { useQueries } from "@tanstack/react-query";
import { useBookmarks } from "../hooks/useBookmarks";
import { useQuranStore } from "../store/quranStore";
import { SURAHS } from "../data/quran";
import { useLocation } from "wouter";
import { fetchVerseUthmaniText } from "../services/quranApi";

function getSurahName(surahNumber: number): string {
  const surah = SURAHS.find((s) => s.number === surahNumber);
  return surah ? surah.name : `Surah ${surahNumber}`;
}

export default function SavedVersesPanel({ onNavigate }: { onNavigate?: () => void }) {
  const { bookmarks, isLoading, isQFConnected } = useBookmarks();
  const setCurrentSurah = useQuranStore((s) => s.setCurrentSurah);
  const setViewMode = useQuranStore((s) => s.setViewMode);
  const setTargetScrollAyah = useQuranStore((s) => s.setTargetScrollAyah);
  const [, setLocation] = useLocation();

  const verseTextQueries = useQueries({
    queries: bookmarks.map((bm) => ({
      queryKey: ["verse-text", bm.surahNumber, bm.ayahNumber] as const,
      queryFn: () => fetchVerseUthmaniText(bm.surahNumber, bm.ayahNumber),
      staleTime: Infinity,
    })),
  });

  if (bookmarks.length === 0 && !isLoading) return null;

  function handleClick(surahNumber: number, ayahNumber: number) {
    setCurrentSurah(surahNumber);
    setViewMode("reading");
    setTargetScrollAyah({ surahNumber, ayahNumber });
    setLocation("/");
    onNavigate?.();
  }

  const anySynced = bookmarks.some((bm) => bm.qfBookmarkId);

  return (
    <div className="mx-3 mb-3 rounded-xl border border-border overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-muted/40 border-b border-border">
        <div className="flex items-center gap-1.5">
          <Bookmark className="w-3.5 h-3.5 text-primary" />
          <span className="text-xs font-semibold text-foreground">Saved Verses</span>
          <span className="text-[10px] text-muted-foreground">({bookmarks.length})</span>
        </div>
        {isQFConnected && anySynced && (
          <div className="flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400">
            <CloudCheck className="w-3 h-3" />
            <span>Synced</span>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="px-3 py-3 space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-10 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="divide-y divide-border/50 max-h-56 overflow-y-auto">
          {bookmarks.map((bm, idx) => {
            const text = verseTextQueries[idx]?.data;
            const snippet = text
              ? text.length > 55
                ? text.slice(0, 55) + "…"
                : text
              : null;

            return (
              <button
                key={bm.id}
                onClick={() => handleClick(bm.surahNumber, bm.ayahNumber)}
                className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-muted/50 transition-colors group"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                    <span className="truncate">{getSurahName(bm.surahNumber)}</span>
                    <span className="text-muted-foreground font-normal flex-shrink-0">
                      {bm.surahNumber}:{bm.ayahNumber}
                    </span>
                    {bm.qfBookmarkId && (
                      <CloudCheck className="w-2.5 h-2.5 text-emerald-500 flex-shrink-0" />
                    )}
                  </div>
                  {snippet && (
                    <p
                      className="text-[11px] text-muted-foreground mt-0.5 text-right truncate"
                      dir="rtl"
                      lang="ar"
                    >
                      {snippet}
                    </p>
                  )}
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0 ml-2 opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
