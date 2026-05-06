import { useState, useRef, useEffect } from "react";
import { Bookmark, CloudCheck, ChevronRight, PencilLine, Check, X, RefreshCw, Loader2 } from "lucide-react";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { useBookmarks, BOOKMARKS_QUERY_KEY } from "../hooks/useBookmarks";
import { useQuranStore } from "../store/quranStore";
import { SURAHS } from "../data/quran";
import { useLocation } from "wouter";
import { fetchVerseUthmaniText } from "../services/quranApi";

function getSurahName(surahNumber: number): string {
  const surah = SURAHS.find((s) => s.number === surahNumber);
  return surah ? surah.name : `Surah ${surahNumber}`;
}

function NoteEditor({
  bookmarkId,
  initialNote,
  onSave,
  onCancel,
}: {
  bookmarkId: number;
  initialNote: string | null | undefined;
  onSave: (id: number, note: string | null) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initialNote ?? "");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    containerRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, []);

  function handleSave() {
    const trimmed = value.trim();
    onSave(bookmarkId, trimmed === "" ? null : trimmed);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSave();
    }
    if (e.key === "Escape") {
      onCancel();
    }
  }

  return (
    <div ref={containerRef} className="px-3 pb-2 pt-1">
      <div className="flex gap-1.5 mb-1 justify-end">
        <button
          onClick={onCancel}
          className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded hover:bg-muted transition-colors"
        >
          <X className="w-3 h-3" />
          Cancel
        </button>
        <button
          onClick={handleSave}
          className="flex items-center gap-1 text-[10px] text-primary hover:text-primary/80 px-1.5 py-0.5 rounded hover:bg-primary/10 transition-colors"
        >
          <Check className="w-3 h-3" />
          Save
        </button>
      </div>
      <textarea
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Add a personal note…"
        rows={2}
        className="w-full text-xs rounded-md border border-border bg-background px-2 py-1.5 text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-1 focus:ring-primary"
      />
    </div>
  );
}

export default function SavedVersesPanel({ onNavigate }: { onNavigate?: () => void }) {
  const { bookmarks, isLoading, isQFConnected, updateNote } = useBookmarks();
  const queryClient = useQueryClient();
  const setCurrentSurah = useQuranStore((s) => s.setCurrentSurah);
  const setViewMode = useQuranStore((s) => s.setViewMode);
  const setTargetScrollAyah = useQuranStore((s) => s.setTargetScrollAyah);
  const [, setLocation] = useLocation();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [syncing, setSyncing] = useState(false);

  async function handleSync() {
    if (syncing) return;
    setSyncing(true);
    try {
      await fetch("/api/bookmarks/qf/sync", { credentials: "include" });
      await queryClient.invalidateQueries({ queryKey: BOOKMARKS_QUERY_KEY });
    } catch {
      // non-fatal — bookmarks are still shown
    } finally {
      setSyncing(false);
    }
  }

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
        <div className="flex items-center gap-2">
          {isQFConnected && anySynced && (
            <div className="flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400">
              <CloudCheck className="w-3 h-3" />
              <span>Synced</span>
            </div>
          )}
          {isQFConnected && (
            <button
              onClick={handleSync}
              disabled={syncing}
              title="Sync bookmarks from Quran.com"
              className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            >
              {syncing
                ? <Loader2 className="w-3 h-3 animate-spin" />
                : <RefreshCw className="w-3 h-3" />}
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="px-3 py-3 space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-10 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="divide-y divide-border/50 max-h-72 overflow-y-auto">
          {bookmarks.map((bm, idx) => {
            const text = verseTextQueries[idx]?.data;
            const snippet = text
              ? text.length > 55
                ? text.slice(0, 55) + "…"
                : text
              : null;
            const isEditing = editingId === bm.id;

            return (
              <div key={bm.id} className="group">
                <div className="flex items-center hover:bg-muted/50 transition-colors">
                  <button
                    onClick={() => handleClick(bm.surahNumber, bm.ayahNumber)}
                    className="flex-1 min-w-0 flex items-center gap-2 px-3 py-2.5 text-left"
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
                      {bm.note && !isEditing && (
                        <p className="text-[11px] text-muted-foreground mt-0.5 italic truncate">
                          {bm.note}
                        </p>
                      )}
                    </div>
                  </button>
                  <div className="flex items-center gap-1 flex-shrink-0 pr-2">
                    <button
                      onClick={() => setEditingId(isEditing ? null : bm.id)}
                      title={bm.note ? "Edit note" : "Add note"}
                      className="opacity-40 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                    >
                      <PencilLine className="w-3 h-3" />
                    </button>
                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </div>

                {isEditing && (
                  <NoteEditor
                    bookmarkId={bm.id}
                    initialNote={bm.note}
                    onSave={(id, note) => {
                      updateNote(id, note);
                      setEditingId(null);
                    }}
                    onCancel={() => setEditingId(null)}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
