import { useEffect, useCallback, useState } from "react";
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
} from "lucide-react";
import { useQuranStore } from "../store/quranStore";
import { fetchQuranPage, fetchMushafPage, TOTAL_PAGES } from "../services/quranApi";
import type { QuranAyah, QuranPage as QuranPageData } from "../types/quran";
import SurahHeader from "../components/SurahHeader";
import MushafPage from "../components/MushafPage";

// ── Reading mode sub-components ───────────────────────────────────────────────

function AyahNumber({ n }: { n: number }) {
  return (
    <span
      className="ayah-number inline-flex items-center justify-center mx-1 text-primary select-none"
      aria-label={`Ayah ${n}`}
    >
      ﴿<span className="mx-0.5 text-xs font-semibold">{n}</span>﴾
    </span>
  );
}

function AyahBlock({ ayah }: { ayah: QuranAyah }) {
  return (
    <span className="ayah-block">
      {ayah.words.map((word) => (
        <span
          key={word.spanId}
          id={word.spanId}
          className="quran-word font-quran cursor-default transition-colors duration-150 rounded px-0.5 hover:bg-primary/10"
          data-surah={word.surahNumber}
          data-ayah={word.ayahNumber}
          data-word={word.wordIndex}
        >
          {word.text}
          {" "}
        </span>
      ))}
      <AyahNumber n={ayah.numberInSurah} />
    </span>
  );
}

