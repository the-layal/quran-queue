import { useEffect, useCallback, useState, useRef, type RefObject } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ListMusic,
  Moon,
  Sun,
  Loader2,
  AlertCircle,
  BookOpen,
  AlignLeft,
  ChevronDown,
  Search,
  X,
  Eye,
  RotateCcw,
  Bookmark,
  BookmarkCheck,
} from "lucide-react";
import { useBookmarks } from "../hooks/useBookmarks";
import AppShell from "../components/AppShell";
import { useQuranStore } from "../store/quranStore";
import {
  fetchSurahVerses,
  fetchSurahTranslation,
  loadChapters,
  TOTAL_PAGES,
  TOTAL_SURAHS,
} from "../services/quranApi";
import type { QuranAyah, ChapterMap, ChapterInfo } from "../types/quran";
import SurahHeader from "../components/SurahHeader";
import MushafSvgPage from "../components/MushafSvgPage";
import BrushFinenessToggle from "../components/BrushFinenessToggle";
import BlindReviewToggle from "../components/BlindReviewToggle";
import AudioControlBar from "../components/AudioControlBar";
import ReviewQueuePanel from "../components/ReviewQueuePanel";
import BookmarksPanel from "../components/BookmarksPanel";
import { useSmartBrush } from "../hooks/useSmartBrush";
import { useQueuePlayback } from "../hooks/useQueuePlayback";

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

// ── Blind review helpers ──────────────────────────────────────────────────────

// Returns word IDs in Quran order for the currently visible view.
// Reading mode: span IDs from .quran-word elements (JSON "S:A:W" format).
// Mushaf mode:  "S:A:W" built from SVG data-attributes (SVG word indices).
function getOrderedWordIds(isMushaf: boolean): string[] {
  if (!isMushaf) {
    return Array.from(document.querySelectorAll<HTMLElement>(".quran-word[id]"))
      .map((el) => el.id)
      .filter(Boolean);
  }
  return Array.from(
    document.querySelectorAll<SVGGElement>('g[data-word-index-in-ayah][data-type="text"]')
  )
    .map((el) => {
      const s = parseInt(el.getAttribute("data-surah") || "0", 10);
      const a = parseInt(el.getAttribute("data-aya") || "0", 10);
      const w = parseInt(el.getAttribute("data-word-index-in-ayah") || "0", 10);
      const hafs = el.getAttribute("data-hafs") ?? "";
      // Skip waqf/pause marks (hafs present but contains no Arabic letter)
      if (hafs && !/[\u0600-\u06FF]/.test(hafs)) return null;
      if (!s || !a || !w) return null;
      return { id: `${s}:${a}:${w}`, s, a, w };
    })
    .filter((x): x is { id: string; s: number; a: number; w: number } => x !== null)
    .sort((x, y) => x.s - y.s || x.a - y.a || x.w - y.w)
    .map((x) => x.id);
}

// Per-page promise cache. Every consumer awaits the same shared promise so
// concurrent mounts (e.g. Mushaf → Reading switch while a prior load is still
// in flight) don't race ahead and render with fallback glyphs (tofu).
const qpcPagePromises = new Map<number, Promise<void>>();

const FONT_TIMEOUT_MS = 10_000;

function loadQpcPage(pageNum: number): Promise<void> {
  const cached = qpcPagePromises.get(pageNum);
  if (cached) return cached;

  const family = `QCFv2p${pageNum}`;
  const url = `/api/font/qpc-v2/p${pageNum}.ttf`;
  // display: "block" (NOT "swap") — QPC v2 glyphs use Private Use Area
  // codepoints with no fallback. "swap" would paint tofu squares with a
  // system serif until the real font arrives. "block" hides the text
  // until the font loads, which combined with the loading screen below
  // means users never see broken glyphs.
  const face = new FontFace(family, `url(${url})`, {
    display: "block",
    style: "normal",
    weight: "normal",
  });

  // Store the real load promise in cache so a background load that completes
  // after a timeout is not discarded — future callers will resolve instantly.
  const loadAndAdd: Promise<void> = face.load().then(
    (loaded) => {
      document.fonts.add(loaded);
    },
    (err) => {
      // Hard failure (network error): drop from cache so a future mount can
      // retry. Do NOT drop on timeout — the load may still finish in the
      // background and benefit a subsequent navigation.
      qpcPagePromises.delete(pageNum);
      throw err;
    },
  );
  qpcPagePromises.set(pageNum, loadAndAdd);

  // Race the real load against a 10 s timeout for the current caller.
  const timeout = new Promise<void>((_, reject) =>
    setTimeout(
      () => reject(new Error(`Font load timed out: page ${pageNum}`)),
      FONT_TIMEOUT_MS,
    ),
  );
  return Promise.race([loadAndAdd, timeout]);
}

