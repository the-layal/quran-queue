import { useEffect, useLayoutEffect, useRef, useState, useCallback } from "react";
import { Loader2, AlertCircle } from "lucide-react";

interface MushafSvgPageProps {
  pageNumber: number;
  scale?: number;
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

export default function MushafSvgPage({ pageNumber, scale = 1 }: MushafSvgPageProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [svgText, setSvgText] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const activeWordIdRef = useRef<string | null>(null);
  const hoverRectRef = useRef<SVGRectElement | null>(null);
  const hoverWordRef = useRef<Element | null>(null);
  const [availH, setAvailH] = useState(0);

  useLayoutEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const h = entries[0]?.contentRect.height ?? 0;
      setAvailH(h);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const containerHeight = Math.round((availH > 0 ? availH : 600) * scale);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    activeWordIdRef.current = null;
    hoverRectRef.current = null;

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

    return () => { cancelled = true; };
  }, [pageNumber]);

  useEffect(() => {
    const next = pageNumber + 1;
    const prev = pageNumber - 1;
    if (next <= 604 && !SVG_CACHE.has(next)) fetchSvgPage(next).catch(() => {});
    if (prev >= 1 && !SVG_CACHE.has(prev)) fetchSvgPage(prev).catch(() => {});
  }, [pageNumber]);

  // Inject transparent hit-rects covering each word's full bounding box so
  // hovering anywhere inside the word area (including gaps between letter
  // paths) triggers pointer events correctly.
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || !svgText) return;
    const wordGroups = container.querySelectorAll<SVGGElement>("g[data-word-index-in-ayah]");
    wordGroups.forEach((wordEl) => {
      try {
        const bbox = wordEl.getBBox();
        if (bbox.width === 0 && bbox.height === 0) return;
        const hitRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        hitRect.setAttribute("x", String(bbox.x));
        hitRect.setAttribute("y", String(bbox.y));
        hitRect.setAttribute("width", String(bbox.width));
        hitRect.setAttribute("height", String(bbox.height));
        hitRect.classList.add("md-hit-rect");
        wordEl.appendChild(hitRect);
      } catch {
        // getBBox can throw for hidden elements; skip silently
      }
    });
  }, [svgText]);

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

  const removeHoverRect = useCallback(() => {
    if (hoverRectRef.current) {
      hoverRectRef.current.remove();
      hoverRectRef.current = null;
    }
  }, []);

  const clearHoverWord = useCallback(() => {
    if (hoverWordRef.current) {
      hoverWordRef.current.classList.remove("md-word-hovered");
      hoverWordRef.current = null;
    }
  }, []);

  const getWordGroup = useCallback((target: Element, currentTarget: Element): Element | null => {
    let el: Element | null = target;
    while (el && el !== currentTarget) {
      if (el.hasAttribute("data-word-index-in-ayah")) return el;
      el = el.parentElement;
    }
    return null;
  }, []);

  const handleMouseOver = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const wordEl = getWordGroup(e.target as Element, e.currentTarget);

      if (!wordEl) {
        clearHoverWord();
        removeHoverRect();
        return;
      }

      // Apply hover class for text colour change
      if (hoverWordRef.current !== wordEl) {
        clearHoverWord();
        wordEl.classList.add("md-word-hovered");
        hoverWordRef.current = wordEl;
      }

      // Position / move the hover highlight rect
      let svgBBox: SVGRect;
      try {
        svgBBox = (wordEl as SVGGElement).getBBox();
      } catch {
        return;
      }
      if (svgBBox.width === 0 && svgBBox.height === 0) return;

      const padX = 3;
      const padY = 2;
      let rect = hoverRectRef.current;
      if (!rect) {
        rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        rect.setAttribute("rx", "6");
        rect.classList.add("md-hover-rect");
        hoverRectRef.current = rect;
      }
      // Insert before first child so rect renders behind the text paths
      wordEl.insertBefore(rect, wordEl.firstChild);
      rect.setAttribute("x", String(svgBBox.x - padX));
      rect.setAttribute("y", String(svgBBox.y - padY));
      rect.setAttribute("width", String(svgBBox.width + padX * 2));
      rect.setAttribute("height", String(svgBBox.height + padY * 2));
    },
    [getWordGroup, clearHoverWord, removeHoverRect]
  );

  const handleMouseLeave = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const related = e.relatedTarget as Element | null;
      if (related instanceof Node && e.currentTarget.contains(related)) {
        const wordEl = getWordGroup(related, e.currentTarget);
        if (wordEl) return;
      }
      clearHoverWord();
      removeHoverRect();
    },
    [getWordGroup, clearHoverWord, removeHoverRect]
  );

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const wordEl = getWordGroup(e.target as Element, e.currentTarget);
      if (!wordEl) return;
      const wordId = wordEl.id;
      if (!wordId) return;
      if (activeWordIdRef.current === wordId) {
        wordEl.classList.remove("md-word-active");
        activeWordIdRef.current = null;
        return;
      }
      clearActiveWord();
      wordEl.classList.add("md-word-active");
      activeWordIdRef.current = wordId;
    },
    [getWordGroup, clearActiveWord]
  );

  return (
    <div ref={wrapperRef} className="mushaf-svg-wrapper flex-1 overflow-auto">
      {loading && (
        <div className="flex flex-col items-center justify-center h-full gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading page {pageNumber}…</p>
        </div>
      )}

      {error && (
        <div className="flex flex-col items-center justify-center h-full gap-3 px-4">
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
      )}

      {!loading && !error && svgText && (
        <div className="mushaf-svg-outer">
          <div
            ref={containerRef}
            className="mushaf-svg-container"
            style={{ height: `${containerHeight}px` }}
            onClick={handleClick}
            onMouseOver={handleMouseOver}
            onMouseLeave={handleMouseLeave}
            dangerouslySetInnerHTML={{ __html: svgText }}
          />
        </div>
      )}
    </div>
  );
}
