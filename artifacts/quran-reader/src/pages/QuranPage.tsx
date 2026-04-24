import { useEffect, useCallback, useState, useRef, type RefObject } from "react";
import { Link } from "wouter";
import {
  ChevronLeft,
  ChevronRight,
  Settings,
  BarChart2,
  Moon,
  Sun,
  Loader2,
  AlertCircle,
  BookOpen,
  AlignLeft,
  ChevronDown,
  Search,
  X,
} from "lucide-react";
import { useQuranStore } from "../store/quranStore";
import {
  fetchSurahVerses,
  loadChapters,
  TOTAL_PAGES,
  TOTAL_SURAHS,
} from "../services/quranApi";
import type { QuranAyah, ChapterMap, ChapterInfo } from "../types/quran";
import SurahHeader from "../components/SurahHeader";
import MushafSvgPage from "../components/MushafSvgPage";
import BrushFinenessToggle from "../components/BrushFinenessToggle";
import AudioControlBar from "../components/AudioControlBar";
import ReviewQueuePanel from "../components/ReviewQueuePanel";
import { useSmartBrush } from "../hooks/useSmartBrush";

// ── Surah picker modal ────────────────────────────────────────────────────────

function SurahPickerModal({
  open,
  onClose,
  chapters,
  currentSurah,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  chapters: ChapterMap;
  currentSurah: number;
  onSelect: (n: number) => void;
}) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  const q = query.trim().toLowerCase();
  const allChapters = Object.values(chapters).sort((a, b) => a.id - b.id);
  const filtered = q
    ? allChapters.filter(
        (ch) =>
          String(ch.id).startsWith(q) ||
          ch.nameSimple.toLowerCase().includes(q) ||
          ch.nameTranslation.toLowerCase().includes(q) ||
          ch.nameArabic.includes(query)
      )
    : allChapters;

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="fixed inset-x-0 bottom-0 z-50 flex flex-col bg-card rounded-t-2xl border-t border-border shadow-2xl max-h-[85vh]">
        {/* Handle */}
        <div className="w-10 h-1 bg-muted-foreground/25 rounded-full mx-auto mt-3 mb-2 flex-shrink-0" />

        {/* Header */}
        <div className="flex items-center justify-between px-5 pb-3 flex-shrink-0">
          <h2 className="text-base font-semibold">Select Surah</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 pb-3 flex-shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              placeholder="Search surah name or number…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-xl bg-muted text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </div>

        {/* List */}
        <div className="overflow-y-auto flex-1 pb-6">
          {filtered.map((ch) => (
            <button
              key={ch.id}
              onClick={() => {
                onSelect(ch.id);
                onClose();
              }}
              className={`w-full flex items-center gap-3 px-5 py-3 hover:bg-muted/60 transition-colors text-left ${
                ch.id === currentSurah ? "bg-accent/40" : ""
              }`}
            >
              <div className="w-8 h-8 rounded-full border border-border flex items-center justify-center text-xs font-medium text-muted-foreground flex-shrink-0">
                {ch.id}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium leading-tight">{ch.nameSimple}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {ch.nameTranslation} · {ch.versesCount} verses
                </div>
              </div>
              <div
                className="font-quran text-base text-foreground/70 flex-shrink-0"
                dir="rtl"
                lang="ar"
              >
                {ch.nameArabic}
              </div>
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="text-center text-muted-foreground text-sm py-8">
              No surahs found
            </p>
          )}
        </div>
      </div>
    </>
  );
}

// ── Surah selector button (reading mode header) ───────────────────────────────

function SurahSelectorButton({
  chapter,
  surahNumber,
  onClick,
}: {
  chapter: ChapterInfo | undefined;
  surahNumber: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-baseline justify-center gap-1.5 hover:bg-muted rounded-lg px-2 py-1 transition-colors w-full"
      aria-label="Select surah"
    >
      <span
        className="font-quran text-base text-foreground leading-none whitespace-nowrap"
        dir="rtl"
        lang="ar"
      >
        {chapter?.nameArabic ?? ""}
      </span>
      <span className="text-xs text-muted-foreground tabular-nums font-medium whitespace-nowrap flex-shrink-0">
        {surahNumber} / {TOTAL_SURAHS}
      </span>
      <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0 self-center" />
    </button>
  );
}

// ── Individual verse block ────────────────────────────────────────────────────

function toEasternArabic(n: number): string {
  return String(n).replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[parseInt(d)]);
}

