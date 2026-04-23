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
  const wrapperRef  = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [svgText, setSvgText] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const activeWordIdRef = useRef<string | null>(null);
  const hoverRectRef   = useRef<SVGRectElement | null>(null);
  const hoverWordRef   = useRef<Element | null>(null);
  const [availH, setAvailH] = useState(0);

  // ── Measure wrapper height (content-box, padding-excluded) ──────────────
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

  // ── Fetch SVG page ──────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    activeWordIdRef.current = null;
    hoverRectRef.current    = null;

    fetchSvgPage(pageNumber)
      .then((text) => {
        if (!cancelled) { setSvgText(text); setLoading(false); }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load page");
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [pageNumber]);

  // ── Prefetch adjacent pages ─────────────────────────────────────────────
  useEffect(() => {
    const next = pageNumber + 1;
    const prev = pageNumber - 1;
    if (next <= 604 && !SVG_CACHE.has(next)) fetchSvgPage(next).catch(() => {});
    if (prev >= 1  && !SVG_CACHE.has(prev))  fetchSvgPage(prev).catch(() => {});
  }, [pageNumber]);

  // ── Inject transparent hit-rects into a top-level SVG layer ────────────
  //
  // WHY a separate top-level layer?
  //   - Appending rects inside each word group puts them below later
  //     sibling line-groups in SVG z-order, so those groups intercept
  //     events first.  A <g> appended as the LAST child of the <svg>
  //     is always on top of all page content.
  //
  // WHY requestAnimationFrame?
  //   - useLayoutEffect fires before the browser has finished computing
  //     SVG layout, so getBBox() returns zeros and rects are never created.
  //     rAF defers to after the first paint when layout is complete.
  useEffect(() => {
    if (!svgText) return;
    let rafId: number;

    rafId = requestAnimationFrame(() => {
      const container = containerRef.current;
      if (!container) return;
      const svg = container.querySelector("svg");
      if (!svg) return;

      // Remove any stale hit-layer from a previous page
      svg.querySelector("#md-hit-layer")?.remove();

      const hitLayer = document.createElementNS("http://www.w3.org/2000/svg", "g");
      hitLayer.id = "md-hit-layer";

      // Track the union bbox of all word groups so we can crop the viewBox to
      // the main text column, excluding margin annotations (Hizb markers, etc.)
      // that have no data-word-index-in-ayah attribute.
      let minX = Infinity;
      let maxX = -Infinity;

      const wordGroups = container.querySelectorAll<SVGGElement>("g[data-word-index-in-ayah]");
      wordGroups.forEach((wordEl) => {
        try {
          const bbox = wordEl.getBBox();
          if (bbox.width === 0 && bbox.height === 0) return;

          // Accumulate text-column extents for ALL word groups (even those
          // without an id) so the viewBox crop covers the full text column.
          if (bbox.x < minX) minX = bbox.x;
          if (bbox.x + bbox.width > maxX) maxX = bbox.x + bbox.width;

          // Hit-rects require an id to resolve back to the word group on click.
          if (!wordEl.id) return;
          const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
          rect.setAttribute("x",      String(bbox.x));
          rect.setAttribute("y",      String(bbox.y));
          rect.setAttribute("width",  String(bbox.width));
          rect.setAttribute("height", String(bbox.height));
          rect.setAttribute("data-target-word", wordEl.id);
          rect.classList.add("md-hit-rect");
          hitLayer.appendChild(rect);
        } catch {
          // getBBox can throw for hidden/detached elements — skip silently
        }
      });

      // Crop the SVG viewBox horizontally to the text column with equal padding
      // on both sides so pages with wide margin annotations stay visually centered.
      // Hit-rect coordinates are in SVG user units and are unaffected by viewBox changes.
      if (minX !== Infinity && maxX !== -Infinity) {
        const vb = svg.viewBox.baseVal;
        if (vb && vb.width > 0) {
          const pad = 30; // SVG units — symmetric left/right gutter
          svg.setAttribute(
            "viewBox",
            `${minX - pad} ${vb.y} ${maxX - minX + pad * 2} ${vb.height}`
          );
        }
      }

      // Append last so hit-layer is always on top of all SVG content
      svg.appendChild(hitLayer);
    });

    return () => cancelAnimationFrame(rafId);
  }, [svgText, scale]);

  // ── Word-state helpers ──────────────────────────────────────────────────
  const clearActiveWord = useCallback(() => {
    const prev = activeWordIdRef.current;
    if (prev && containerRef.current) {
      containerRef.current.querySelector(`#${prev}`)?.classList.remove("md-word-active");
    }
    activeWordIdRef.current = null;
  }, []);

  useEffect(() => { clearActiveWord(); }, [pageNumber, clearActiveWord]);

  const removeHoverRect = useCallback(() => {
    if (hoverRectRef.current) { hoverRectRef.current.remove(); hoverRectRef.current = null; }
  }, []);

  const clearHoverWord = useCallback(() => {
    if (hoverWordRef.current) {
      hoverWordRef.current.classList.remove("md-word-hovered");
      hoverWordRef.current = null;
    }
  }, []);

  // ── Resolve target element → word group ────────────────────────────────
  //
  // Hit rects live in #md-hit-layer (not inside the word group), so the
  // normal DOM-walk would never find data-word-index-in-ayah.  Instead we
  // read data-target-word and look the group up by ID.
  const getWordGroup = useCallback(
    (target: Element, currentTarget: Element): Element | null => {
      // Hit-rect path: resolve via data-target-word attribute
      if (target.classList.contains("md-hit-rect")) {
        const wordId = target.getAttribute("data-target-word");
        return wordId ? currentTarget.querySelector(`#${wordId}`) : null;
      }
      // Normal path: walk up from the event target
      let el: Element | null = target;
      while (el && el !== currentTarget) {
        if (el.hasAttribute("data-word-index-in-ayah")) return el;
        el = el.parentElement;
      }
      return null;
    },
    []
  );

  // ── Mouse handlers ──────────────────────────────────────────────────────
  const handleMouseOver = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const wordEl = getWordGroup(e.target as Element, e.currentTarget);

      if (!wordEl) { clearHoverWord(); removeHoverRect(); return; }

      // Same word still hovered — nothing to recompute (prevents bbox feedback loop)
      if (hoverWordRef.current === wordEl) return;

      clearHoverWord();
      wordEl.classList.add("md-word-hovered");
      hoverWordRef.current = wordEl;

      // Compute bbox once, before inserting the hover rect (rect is a child
      // of the word group and would inflate getBBox on subsequent calls)
      let bbox: SVGRect;
      try { bbox = (wordEl as SVGGElement).getBBox(); } catch { return; }
      if (bbox.width === 0 && bbox.height === 0) return;

      const padX = 3, padY = 2;
      let rect = hoverRectRef.current;
      if (!rect) {
        rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        rect.setAttribute("rx", "6");
        rect.classList.add("md-hover-rect");
        hoverRectRef.current = rect;
      }
      // Insert before first child so rect renders behind the text paths
      wordEl.insertBefore(rect, wordEl.firstChild);
      rect.setAttribute("x",      String(bbox.x - padX));
      rect.setAttribute("y",      String(bbox.y - padY));
      rect.setAttribute("width",  String(bbox.width  + padX * 2));
      rect.setAttribute("height", String(bbox.height + padY * 2));
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

  // ── Render ──────────────────────────────────────────────────────────────
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
              setLoading(true); setError(null);
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
