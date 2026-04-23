import { useEffect, useLayoutEffect, useRef, useState, useCallback, type RefObject } from "react";
import { Loader2, AlertCircle } from "lucide-react";
import { useQuranStore } from "../store/quranStore";
import { useSmartBrush } from "../hooks/useSmartBrush";

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
  const activeWordIdRef   = useRef<string | null>(null);
  const hoverRectRef      = useRef<SVGRectElement | null>(null);
  const hoverWordRef      = useRef<Element | null>(null);
  const croppedViewBoxRef  = useRef<string | null>(null);
  const originalViewBoxRef = useRef<string | null>(null);
  const [availH, setAvailH] = useState(0);

  // ── Smart Brush ─────────────────────────────────────────────────────────
  const selectedWordIds = useQuranStore((s) => s.selectedWordIds);
  const playbackActiveIds = useQuranStore((s) => s.playbackActiveIds);
  const playbackCurrentWordId = useQuranStore((s) => s.playbackCurrentWordId);
  const brush = useSmartBrush("mushaf", containerRef as RefObject<HTMLElement | null>);

  const svgWordQuery = (nid: string, container: Element) => {
    const [s, a, w] = nid.split(":");
    return container.querySelector<Element>(
      `g[data-surah="${s.padStart(3, "0")}"][data-aya="${a.padStart(3, "0")}"][data-word-index-in-ayah="${w}"]`
    );
  };

  // Sync selection visuals whenever the Zustand selection changes.
  // Each selected word gets its own per-word background rect (.md-sel-rect) injected
  // as the first child of the word <g> — the same "held hover" look as md-hover-rect.
  // Diff-based: only processes newly added / newly removed words per update.
  const prevSvgSelectedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const next = new Set(selectedWordIds);
    const prev = prevSvgSelectedRef.current;

    prev.forEach((id) => {
      if (!next.has(id)) {
        const wordEl = svgWordQuery(id, container);
        if (wordEl) {
          wordEl.querySelector(".md-sel-rect")?.remove();
          wordEl.classList.remove("md-word-selected");
        }
      }
    });

    next.forEach((id) => {
      if (!prev.has(id)) {
        const wordEl = svgWordQuery(id, container);
        if (!wordEl) return;
        wordEl.classList.add("md-word-selected");
        if (!wordEl.querySelector(".md-sel-rect")) {
          try {
            const bbox = (wordEl as SVGGElement).getBBox();
            if (bbox.width > 0 || bbox.height > 0) {
              const padX = 3, padY = 2;
              const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
              rect.classList.add("md-sel-rect");
              rect.setAttribute("rx",     "6");
              rect.setAttribute("x",      String(bbox.x - padX));
              rect.setAttribute("y",      String(bbox.y - padY));
              rect.setAttribute("width",  String(bbox.width  + padX * 2));
              rect.setAttribute("height", String(bbox.height + padY * 2));
              wordEl.insertBefore(rect, wordEl.firstChild);
            }
          } catch {
            // getBBox can throw for hidden/detached elements — skip silently
          }
        }
      }
    });

    prevSvgSelectedRef.current = next;
  }, [selectedWordIds]);

  // Keep a live ref to playbackActiveIds so the word-current effect can re-apply
  // the line/ayah gold without needing it as a React dependency.
  const playbackActiveIdsRef = useRef(playbackActiveIds);
  playbackActiveIdsRef.current = playbackActiveIds;

  // Sync .md-word-playing classes whenever playbackActiveIds changes.
  // Query the container directly each time so the update is always idempotent —
  // no ref bookkeeping means no stale-state bugs when modes toggle rapidly.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container
      .querySelectorAll<Element>(".md-word-playing")
      .forEach((el) => el.classList.remove("md-word-playing"));
    playbackActiveIds.forEach((id) => {
      svgWordQuery(id, container)?.classList.add("md-word-playing");
    });

    if (playbackActiveIds.length > 0) {
      const firstEl = svgWordQuery(playbackActiveIds[0], container);
      if (firstEl) {
        firstEl.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
      }
    }
  }, [playbackActiveIds]);

  // Sync .md-word-current class for the single word being spoken right now.
  // Runs independently from the playbackActiveIds effect so both classes coexist.
  // Re-applies the line/ayah (.md-word-playing) gold defensively on every word
  // advance so that the background highlight can never silently drop out.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Step 1 — clear the current-word accent
    container
      .querySelectorAll<Element>(".md-word-current")
      .forEach((el) => el.classList.remove("md-word-current"));

    if (playbackCurrentWordId) {
      // Step 2 — re-assert the line/ayah gold so it can't go missing
      playbackActiveIdsRef.current.forEach((id) => {
        svgWordQuery(id, container)?.classList.add("md-word-playing");
      });

      // Step 3 — apply the deeper word accent on top
      svgWordQuery(playbackCurrentWordId, container)?.classList.add("md-word-current");
    }
  }, [playbackCurrentWordId]);

  // Clear SVG classes and cached viewBox when page changes
  useEffect(() => {
    prevSvgSelectedRef.current = new Set();
    croppedViewBoxRef.current  = null;
    originalViewBoxRef.current = null;
  }, [pageNumber]);

  // Re-apply the cropped viewBox synchronously before paint so that re-renders
  // triggered by Zustand selection state never leave the SVG with the original
  // (uncropped) viewBox that dangerouslySetInnerHTML may have restored.
  // useLayoutEffect (not useEffect) ensures no one-frame flash of the wide SVG.
  useLayoutEffect(() => {
    const cropped = croppedViewBoxRef.current;
    if (!cropped) return;
    const svg = containerRef.current?.querySelector("svg");
    if (svg) svg.setAttribute("viewBox", cropped);
  });

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

  // ── Crop the SVG viewBox to the text column ─────────────────────────────
  //
  // WHY requestAnimationFrame?
  //   - useLayoutEffect fires before the browser has finished computing
  //     SVG layout, so getBBox() returns zeros.
  //     rAF defers to after the first paint when layout is complete.
  //
  // Word selection no longer needs hit-rects — we use document.elementFromPoint
  // with CSS pointer-events: bounding-box on each word group, which is the same
  // approach used by reading mode and is always accurate.
  useEffect(() => {
    if (!svgText) return;
    let rafId: number;

    rafId = requestAnimationFrame(() => {
      const container = containerRef.current;
      if (!container) return;
      const svg = container.querySelector("svg");
      if (!svg) return;

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
          if (bbox.x < minX) minX = bbox.x;
          if (bbox.x + bbox.width > maxX) maxX = bbox.x + bbox.width;
        } catch {
          // getBBox can throw for hidden/detached elements — skip silently
        }
      });

      // Crop the SVG viewBox horizontally to the text column with equal padding
      // on both sides so pages with wide margin annotations stay visually centered.
      // For pages 1 and 2, also crop vertically — trimming equally from the top
      // and bottom of the original viewBox — so those pages have the same
      // width÷height aspect ratio as a standard full-text page (pages 3+).
      //
      // HOW THE VERTICAL CROP WORKS FOR PAGES 1 & 2:
      //   All SVG pages share the same original viewBox (382.68 × 547.09).
      //   After horizontal cropping, pages 3+ end up ~305 SVG units wide.
      //   Pages 1/2 end up ~245 SVG units wide (shorter text lines).
      //   To give them the same display aspect ratio we solve:
      //     croppedW₁₂ / targetH = refCroppedW / origH
      //     → targetH = croppedW₁₂ × origH / refCroppedW
      //   The surplus (origH − targetH) is then split equally between
      //   the top and bottom margins.  origH and origY come from the saved
      //   originalViewBoxRef so this stays stable across re-renders
      //   (useLayoutEffect re-applies the cropped viewBox before each RAF,
      //   so reading svg.viewBox.baseVal would give the already-cropped values).
      if (minX !== Infinity && maxX !== -Infinity) {
        const vb = svg.viewBox.baseVal;
        if (vb && vb.width > 0) {
          const padX = 30;
          if (!originalViewBoxRef.current) {
            originalViewBoxRef.current = svg.getAttribute("viewBox") ??
              `${vb.x} ${vb.y} ${vb.width} ${vb.height}`;
          }
          // Parse the *original* viewBox so origH/origY are stable across re-renders.
          const [, origY,, origH] = originalViewBoxRef.current.split(/\s+/).map(Number);

          const croppedW = maxX - minX + padX * 2;
          let newY       = origY;
          let newHeight  = origH;

          if (pageNumber <= 2) {
            // Reference crop width measured from pages 3–5 data-rect metadata.
            // Changing this constant adjusts how tall pages 1/2 appear.
            const REF_CROPPED_W = 305; // SVG units — pages 3+ standard crop width
            const targetH = croppedW * (origH / REF_CROPPED_W);
            const trim    = (origH - targetH) / 2; // equal from top and bottom
            newY      = origY + trim;
            newHeight = targetH;
          }

          const cropped = `${minX - padX} ${newY} ${croppedW} ${newHeight}`;
          svg.setAttribute("viewBox", cropped);
          croppedViewBoxRef.current = cropped;
        }
      }
    });

    return () => cancelAnimationFrame(rafId);
  }, [svgText, scale, pageNumber]);

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
  // Walk up from the event target until we find an element with
  // data-word-index-in-ayah (the word group), or reach the container.
  const getWordGroup = useCallback(
    (target: Element, currentTarget: Element): Element | null => {
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

  // Active-word toggle using the browser's native hit-tester.
  // Called from handlePointerUp when the pointer didn't move (single tap).
  // We can't use onClick because preventDefault() in onPointerDown suppresses it.
  const handleTap = useCallback(
    (clientX: number, clientY: number) => {
      const el = document.elementFromPoint(clientX, clientY);
      if (!el) return;
      const wordGroup = el.closest("[data-word-index-in-ayah]");
      if (!wordGroup) return;
      const wordId = (wordGroup as HTMLElement).id;
      if (activeWordIdRef.current === wordId) {
        wordGroup.classList.remove("md-word-active");
        activeWordIdRef.current = null;
        return;
      }
      clearActiveWord();
      wordGroup.classList.add("md-word-active");
      activeWordIdRef.current = wordId;
    },
    [clearActiveWord]
  );

  // Track pointer-down position so onPointerUp can detect a single tap.
  const tapStartRef = useRef<{ x: number; y: number } | null>(null);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      tapStartRef.current = { x: e.clientX, y: e.clientY };
      brush.onPointerDown(e);
    },
    [brush]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      brush.onPointerUp();
      const start = tapStartRef.current;
      tapStartRef.current = null;
      if (start) {
        const dx = e.clientX - start.x;
        const dy = e.clientY - start.y;
        if (dx * dx + dy * dy < 64) handleTap(e.clientX, e.clientY);
      }
    },
    [brush, handleTap]
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
            onMouseOver={handleMouseOver}
            onMouseLeave={handleMouseLeave}
            onPointerDown={handlePointerDown}
            onPointerMove={brush.onPointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            dangerouslySetInnerHTML={{ __html: svgText }}
          />
        </div>
      )}
    </div>
  );
}
