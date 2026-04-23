import { useEffect, useRef, useState, useCallback } from "react";
import { Loader2, AlertCircle } from "lucide-react";

interface MushafSvgPageProps {
  pageNumber: number;
}

const SVG_CACHE = new Map<number, string>();

async function fetchSvgPage(pageNum: number): Promise<string> {
  if (SVG_CACHE.has(pageNum)) return SVG_CACHE.get(pageNum)!;
  const url = `/api/mushaf-svg/${pageNum}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load page ${pageNum}: ${res.status}`);
  const text = await res.text();
  SVG_CACHE.set(pageNum, text);
  return text;
}

export default function MushafSvgPage({ pageNumber }: MushafSvgPageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svgText, setSvgText] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const activeWordIdRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    activeWordIdRef.current = null;

    fetchSvgPage(pageNumber)
      .then((text) => {
        if (!cancelled) {
          setSvgText(text);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load page");
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [pageNumber]);

  useEffect(() => {
    const next = pageNumber + 1;
    const prev = pageNumber - 1;
    if (next <= 604 && !SVG_CACHE.has(next)) fetchSvgPage(next).catch(() => {});
    if (prev >= 1 && !SVG_CACHE.has(prev)) fetchSvgPage(prev).catch(() => {});
  }, [pageNumber]);

  const clearActiveWord = useCallback(() => {
    const prev = activeWordIdRef.current;
    if (prev && containerRef.current) {
      containerRef.current.querySelector(`#${prev}`)?.classList.remove("md-word-active");
    }
    activeWordIdRef.current = null;
  }, []);

  useEffect(() => {
    clearActiveWord();
  }, [pageNumber, clearActiveWord]);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      let el: Element | null = e.target as Element;
      while (el && el !== e.currentTarget) {
        if (el.hasAttribute("data-word-index-in-ayah")) break;
        el = el.parentElement;
      }
      if (!el || el === e.currentTarget) return;

      const wordId = el.id;
      if (!wordId) return;

      if (activeWordIdRef.current === wordId) {
        el.classList.remove("md-word-active");
        activeWordIdRef.current = null;
        return;
      }

      clearActiveWord();
      el.classList.add("md-word-active");
      activeWordIdRef.current = wordId;
    },
    [clearActiveWord]
  );

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Loading page {pageNumber}…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 gap-3 px-4">
        <AlertCircle className="w-8 h-8 text-destructive" />
        <p className="text-sm text-destructive text-center max-w-xs">{error}</p>
        <button
          onClick={() => {
            SVG_CACHE.delete(pageNumber);
            setLoading(true);
            setError(null);
            fetchSvgPage(pageNumber)
              .then((t) => { setSvgText(t); setLoading(false); })
              .catch((err) => { setError(err.message); setLoading(false); });
          }}
          className="text-sm text-primary underline"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="mushaf-svg-wrapper flex-1 flex items-center justify-center p-2 sm:p-4 overflow-hidden">
      <div
        ref={containerRef}
        className="mushaf-svg-container"
        onClick={handleClick}
        dangerouslySetInnerHTML={{ __html: svgText ?? "" }}
      />
    </div>
  );
}