const loadedQpcPages = new Set<number>();

function useQpcFonts(ayahs: QuranAyah[], surahNumber?: number): boolean {
  const [fontsReady, setFontsReady] = useState(false);

  useEffect(() => {
    if (ayahs.length === 0) {
      setFontsReady(true);
      return;
    }

    const pages = new Set<number>();
    // Always load page 1 — the standalone Bismillah header uses 1:1 glyphs
    pages.add(1);
    for (const ayah of ayahs) {
      for (const word of ayah.words) {
        if (word.pageNumber) pages.add(word.pageNumber);
      }
      if (ayah.endMarkerPageNumber) pages.add(ayah.endMarkerPageNumber);
    }

    if (pages.size === 0) {
      setFontsReady(true);
      return;
    }

    const pending: Promise<void>[] = [];

    pages.forEach((pageNum) => {
      if (loadedQpcPages.has(pageNum)) return;
      loadedQpcPages.add(pageNum);
      const family = `QCFv2p${pageNum}`;
      const url = `/api/font/qpc-v2/p${pageNum}.ttf`;
      const face = new FontFace(family, `url(${url})`, {
        display: "swap",
        style: "normal",
        weight: "normal",
      });
      const p = face
        .load()
        .then((loaded) => {
          document.fonts.add(loaded);
        })
        .catch(() => {
          loadedQpcPages.delete(pageNum);
        });
      pending.push(p);
    });

    if (pending.length === 0) {
      setFontsReady(true);
      return;
    }

    setFontsReady(false);
    let cancelled = false;
    Promise.all(pending).then(() => {
      if (!cancelled) setFontsReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, [ayahs]);

  return fontsReady;
}

function VerseBlock({
  ayah,
  fontSize,
}: {
  ayah: QuranAyah;
  fontSize: number;
}) {
  return (
    <div className="verse-block flex items-start gap-3">
      {/* Left: surah:ayah pill badge */}
      <div className="flex-shrink-0 pt-1">
        <div className="ayah-badge select-none">
          {ayah.surah.number}:{ayah.numberInSurah}
        </div>
      </div>

      {/* Right: Arabic text block */}
      <div className="flex-1">
        <div
          className="quran-text text-right"
          dir="rtl"
          lang="ar"
          style={{ fontSize: `${fontSize}px` }}
        >
          {ayah.words.map((word) => (
            <span
              key={word.spanId}
              id={word.spanId}
              className="quran-word"
              style={{ fontFamily: `QCFv2p${word.pageNumber}, serif` }}
              data-surah={word.surahNumber}
              data-ayah={word.ayahNumber}
              data-word={word.wordIndex}
            >
              {word.codeV2}
              {" "}
            </span>
          ))}
          {ayah.endMarkerCodeV2 ? (
            <span
              className="ayah-end-marker select-none"
              style={{ fontFamily: `QCFv2p${ayah.endMarkerPageNumber}, serif` }}
              aria-label={`Ayah ${ayah.numberInSurah}`}
            >
              {ayah.endMarkerCodeV2}
            </span>
          ) : (
            <span
              className="ayah-end-marker select-none"
              aria-label={`Ayah ${ayah.numberInSurah}`}
            >
              {toEasternArabic(ayah.numberInSurah)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Surah reading view ────────────────────────────────────────────────────────

function SurahReadingView({
  surahNumber,
  ayahs,
  chapter,
  fontSize,
}: {
  surahNumber: number;
  ayahs: QuranAyah[];
  chapter: ChapterInfo | undefined;
  fontSize: number;
}) {
  const firstAyah = ayahs[0];
  const containerRef = useRef<HTMLDivElement>(null);
  const fontsReady = useQpcFonts(ayahs);
  const selectedWordIds = useQuranStore((s) => s.selectedWordIds);
  const playbackActiveIds = useQuranStore((s) => s.playbackActiveIds);
  const playbackCurrentWordId = useQuranStore((s) => s.playbackCurrentWordId);

  // Brush pointer handlers — must be called before any early return
  const brush = useSmartBrush("reading", containerRef as RefObject<HTMLElement | null>);

  // Reactive DOM sync: keep .word-selected classes in step with the Zustand store.
  // This handles external changes (e.g. the "Clear" button) after the drag hook
  // has already applied imperative classes during the gesture itself.
  const prevSelectedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const next = new Set(selectedWordIds);
    const prev = prevSelectedRef.current;
    prev.forEach((id) => {
      if (!next.has(id)) document.getElementById(id)?.classList.remove("word-selected");
    });
    next.forEach((id) => {
      if (!prev.has(id)) document.getElementById(id)?.classList.add("word-selected");
    });
    prevSelectedRef.current = next;
  }, [selectedWordIds]);

  // Reactive DOM sync: keep .word-playing classes in step with playbackActiveIds.
  // Query the DOM directly each time so the update is always idempotent —
  // no ref bookkeeping means no stale-state bugs when modes toggle rapidly.
  useEffect(() => {
    document
      .querySelectorAll<HTMLElement>(".quran-word.word-playing")
      .forEach((el) => el.classList.remove("word-playing"));
    playbackActiveIds.forEach((id) => {
      document.getElementById(id)?.classList.add("word-playing");
    });

    if (playbackActiveIds.length > 0) {
      const firstEl = document.getElementById(playbackActiveIds[0]);
      if (firstEl) {
        firstEl.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
      }
    }
  }, [playbackActiveIds]);

  // Reactive DOM sync: apply .word-current to the single word currently spoken.
  const prevCurrentWordRef = useRef<string | null>(null);
  useEffect(() => {
    if (prevCurrentWordRef.current) {
      document.getElementById(prevCurrentWordRef.current)?.classList.remove("word-current");
    }
    if (playbackCurrentWordId) {
      document.getElementById(playbackCurrentWordId)?.classList.add("word-current");
    }
    prevCurrentWordRef.current = playbackCurrentWordId;
  }, [playbackCurrentWordId]);

  const surahInfo = chapter
    ? {
        number: chapter.id,
        name: chapter.nameArabic,
        englishName: chapter.nameSimple,
        englishNameTranslation: chapter.nameTranslation,
        revelationType:
          chapter.revelationPlace === "madinah" ? "Medinan" : "Meccan",
      }
    : undefined;

  if (!fontsReady) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">
          Loading {chapter?.nameSimple ?? `Surah ${surahNumber}`}…
        </p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="surah-reading-view max-w-2xl mx-auto w-full px-5 sm:px-10 py-4"
      onPointerDown={brush.onPointerDown}
      onPointerMove={brush.onPointerMove}
      onPointerUp={brush.onPointerUp}
      onPointerCancel={brush.onPointerCancel}
    >
      {surahInfo && <SurahHeader surah={surahInfo} />}

      {firstAyah && (
        <div className="sticky top-12 z-20 bg-background/95 backdrop-blur-sm text-center text-xs text-muted-foreground py-2 mb-4 tracking-wide border-b border-border/30">
          Page {firstAyah.page} · Juz {firstAyah.juz}
          {firstAyah.hizb ? ` · Hizb ${firstAyah.hizb}` : ""}
        </div>
      )}

      <div className="surah-verses">
        {ayahs.map((ayah) => (
          <VerseBlock
            key={`${surahNumber}:${ayah.numberInSurah}`}
            ayah={ayah}
            fontSize={fontSize}
          />
        ))}
      </div>

      <div className="text-center text-xs text-muted-foreground mt-10 pb-4 tracking-widest">
        ﴾ {surahInfo?.englishName ?? ""} ﴿
      </div>
    </div>
  );
}

// ── Settings panel ────────────────────────────────────────────────────────────

function SettingsPanel({
  open,
  onClose,
  fontSize,
  setFontSize,
  showTranslation,
  setShowTranslation,
  isMushafMode,
}: {
  open: boolean;
  onClose: () => void;
  fontSize: number;
  setFontSize: (n: number) => void;
  showTranslation: boolean;
  setShowTranslation: (v: boolean) => void;
  isMushafMode: boolean;
}) {
  if (!open) return null;
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-card rounded-t-2xl border border-border shadow-xl p-6 max-w-lg mx-auto">
        <div className="w-10 h-1 bg-muted-foreground/30 rounded-full mx-auto mb-5" />
        <h2 className="text-base font-semibold mb-5">Settings</h2>

        <div className="space-y-5">
          {!isMushafMode && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Font Size</span>
                <span className="text-sm text-muted-foreground tabular-nums">
                  {fontSize}px
                </span>
              </div>
              <input
                type="range"
                min={24}
                max={48}
                step={2}
                value={fontSize}
                onChange={(e) => setFontSize(Number(e.target.value))}
                className="w-full accent-primary cursor-pointer"
              />
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>Small</span>
                <span>Large</span>
              </div>
            </div>
          )}

          {isMushafMode && (
            <p className="text-sm text-muted-foreground">
              Use the − / + buttons in the footer to zoom the page in or out.
            </p>
          )}

          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">Show Translation</div>
              <div className="text-xs text-muted-foreground">
                Sahih International (coming soon)
              </div>
            </div>
            <button
              onClick={undefined}
              disabled
              className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors bg-muted cursor-not-allowed opacity-50"
              aria-checked={false}
              role="switch"
            >
              <span
                className={`inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform ${showTranslation ? "translate-x-6" : "translate-x-1"}`}
              />
            </button>
          </div>
        </div>

        <button
          onClick={onClose}
          className="mt-6 w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          Done
        </button>
      </div>
    </>
  );
}

// ── Page number input (mushaf mode only) ──────────────────────────────────────

function PageInput({
  currentPage,
  totalPages,
  onGo,
}: {
  currentPage: number;
  totalPages: number;
  onGo: (page: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(currentPage));

  useEffect(() => {
    setValue(String(currentPage));
  }, [currentPage]);

  const commit = () => {
    const n = parseInt(value, 10);
    if (!isNaN(n) && n >= 1 && n <= totalPages) {
      onGo(n);
    } else {
      setValue(String(currentPage));
    }
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        autoFocus
        type="number"
        min={1}
        max={totalPages}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            setValue(String(currentPage));
            setEditing(false);
          }
        }}
        className="w-16 text-center text-sm bg-muted border border-border rounded-lg py-1 focus:outline-none focus:ring-1 focus:ring-primary"
      />
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="text-sm text-muted-foreground hover:text-foreground transition-colors tabular-nums"
      title="Click to jump to page"
    >
      Page {currentPage} / {totalPages}
    </button>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function QuranPage() {
  const {
    currentSurah,
    currentPage,
    viewMode,
    surahCache,
    settings,
    isLoading,
    error,
    setCurrentSurah,
    setCurrentPage,
    setViewMode,
    setSurahData,
    setLoading,
    setError,
    updateSettings,
    clearSelection,
  } = useQuranStore();

  const [darkMode, setDarkMode] = useState(() =>
    document.documentElement.classList.contains("dark")
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [surahPickerOpen, setSurahPickerOpen] = useState(false);
  const [chapters, setChapters] = useState<ChapterMap>({});

  const isMushaf = viewMode === "mushaf";
  const surahData = surahCache.get(currentSurah);
  const chapter = chapters[currentSurah];

  // Load chapters list on mount (for surah picker + SurahHeader)
  useEffect(() => {
    loadChapters()
      .then(setChapters)
      .catch(() => {});
  }, []);

  // ── Load surah in reading mode ────────────────────────────────────────────
  const loadSurah = useCallback(
    async (surah: number) => {
      if (surahCache.has(surah)) return;
      setLoading(true);
      setError(null);
      try {
        const data = await fetchSurahVerses(surah);
        setSurahData(surah, data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load surah");
      } finally {
        setLoading(false);
      }
    },
    [surahCache, setLoading, setError, setSurahData]
  );

  // Trigger fetch on surah change (reading mode only)
  useEffect(() => {
    if (!isMushaf) {
      loadSurah(currentSurah);
    }
  }, [currentSurah, isMushaf, loadSurah]);

  // Prefetch adjacent surahs in reading mode
  useEffect(() => {
    if (!isMushaf) {
      const next = currentSurah + 1;
      const prev = currentSurah - 1;
      if (next <= TOTAL_SURAHS && !surahCache.has(next))
        fetchSurahVerses(next).then((d) => setSurahData(next, d)).catch(() => {});
      if (prev >= 1 && !surahCache.has(prev))
        fetchSurahVerses(prev).then((d) => setSurahData(prev, d)).catch(() => {});
    }
  }, [currentSurah, isMushaf, surahCache, setSurahData]);

  // Proactively keep currentPage in sync with currentSurah in reading mode,
  // so that if chapters are loaded later or surah changes, the page is always
  // up-to-date before the user switches to Mushaf mode.
  useEffect(() => {
    if (!isMushaf && chapter?.mushafStartPage) {
      setCurrentPage(chapter.mushafStartPage);
    }
  }, [currentSurah, chapter, isMushaf, setCurrentPage]);

  // Reverse sync: when the user turns Mushaf pages, update currentSurah to
  // match whichever surah begins on or before the current page.
  useEffect(() => {
    if (!isMushaf) return;
    const allChapters = Object.values(chapters);
    if (allChapters.length === 0) return;
    const match = allChapters
      .filter((ch) => ch.mushafStartPage <= currentPage)
      .sort((a, b) => b.mushafStartPage - a.mushafStartPage)[0];
    if (match && match.id !== currentSurah) {
      setCurrentSurah(match.id);
    }
  }, [currentPage, isMushaf, chapters, currentSurah, setCurrentSurah]);

  // Sync mushaf page when switching from reading mode
  const handleModeSwitch = () => {
    if (!isMushaf) {
      // Guard: wait until chapter metadata is available so sync is never skipped
      const startPage = chapters[currentSurah]?.mushafStartPage;
      if (!startPage) return; // chapters not yet loaded — silently skip
      setCurrentPage(startPage);
    }
    setViewMode(isMushaf ? "reading" : "mushaf");
  };

  const goNextSurah = () => {
    if (currentSurah < TOTAL_SURAHS) {
      clearSelection();
      setCurrentSurah(currentSurah + 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };
  const goPrevSurah = () => {
    if (currentSurah > 1) {
      clearSelection();
      setCurrentSurah(currentSurah - 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const goNextPage = () => {
    if (currentPage < TOTAL_PAGES) { clearSelection(); setCurrentPage(currentPage + 1); }
  };
  const goPrevPage = () => {
    if (currentPage > 1) { clearSelection(); setCurrentPage(currentPage - 1); }
  };

  const zoomIn = () => {
    const cur = settings.mushafScale ?? 1;
    updateSettings({ mushafScale: Math.min(3, Math.round((cur + 0.25) * 100) / 100) });
  };
  const zoomOut = () => {
    const cur = settings.mushafScale ?? 1;
    updateSettings({ mushafScale: Math.max(0.75, Math.round((cur - 0.25) * 100) / 100) });
  };

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (isMushaf) {
        if (e.key === "ArrowRight") goPrevPage();
        if (e.key === "ArrowLeft") goNextPage();
      } else {
        if (e.key === "ArrowRight") goPrevSurah();
        if (e.key === "ArrowLeft") goNextSurah();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });

  const toggleDark = () => {
    const isDark = !darkMode;
    setDarkMode(isDark);
    document.documentElement.classList.toggle("dark", isDark);
  };

  const isFirstLoad = !isMushaf && isLoading && !surahData;

  return (
    <div
      className="flex flex-col min-h-screen bg-background text-foreground"
      style={isMushaf ? { height: "100dvh", overflow: "hidden" } : undefined}
    >
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 bg-background/90 backdrop-blur-sm border-b border-border grid grid-cols-[auto_1fr_auto] items-center px-4 py-2.5">
        <Link href="/analytics">
          <button
            className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            aria-label="Analytics"
          >
            <BarChart2 className="w-5 h-5" />
          </button>
        </Link>

        <SurahSelectorButton
          chapter={chapter}
          surahNumber={currentSurah}
          onClick={() => setSurahPickerOpen(true)}
        />

        <div className="flex items-center gap-1">
          <button
            onClick={handleModeSwitch}
            className={`p-2 rounded-lg hover:bg-muted transition-colors ${isMushaf ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
            aria-label={isMushaf ? "Switch to Reading mode" : "Switch to Mushaf mode"}
            title={isMushaf ? "Reading mode" : "Mushaf mode"}
          >
            {isMushaf ? (
              <AlignLeft className="w-5 h-5" />
            ) : (
              <BookOpen className="w-5 h-5" />
            )}
          </button>

          <button
            onClick={toggleDark}
            className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            aria-label="Toggle dark mode"
          >
            {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>

          <button
            onClick={() => setSettingsOpen(true)}
            className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            aria-label="Settings"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* ── Main content ────────────────────────────────────────────────── */}
      <main
        className={`flex-1 ${isMushaf ? "flex flex-col min-h-0" : "overflow-auto"}`}
      >
        {isFirstLoad && (
          <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">
              Loading {chapter?.nameSimple ?? `Surah ${currentSurah}`}…
            </p>
          </div>
        )}

        {error && (
          <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 px-4">
            <AlertCircle className="w-8 h-8 text-destructive" />
            <p className="text-sm text-destructive text-center max-w-xs">{error}</p>
            <button
              onClick={() => {
                setError(null);
                loadSurah(currentSurah);
              }}
              className="text-sm text-primary underline"
            >
              Try again
            </button>
          </div>
        )}

        {isMushaf && (
          <MushafSvgPage pageNumber={currentPage} scale={settings.mushafScale ?? 1} />
        )}

        {!error && !isFirstLoad && !isMushaf && surahData && (
          <SurahReadingView
            surahNumber={currentSurah}
            ayahs={surahData.ayahs}
            chapter={chapter}
            fontSize={settings.fontSize}
          />
        )}
      </main>

      {/* ── Footer navigation ───────────────────────────────────────────── */}
      <footer className="sticky bottom-0 z-30 bg-background/90 backdrop-blur-sm border-t border-border">
        {/* ── Brush fineness toggle — shown in both modes ── */}
        <div className="flex items-center justify-center py-1.5 border-b border-border/40">
          <BrushFinenessToggle />
        </div>

        {isMushaf ? (
          <div className="max-w-lg mx-auto">
            {/* ── Zoom row ── */}
            <div className="flex items-center justify-center gap-2 px-6 pt-2 pb-1">
              <button
                onClick={zoomOut}
                disabled={(settings.mushafScale ?? 1) <= 0.75}
                aria-label="Zoom out"
                className="w-7 h-7 rounded-lg flex items-center justify-center text-base font-medium border border-border hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors leading-none"
              >
                −
              </button>
              <span className="text-xs tabular-nums text-muted-foreground w-10 text-center">
                {Math.round((settings.mushafScale ?? 1) * 100)}%
              </span>
              <button
                onClick={zoomIn}
                disabled={(settings.mushafScale ?? 1) >= 3}
                aria-label="Zoom in"
                className="w-7 h-7 rounded-lg flex items-center justify-center text-base font-medium border border-border hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors leading-none"
              >
                +
              </button>
            </div>

            {/* ── Page nav row ── */}
            <div className="flex items-center justify-between px-6 pb-3 pt-1">
              <button
                onClick={goPrevPage}
                disabled={currentPage <= 1}
                aria-label="Previous page"
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-sm font-medium"
              >
                <ChevronLeft className="w-4 h-4" />
                Prev
              </button>

              <div className="flex gap-1">
                {[-2, -1, 0, 1, 2].map((offset) => {
                  const p = currentPage + offset;
                  if (p < 1 || p > TOTAL_PAGES) return null;
                  return (
                    <button
                      key={p}
                      onClick={() => setCurrentPage(p)}
                      className={`w-8 h-8 rounded-lg text-xs font-medium transition-colors ${
                        p === currentPage
                          ? "bg-primary text-primary-foreground"
                          : "hover:bg-muted text-muted-foreground"
                      }`}
                    >
                      {p}
                    </button>
                  );
                })}
              </div>

              <button
                onClick={goNextPage}
                disabled={currentPage >= TOTAL_PAGES}
                aria-label="Next page"
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-sm font-medium"
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between px-6 py-3 max-w-lg mx-auto">
            <button
              onClick={goPrevSurah}
              disabled={currentSurah <= 1}
              aria-label="Previous surah"
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-sm font-medium"
            >
              <ChevronLeft className="w-4 h-4" />
              Prev
            </button>

            <button
              onClick={() => setSurahPickerOpen(true)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors tabular-nums"
            >
              {currentSurah} / {TOTAL_SURAHS}
            </button>

            <button
              onClick={goNextSurah}
              disabled={currentSurah >= TOTAL_SURAHS}
              aria-label="Next surah"
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-sm font-medium"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </footer>

      {/* ── Modals ──────────────────────────────────────────────────────── */}
      <SurahPickerModal
        open={surahPickerOpen}
        onClose={() => setSurahPickerOpen(false)}
        chapters={chapters}
        currentSurah={currentSurah}
        onSelect={(n) => {
          setCurrentSurah(n);
          if (isMushaf) {
            const startPage = chapters[n]?.mushafStartPage;
            if (startPage) setCurrentPage(startPage);
          }
          window.scrollTo({ top: 0 });
        }}
      />

      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        fontSize={settings.fontSize}
        setFontSize={(n) => updateSettings({ fontSize: n })}
        showTranslation={settings.showTranslation}
        setShowTranslation={(v) => updateSettings({ showTranslation: v })}
        isMushafMode={isMushaf}
      />

      <ReviewQueuePanel chapters={chapters} />
      <AudioControlBar chapters={chapters} />
    </div>
  );
}