interface QpcFontsResult {
  fontsReady: boolean;
  usingFallback: boolean;
}

function useQpcFonts(ayahs: QuranAyah[], surahNumber?: number): QpcFontsResult {
  const [fontsReady, setFontsReady] = useState(false);
  const [usingFallback, setUsingFallback] = useState(false);

  useEffect(() => {
    if (ayahs.length === 0) {
      setFontsReady(false);
      setUsingFallback(false);
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

    setFontsReady(false);
    setUsingFallback(false);
    let cancelled = false;

    const pending: Promise<void>[] = [];
    pages.forEach((pageNum) => pending.push(loadQpcPage(pageNum)));

    Promise.all(pending)
      .then(() => (document.fonts ? document.fonts.ready : undefined))
      .then(() => {
        if (!cancelled) setFontsReady(true);
      })
      .catch(() => {
        // Font API timed out or failed — activate bundled Uthmanic font
        // fallback so users can still read instead of seeing a spinner forever.
        if (!cancelled) {
          setUsingFallback(true);
          setFontsReady(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [ayahs, surahNumber]);

  return { fontsReady, usingFallback };
}

const FALLBACK_FONT = "UthmanicHafs1Ver18, 'Scheherazade New', serif";

function VerseBlock({
  ayah,
  fontSize,
  translation,
  showTransliteration,
  isBookmarked,
  onToggleBookmark,
  usingFallback,
}: {
  ayah: QuranAyah;
  fontSize: number;
  translation?: string;
  showTransliteration?: boolean;
  isBookmarked?: boolean;
  onToggleBookmark?: () => void;
  usingFallback?: boolean;
}) {
  return (
    <div id={`verse-${ayah.surah.number}:${ayah.numberInSurah}`} className="verse-block group flex items-start gap-3">
      {/* Left: surah:ayah pill badge + bookmark */}
      <div className="flex-shrink-0 pt-1 flex flex-col items-center gap-1">
        <div className="ayah-badge select-none">
          {ayah.surah.number}:{ayah.numberInSurah}
        </div>
        {onToggleBookmark && (
          <button
            onClick={onToggleBookmark}
            aria-label={isBookmarked ? "Remove bookmark" : "Bookmark this ayah"}
            className={`p-1 rounded-md transition-all duration-150 ${
              isBookmarked
                ? "text-primary opacity-100"
                : "text-muted-foreground opacity-100 md:opacity-0 md:group-hover:opacity-100"
            } hover:bg-muted focus-visible:opacity-100 focus-visible:outline-none`}
            style={{ touchAction: "manipulation" }}
          >
            {isBookmarked
              ? <BookmarkCheck className="w-3.5 h-3.5" />
              : <Bookmark className="w-3.5 h-3.5" />
            }
          </button>
        )}
      </div>

      {/* Right: Arabic text block + optional transliteration + optional translation */}
      <div className="flex-1">
        <div
          className={`quran-text text-right${showTransliteration ? " quran-text--translit" : ""}`}
          dir="rtl"
          lang="ar"
          style={{ fontSize: `${fontSize}px` }}
        >
          {ayah.words.map((word) => {
            const translit = showTransliteration ? word.transliteration : undefined;
            const wordFont = usingFallback
              ? FALLBACK_FONT
              : `QCFv2p${word.pageNumber}, serif`;
            const wordText = usingFallback ? word.text : word.codeV2;
            return (
              <span
                key={word.spanId}
                id={word.spanId}
                className={translit ? "quran-word quran-word--translit" : "quran-word"}
                style={{ fontFamily: wordFont }}
                data-surah={word.surahNumber}
                data-ayah={word.ayahNumber}
                data-word={word.wordIndex}
              >
                {translit ? (
                  <>
                    <span className="quran-glyph">{wordText}{" "}</span>
                    <span className="word-translit" dir="ltr" aria-hidden="true">{translit}</span>
                  </>
                ) : (
                  <>{wordText}{" "}</>
                )}
              </span>
            );
          })}
          {ayah.endMarkerCodeV2 && !usingFallback ? (
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

        {translation !== undefined && (
          <p className="verse-translation">{translation}</p>
        )}
      </div>
    </div>
  );
}

// ── Translation hook (reading mode) ──────────────────────────────────────────

function useReadingTranslation(surahNumber: number, enabled: boolean) {
  const [translations, setTranslations] = useState<Map<number, string>>(new Map());
  const [translationLoading, setTranslationLoading] = useState(false);
  const [translationError, setTranslationError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setTranslations(new Map());
      setTranslationLoading(false);
      setTranslationError(null);
      return;
    }
    let cancelled = false;
    setTranslationLoading(true);
    setTranslationError(null);
    fetchSurahTranslation(surahNumber)
      .then((map) => {
        if (!cancelled) { setTranslations(map); setTranslationLoading(false); }
      })
      .catch((err) => {
        if (!cancelled) {
          setTranslationError(err instanceof Error ? err.message : "Failed to load translation");
          setTranslationLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [surahNumber, enabled]);

  return { translations, translationLoading, translationError };
}

// ── Surah reading view ────────────────────────────────────────────────────────

function SurahReadingView({
  surahNumber,
  ayahs,
  chapter,
  fontSize,
  showTranslation,
  showTransliteration,
}: {
  surahNumber: number;
  ayahs: QuranAyah[];
  chapter: ChapterInfo | undefined;
  fontSize: number;
  showTranslation: boolean;
  showTransliteration: boolean;
}) {
  const firstAyah = ayahs[0];
  const containerRef = useRef<HTMLDivElement>(null);
  const { fontsReady, usingFallback } = useQpcFonts(ayahs, surahNumber);
  const selectedWordIds = useQuranStore((s) => s.selectedWordIds);
  const { isBookmarked, toggleBookmark } = useBookmarks();

  const { translations, translationLoading, translationError } =
    useReadingTranslation(surahNumber, showTranslation);
  const playbackActiveIds = useQuranStore((s) => s.playbackActiveIds);
  const playbackCurrentWordId = useQuranStore((s) => s.playbackCurrentWordId);
  const blindReviewMode = useQuranStore((s) => s.blindReviewMode);
  const manuallyRevealedIds = useQuranStore((s) => s.manuallyRevealedIds);
  const lockedContextIds = useQuranStore((s) => s.lockedContextIds);
  const targetScrollAyah = useQuranStore((s) => s.targetScrollAyah);
  const setTargetScrollAyah = useQuranStore((s) => s.setTargetScrollAyah);

  // Scroll to a specific ayah requested from Saved Verses navigation
  useEffect(() => {
    if (!targetScrollAyah || targetScrollAyah.surahNumber !== surahNumber || !fontsReady) return;
    const el = document.getElementById(`verse-${surahNumber}:${targetScrollAyah.ayahNumber}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      setTargetScrollAyah(null);
    }
  }, [targetScrollAyah, surahNumber, fontsReady, setTargetScrollAyah]);

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

  // Blind review visibility: apply/remove .word-hidden class per mode.
  // surahNumber is included so the effect re-runs when the surah changes
  // (words re-render but blindReviewMode may not have changed).
  useEffect(() => {
    const allWords = Array.from(document.querySelectorAll<HTMLElement>(".quran-word"));

    if (blindReviewMode === "default") {
      allWords.forEach((el) => el.classList.remove("word-hidden"));
      return;
    }

    const revealedSet = new Set(manuallyRevealedIds);
    // Context-only: during playback hides only the currently recited word;
    // when paused/stopped falls back to hiding the active selection OR any
    // locked (confirmed) selection — see MushafSvgPage for the same pattern.
    const contextHideSet = new Set([...selectedWordIds, ...lockedContextIds]);

    allWords.forEach((el) => {
      const wordId = el.id;
      if (!wordId) return;
      let hide = false;
      if (blindReviewMode === "word-by-word") {
        hide = wordId !== playbackCurrentWordId;
      } else if (blindReviewMode === "blind") {
        hide = !revealedSet.has(wordId);
      } else if (blindReviewMode === "context-only") {
        hide = playbackCurrentWordId
          ? wordId === playbackCurrentWordId
          : contextHideSet.has(wordId);
      }
      el.classList.toggle("word-hidden", hide);
    });
  }, [blindReviewMode, manuallyRevealedIds, playbackCurrentWordId, selectedWordIds, lockedContextIds, surahNumber]);

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

      {showTranslation && translationError && (
        <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2 mb-4">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          Translation unavailable: {translationError}
        </div>
      )}

      {showTranslation && translationLoading && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground px-1 mb-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Loading translation…
        </div>
      )}

      <div className="surah-verses">
        {ayahs.map((ayah) => (
          <VerseBlock
            key={`${surahNumber}:${ayah.numberInSurah}`}
            ayah={ayah}
            fontSize={fontSize}
            showTransliteration={showTransliteration}
            translation={
              showTranslation && !translationLoading && !translationError
                ? translations.get(ayah.numberInSurah)
                : undefined
            }
            isBookmarked={isBookmarked(surahNumber, ayah.numberInSurah)}
            onToggleBookmark={() => toggleBookmark(surahNumber, ayah.numberInSurah)}
            usingFallback={usingFallback}
          />
        ))}
      </div>

      {showTranslation && (
        <div className="text-center text-xs text-muted-foreground/60 mt-6 pb-2 italic">
          Translation: The Clear Quran © Dr. Mustafa Khattab
        </div>
      )}

      <div className="text-center text-xs text-muted-foreground mt-10 pb-4 tracking-widest">
        ﴾ {surahInfo?.englishName ?? ""} ﴿
      </div>
    </div>
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
  const queuePlayback = useQueuePlayback();
  const footerRef = useRef<HTMLElement>(null);

  // Expose the footer height as a CSS variable so the main area can reserve
  // space for the fixed footer in mushaf mode without the content being hidden
  // behind it.
  useEffect(() => {
    const el = footerRef.current;
    if (!el) return;
    const apply = () => {
      document.documentElement.style.setProperty("--mushaf-footer-h", `${el.offsetHeight}px`);
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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

  const setReviewQueue = useQuranStore((s) => s.setReviewQueue);
  const setIsSharedQueue = useQuranStore((s) => s.setIsSharedQueue);
  const queuePanelOpen = useQuranStore((s) => s.queuePanelOpen);
  const setQueuePanelOpen = useQuranStore((s) => s.setQueuePanelOpen);
  const blindReviewMode = useQuranStore((s) => s.blindReviewMode);
  const manuallyRevealedIds = useQuranStore((s) => s.manuallyRevealedIds);
  const clearManualReveals = useQuranStore((s) => s.clearManualReveals);
  const clearLockedContext = useQuranStore((s) => s.clearLockedContext);
  const revealWords = useQuranStore((s) => s.revealWords);
  const selectedWordIds = useQuranStore((s) => s.selectedWordIds);
  const confirmSelection = useQuranStore((s) => s.confirmSelection);
  const hasSelection = selectedWordIds.length > 0;


  const [darkMode, setDarkMode] = useState(() =>
    document.documentElement.classList.contains("dark")
  );
  const [surahPickerOpen, setSurahPickerOpen] = useState(false);
  const [bookmarksPanelOpen, setBookmarksPanelOpen] = useState(false);
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

  // Ingest shared queue from URL param ?q=<id>
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const queueId = params.get("q");
    if (!queueId) return;

    // Remove the param from the URL so refresh doesn't re-trigger
    params.delete("q");
    const newSearch = params.toString();
    const newUrl = window.location.pathname + (newSearch ? `?${newSearch}` : "") + window.location.hash;
    window.history.replaceState(null, "", newUrl);

    fetch(`/api/queues/${encodeURIComponent(queueId)}`)
      .then((res) => {
        if (!res.ok) throw new Error("Queue not found");
        return res.json() as Promise<{ id: string; items: unknown[] }>;
      })
      .then(({ items }) => {
        if (!Array.isArray(items) || items.length === 0) return;
        setReviewQueue(items as Parameters<typeof setReviewQueue>[0]);
        setIsSharedQueue(true);
        setQueuePanelOpen(true);
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
    updateSettings({ mushafScale: Math.min(3, Math.round((cur + 0.1) * 100) / 100) });
  };
  const zoomOut = () => {
    const cur = settings.mushafScale ?? 1;
    updateSettings({ mushafScale: Math.max(0.75, Math.round((cur - 0.1) * 100) / 100) });
  };

  const fontSizeUp = () => updateSettings({ fontSize: Math.min(48, settings.fontSize + 2) });
  const fontSizeDown = () => updateSettings({ fontSize: Math.max(24, settings.fontSize - 2) });

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

  // Clear manual reveals and locked context on page/surah navigation.
  // This is the central catch-all for any indirect setCurrentPage/setCurrentSurah
  // call that doesn't go through a navigation handler that calls clearSelection().
  useEffect(() => {
    clearManualReveals();
    clearLockedContext();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, currentSurah]);

  useEffect(() => {
    if (blindReviewMode !== "blind") clearManualReveals();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blindReviewMode]);

  // ── Manual reveal handlers (Mode C) ──────────────────────────────────────
  const handleRevealWord = useCallback(() => {
    const ids = getOrderedWordIds(isMushaf);
    const revealedSet = new Set(manuallyRevealedIds);
    const next = ids.find((id) => !revealedSet.has(id));
    if (next) revealWords([next]);
  }, [isMushaf, manuallyRevealedIds, revealWords]);

  const handleRevealAyah = useCallback(() => {
    const ids = getOrderedWordIds(isMushaf);
    if (ids.length === 0) return;
    const revealedSet = new Set(manuallyRevealedIds);

    // Find the ayah of the last revealed word
    let lastRevealedAyah: string | null = null;
    for (let i = ids.length - 1; i >= 0; i--) {
      if (revealedSet.has(ids[i])) {
        const parts = ids[i].split(":");
        lastRevealedAyah = `${parts[0]}:${parts[1]}`;
        break;
      }
    }

    let targetAyah: string | null = null;
    if (lastRevealedAyah === null) {
      // Nothing revealed yet — start from the first ayah
      const parts = ids[0].split(":");
      targetAyah = `${parts[0]}:${parts[1]}`;
    } else {
      const ayahWords = ids.filter((id) => {
        const parts = id.split(":");
        return `${parts[0]}:${parts[1]}` === lastRevealedAyah;
      });
      const allRevealed = ayahWords.every((id) => revealedSet.has(id));
      if (allRevealed) {
        // Current ayah fully revealed — advance to next unrevealed ayah
        const firstUnrevealed = ids.find((id) => !revealedSet.has(id));
        if (firstUnrevealed) {
          const parts = firstUnrevealed.split(":");
          targetAyah = `${parts[0]}:${parts[1]}`;
        }
      } else {
        targetAyah = lastRevealedAyah;
      }
    }

    if (targetAyah) {
      const toReveal = ids.filter((id) => {
        const parts = id.split(":");
        return `${parts[0]}:${parts[1]}` === targetAyah;
      });
      revealWords(toReveal);
    }
  }, [isMushaf, manuallyRevealedIds, revealWords]);

  const toggleDark = () => {
    const isDark = !darkMode;
    setDarkMode(isDark);
    document.documentElement.classList.toggle("dark", isDark);
  };

  // Show the loading screen whenever we're in reading mode without data,
  // not just while a fetch is in flight. Closes the brief blank frame
  // between switching to Reading mode and the loadSurah effect setting
  // isLoading=true on a cold-cache surah.
  const isFirstLoad = !isMushaf && !surahData;

  const rightActions = (
    <>
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
        data-tour="bookmarks"
        onClick={() => setBookmarksPanelOpen((o) => !o)}
        className={`p-2 rounded-lg transition-colors ${
          bookmarksPanelOpen
            ? "bg-primary/15 text-primary"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
        }`}
        aria-label="Saved verses"
        aria-pressed={bookmarksPanelOpen}
        title="Saved verses"
      >
        <Bookmark className="w-5 h-5" />
      </button>

      <button
        onClick={() => setQueuePanelOpen(!queuePanelOpen)}
        data-tour="queue-button"
        className={`p-2 rounded-lg transition-colors ${
          queuePanelOpen
            ? "bg-primary/15 text-primary"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
        }`}
        aria-label={queuePanelOpen ? "Close review queue" : "Open review queue"}
        aria-pressed={queuePanelOpen}
        title="Review queue"
      >
        <ListMusic className="w-5 h-5" />
      </button>
    </>
  );

  const centerContent = (
    <span data-tour="surah-picker">
      <SurahSelectorButton
        chapter={chapter}
        surahNumber={currentSurah}
        onClick={() => setSurahPickerOpen(true)}
      />
    </span>
  );

  return (
    <AppShell
      rightActions={rightActions}
      centerContent={centerContent}
    >
      <BookmarksPanel open={bookmarksPanelOpen} onClose={() => setBookmarksPanelOpen(false)} />
      <div
        className="flex flex-col flex-1"
        style={isMushaf ? { height: "calc(100dvh - var(--app-header-h, 57px))", overflow: "hidden" } : undefined}
      >
      {/* ── Main content ────────────────────────────────────────────────── */}
      <main
        className={`flex-1 ${isMushaf ? "flex flex-col min-h-0" : "overflow-auto"}`}
        style={isMushaf ? { paddingBottom: "var(--mushaf-footer-h, 80px)" } : undefined}
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
            // Key on surah so a surah change remounts the view, resetting
            // fontsReady=false synchronously before the first render — this
            // prevents a one-frame paint with the previous surah's fonts.
            key={currentSurah}
            surahNumber={currentSurah}
            ayahs={surahData.ayahs}
            chapter={chapter}
            fontSize={settings.fontSize}
            showTranslation={settings.showTranslation}
            showTransliteration={settings.showTransliteration}
          />
        )}
      </main>

      {/* ── Footer navigation ───────────────────────────────────────────── */}
      <footer ref={footerRef} className={`${isMushaf ? "fixed bottom-0 right-0" : "sticky bottom-0"} z-30 bg-background/90 backdrop-blur-sm border-t border-border`} style={isMushaf ? { left: "var(--sidebar-w, 0px)" } : undefined}>
        {/* Controls row — two equal halves meeting at a fixed centre separator */}
        <div className="flex items-center py-1.5 border-b border-border/40 px-2 min-h-[38px]">
          {/* Left half — right-aligned, contains BrushFinenessToggle */}
          <div className="flex-1 flex items-center justify-end">
            <BrushFinenessToggle
              showTranslationButton={isMushaf}
              showTransliterationButton={!isMushaf}
              showReadingTranslationButton={!isMushaf}
            />
          </div>

          {/* Fixed centre separator */}
          <div className="w-px h-4 bg-border/60 flex-shrink-0 mx-1.5" aria-hidden />

          {/* Right half — left-aligned, contains blind section */}
          <div className="flex-1 flex items-center justify-start gap-1">
            <BlindReviewToggle />
            {blindReviewMode === "blind" && (
              <>
                <button
                  onClick={handleRevealWord}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  title="Reveal the next hidden word"
                  aria-label="Reveal word"
                >
                  <Eye className="w-3.5 h-3.5 flex-shrink-0" />
                  <span aria-hidden>Word</span>
                </button>
                <button
                  onClick={handleRevealAyah}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  title="Reveal all words in the next ayah"
                  aria-label="Reveal ayah"
                >
                  <Eye className="w-3.5 h-3.5 flex-shrink-0" />
                  <span aria-hidden>Ayah</span>
                </button>
                <button
                  onClick={clearManualReveals}
                  className="flex items-center justify-center w-6 h-6 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  title="Hide all revealed words"
                  aria-label="Reset reveals"
                >
                  <RotateCcw className="w-3 h-3" />
                </button>
              </>
            )}
          </div>
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
                      onClick={() => { clearSelection(); setCurrentPage(p); }}
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
          <div className="max-w-lg mx-auto">
            {/* ── Font size row ── */}
            <div className="flex items-center justify-center gap-2 px-6 pt-2 pb-1">
              <button
                onClick={fontSizeDown}
                disabled={settings.fontSize <= 24}
                aria-label="Decrease font size"
                className="w-7 h-7 rounded-lg flex items-center justify-center text-base font-medium border border-border hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors leading-none"
              >
                −
              </button>
              <span className="text-xs tabular-nums text-muted-foreground w-10 text-center">
                {settings.fontSize}px
              </span>
              <button
                onClick={fontSizeUp}
                disabled={settings.fontSize >= 48}
                aria-label="Increase font size"
                className="w-7 h-7 rounded-lg flex items-center justify-center text-base font-medium border border-border hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors leading-none"
              >
                +
              </button>
            </div>

            {/* ── Surah nav row ── */}
            <div className="flex items-center justify-between px-6 pb-3 pt-1">
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
          clearSelection();
          setCurrentSurah(n);
          if (isMushaf) {
            const startPage = chapters[n]?.mushafStartPage;
            if (startPage) setCurrentPage(startPage);
          }
          window.scrollTo({ top: 0 });
        }}
      />

      <ReviewQueuePanel chapters={chapters} queuePlayback={queuePlayback} />
      <AudioControlBar chapters={chapters} queuePlayback={queuePlayback} />
      </div>
    </AppShell>
  );
}