function PageContent({
  pageData,
  fontSize,
}: {
  pageData: QuranPageData;
  fontSize: number;
}) {
  const ayahsBySurah = groupAyahsBySurah(pageData.ayahs);

  return (
    <div className="quran-page-content px-4 py-6 max-w-2xl mx-auto">
      {ayahsBySurah.map(({ surah, ayahs, isFirstSurahOnPage }) => (
        <div key={surah.number} className="surah-block">
          {isFirstSurahOnPage && <SurahHeader surah={surah} />}
          <div
            className="quran-text leading-loose text-right"
            dir="rtl"
            lang="ar"
            style={{ fontSize: `${fontSize}px` }}
          >
            {ayahs.map((ayah) => (
              <AyahBlock
                key={`${ayah.surah.number}:${ayah.numberInSurah}`}
                ayah={ayah}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

interface SurahGroup {
  surah: QuranAyah["surah"];
  ayahs: QuranAyah[];
  isFirstSurahOnPage: boolean;
}

function groupAyahsBySurah(ayahs: QuranAyah[]): SurahGroup[] {
  const groups: SurahGroup[] = [];
  let currentSurahNumber = -1;

  for (const ayah of ayahs) {
    if (ayah.surah.number !== currentSurahNumber) {
      groups.push({ surah: ayah.surah, ayahs: [ayah], isFirstSurahOnPage: true });
      currentSurahNumber = ayah.surah.number;
    } else {
      groups[groups.length - 1].ayahs.push(ayah);
    }
  }

  return groups;
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
                min={18}
                max={44}
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
              Font size is fixed in Mushaf view — it scales automatically to fit the page.
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

// ── Page number input ─────────────────────────────────────────────────────────

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
    currentPage,
    viewMode,
    pageCache,
    mushafPageCache,
    settings,
    isLoading,
    error,
    setCurrentPage,
    setViewMode,
    setPageData,
    setMushafPageData,
    setLoading,
    setError,
    updateSettings,
  } = useQuranStore();

  const [darkMode, setDarkMode] = useState(() =>
    document.documentElement.classList.contains("dark")
  );
  const [settingsOpen, setSettingsOpen] = useState(false);

  const isMushaf = viewMode === "mushaf";
  const pageData = pageCache.get(currentPage);
  const mushafPageData = mushafPageCache.get(currentPage);

  // ── Load current page in reading mode ──────────────────────────────────────
  const loadReadingPage = useCallback(
    async (page: number) => {
      if (pageCache.has(page)) return;
      setLoading(true);
      setError(null);
      try {
        const data = await fetchQuranPage(page);
        setPageData(page, data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load page");
      } finally {
        setLoading(false);
      }
    },
    [pageCache, setLoading, setError, setPageData]
  );

  // ── Load current page in mushaf mode ───────────────────────────────────────
  const loadMushafPage = useCallback(
    async (page: number) => {
      if (mushafPageCache.has(page)) return;
      setLoading(true);
      setError(null);
      try {
        const data = await fetchMushafPage(page);
        setMushafPageData(page, data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load Mushaf page");
      } finally {
        setLoading(false);
      }
    },
    [mushafPageCache, setLoading, setError, setMushafPageData]
  );

  // Load on page/mode change
  useEffect(() => {
    if (isMushaf) {
      loadMushafPage(currentPage);
    } else {
      loadReadingPage(currentPage);
    }
  }, [currentPage, isMushaf, loadMushafPage, loadReadingPage]);

  // Prefetch adjacent pages
  useEffect(() => {
    const next = currentPage + 1;
    const prev = currentPage - 1;
    if (isMushaf) {
      if (next <= TOTAL_PAGES && !mushafPageCache.has(next))
        fetchMushafPage(next).then((d) => setMushafPageData(next, d)).catch(() => {});
      if (prev >= 1 && !mushafPageCache.has(prev))
        fetchMushafPage(prev).then((d) => setMushafPageData(prev, d)).catch(() => {});
    } else {
      if (next <= TOTAL_PAGES && !pageCache.has(next))
        fetchQuranPage(next).then((d) => setPageData(next, d)).catch(() => {});
      if (prev >= 1 && !pageCache.has(prev))
        fetchQuranPage(prev).then((d) => setPageData(prev, d)).catch(() => {});
    }
  }, [currentPage, isMushaf, pageCache, mushafPageCache, setPageData, setMushafPageData]);

  const goNext = () => {
    if (currentPage < TOTAL_PAGES) setCurrentPage(currentPage + 1);
  };
  const goPrev = () => {
    if (currentPage > 1) setCurrentPage(currentPage - 1);
  };

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") goPrev();
      if (e.key === "ArrowLeft") goNext();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  });

  const toggleDark = () => {
    const isDark = !darkMode;
    setDarkMode(isDark);
    document.documentElement.classList.toggle("dark", isDark);
  };

  const currentData = isMushaf ? mushafPageData : pageData;
  const isFirstLoad = isLoading && !currentData;

  return (
    <div
      className="flex flex-col min-h-screen bg-background text-foreground"
      style={isMushaf ? { height: "100dvh", overflow: "hidden" } : undefined}
    >
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 bg-background/90 backdrop-blur-sm border-b border-border flex items-center justify-between px-4 py-2.5">
        <Link href="/analytics">
          <button
            className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            aria-label="Analytics"
          >
            <BarChart2 className="w-5 h-5" />
          </button>
        </Link>

        <PageInput currentPage={currentPage} totalPages={TOTAL_PAGES} onGo={setCurrentPage} />

        <div className="flex items-center gap-1">
          {/* View mode toggle */}
          <button
            onClick={() => setViewMode(isMushaf ? "reading" : "mushaf")}
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

      {/* ── Main content ──────────────────────────────────────────────────── */}
      <main className={`flex-1 ${isMushaf ? "flex flex-col overflow-hidden" : "overflow-auto"}`}>
        {isFirstLoad && (
          <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Loading page {currentPage}…</p>
          </div>
        )}

        {error && (
          <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 px-4">
            <AlertCircle className="w-8 h-8 text-destructive" />
            <p className="text-sm text-destructive text-center max-w-xs">{error}</p>
            <button
              onClick={() => {
                setError(null);
                if (isMushaf) loadMushafPage(currentPage);
                else loadReadingPage(currentPage);
              }}
              className="text-sm text-primary underline"
            >
              Try again
            </button>
          </div>
        )}

        {!error && !isFirstLoad && isMushaf && mushafPageData && (
          <MushafPage pageData={mushafPageData} />
        )}

        {!error && !isFirstLoad && !isMushaf && pageData && (
          <PageContent pageData={pageData} fontSize={settings.fontSize} />
        )}
      </main>

      {/* ── Footer navigation ─────────────────────────────────────────────── */}
      <footer className="sticky bottom-0 z-30 bg-background/90 backdrop-blur-sm border-t border-border">
        <div className="flex items-center justify-between px-6 py-3 max-w-lg mx-auto">
          <button
            onClick={goPrev}
            disabled={currentPage <= 1}
            aria-label="Previous page"
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-sm font-medium"
          >
            <ChevronRight className="w-4 h-4" />
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
            onClick={goNext}
            disabled={currentPage >= TOTAL_PAGES}
            aria-label="Next page"
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-sm font-medium"
          >
            Next
            <ChevronLeft className="w-4 h-4" />
          </button>
        </div>
      </footer>

      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        fontSize={settings.fontSize}
        setFontSize={(n) => updateSettings({ fontSize: n })}
        showTranslation={settings.showTranslation}
        setShowTranslation={(v) => updateSettings({ showTranslation: v })}
        isMushafMode={isMushaf}
      />
    </div>
  );
}
