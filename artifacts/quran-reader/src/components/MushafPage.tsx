import { useRef, useEffect, useState } from "react";
import type { MushafPageData, MushafLine, MushafWord } from "../types/quran";

interface MushafPageProps {
  pageData: MushafPageData;
}

function WordSpan({ word }: { word: MushafWord }) {
  if (word.charType === "end") {
    return (
      <span
        className="mushaf-ayah-end font-quran select-none"
        aria-label={`End of verse ${word.ayahNumber}`}
      >
        {word.text}
      </span>
    );
  }

  return (
    <span
      id={word.spanId}
      className="quran-word mushaf-word font-quran"
      data-surah={word.surahNumber}
      data-ayah={word.ayahNumber}
      data-word={word.wordIndex}
    >
      {word.text}
    </span>
  );
}

function SurahNameLine({
  line,
  fontSize,
}: {
  line: MushafLine;
  fontSize: number;
}) {
  const isName = line.headerType === "surah-name";

  if (isName) {
    return (
      <div className="mushaf-surah-name-line flex flex-col items-center justify-center w-full h-full px-2">
        <div className="mushaf-surah-box w-full max-w-[90%] border border-primary/60 rounded px-3 py-1 text-center">
          <div
            className="font-quran text-foreground"
            dir="rtl"
            lang="ar"
            style={{ fontSize: `${Math.floor(fontSize * 1.1)}px`, lineHeight: 1.5 }}
          >
            {line.surahName}
          </div>
          {line.surahEnglishName && (
            <div
              className="text-muted-foreground tracking-widest uppercase"
              style={{ fontSize: `${Math.floor(fontSize * 0.38)}px`, marginTop: 2 }}
            >
              {line.surahEnglishName}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Bismillah line
  return (
    <div className="flex items-center justify-center w-full h-full">
      <span
        className="font-quran text-foreground"
        dir="rtl"
        lang="ar"
        style={{ fontSize: `${Math.floor(fontSize * 0.9)}px` }}
      >
        {line.surahName}
      </span>
    </div>
  );
}

function MushafLineRow({
  line,
  fontSize,
}: {
  line: MushafLine;
  fontSize: number;
}) {
  if (line.headerType) {
    return (
      <div className="mushaf-line mushaf-header-line flex-1">
        <SurahNameLine line={line} fontSize={fontSize} />
      </div>
    );
  }

  const hasWords = line.words.length > 0;
  const realWordCount = line.words.filter((w) => w.charType === "word").length;
  const justifyContent = realWordCount >= 4 ? "space-between" : "center";

  return (
    <div
      className={`mushaf-line flex-1 flex items-center ${hasWords ? "px-3" : "justify-center"}`}
      dir="rtl"
      lang="ar"
    >
      {hasWords && (
        <div
          className="mushaf-line-words w-full flex flex-row-reverse items-baseline"
          style={{ fontSize: `${fontSize}px`, lineHeight: 1.7, justifyContent, gap: "0 0.15em" }}
        >
          {line.words.map((word) => (
            <WordSpan key={`${word.spanId}-${word.lineNumber}`} word={word} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function MushafPage({ pageData }: MushafPageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [fontSize, setFontSize] = useState(18);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateSize = () => {
      const lineHeight = el.clientHeight / 15;
      setFontSize(Math.max(10, Math.floor(lineHeight * 0.44)));
    };

    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="mushaf-page-wrapper flex-1 flex items-center justify-center p-3 sm:p-5 overflow-hidden">
      <div
        ref={containerRef}
        className="mushaf-page relative flex flex-col bg-[hsl(var(--mushaf-bg))] border border-[hsl(var(--mushaf-border))] shadow-xl"
      >
        {/* Decorative inner border */}
        <div className="mushaf-inner-border absolute inset-[5px] border border-[hsl(var(--mushaf-border)/0.5)] pointer-events-none rounded-sm" />

        {/* Page number badge */}
        <div
          className="absolute bottom-1 left-1/2 -translate-x-1/2 text-muted-foreground tabular-nums"
          style={{ fontSize: "9px" }}
        >
          {pageData.pageNumber}
        </div>

        {/* Lines */}
        {pageData.lines.map((line) => (
          <MushafLineRow key={line.lineNumber} line={line} fontSize={fontSize} />
        ))}
      </div>
    </div>
  );
}
