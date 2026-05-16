/*
import { X } from "lucide-react";
import { useQuranStore } from "../store/quranStore";

const UTHMANIC_FONT = "UthmanicHafs1Ver18, 'Scheherazade New', serif";

function resolveWordText(
  wordId: string,
  surahCache: ReturnType<typeof useQuranStore.getState>["surahCache"]
): string | null {
  const parts = wordId.split(":");
  if (parts.length !== 3) return null;
  const [s, a, w] = parts;
  const surahNum = parseInt(s, 10);
  const ayahNum = parseInt(a, 10);
  const wordIdx = parseInt(w, 10);

  // Reading mode: word data lives in the surah cache
  const surahData = surahCache.get(surahNum);
  if (surahData) {
    for (const ayah of surahData.ayahs) {
      if (ayah.numberInSurah === ayahNum) {
        for (const word of ayah.words) {
          if (word.wordIndex === wordIdx && word.text) {
            return word.text;
          }
        }
        break;
      }
    }
  }

  // Mushaf mode fallback: read data-hafs from SVG DOM
  const sp = s.padStart(3, "0");
  const ap = a.padStart(3, "0");
  const svgEl = document.querySelector<Element>(
    `g[data-surah="${sp}"][data-aya="${ap}"][data-word-index-in-ayah="${w}"][data-type="text"]`
  );
  const hafs = svgEl?.getAttribute("data-hafs") ?? null;
  if (hafs && /[\u0600-\u06FF]/.test(hafs)) return hafs;

  return null;
}

export default function VersePreviewChip() {
  const selectedWordIds = useQuranStore((s) => s.selectedWordIds);
  const clearSelection = useQuranStore((s) => s.clearSelection);
  const surahCache = useQuranStore((s) => s.surahCache);

  const hasSelection = selectedWordIds.length > 0;

  const resolvedWords = hasSelection
    ? selectedWordIds.map((id) => resolveWordText(id, surahCache)).filter((t): t is string => t !== null)
    : [];

  const arabicText = resolvedWords.join(" ");

  return (
    <div
      className="overflow-hidden transition-all duration-200 ease-out"
      style={{
        maxHeight: hasSelection ? "96px" : "0px",
        opacity: hasSelection ? 1 : 0,
      }}
    >
      <div className="mx-3 my-2 flex items-center gap-2 rounded-xl border border-border bg-card shadow-sm px-2 py-1.5">
        <button
          onClick={clearSelection}
          aria-label="Clear selection"
          className="flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-full bg-muted hover:bg-destructive/15 hover:text-destructive text-muted-foreground transition-colors border border-border"
        >
          <X className="w-4 h-4" />
        </button>
        <div className="w-px self-stretch bg-border flex-shrink-0" />
        <div
          dir="rtl"
          lang="ar"
          className="min-w-0 flex-1 text-foreground"
          style={{
            fontFamily: UTHMANIC_FONT,
            fontSize: "1.1rem",
            lineHeight: "1.7",
            overflow: "hidden",
            display: "-webkit-box",
            WebkitBoxOrient: "vertical",
            WebkitLineClamp: 2,
          }}
        >
          {arabicText || (
            <span className="text-muted-foreground text-xs" style={{ fontFamily: "inherit" }}>
              {selectedWordIds.length} word{selectedWordIds.length !== 1 ? "s" : ""} selected
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
*/

export {};
