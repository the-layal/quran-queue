import { useEffect, useLayoutEffect, useRef, useState, useCallback, type RefObject } from "react";
import { Loader2, AlertCircle } from "lucide-react";
import { useQuranStore } from "../store/quranStore";
import { useSmartBrush } from "../hooks/useSmartBrush";

interface MushafSvgPageProps {
  pageNumber: number;
  scale?: number;
}

const SVG_CACHE = new Map<number, string>();

// Inline fill applied to SVG path elements for selected words.
// Mirrors the .md-word-hovered path CSS rule; inline style ensures visibility
// regardless of CSS cascade on dynamically-injected SVG content.
// Colour is theme-aware so contrast is correct in both light and dark mode.
const SVG_SEL_FILL_LIGHT = "hsl(153 35% 30%)";
const SVG_SEL_FILL_DARK  = "hsl(153 50% 68%)";
function getSvgSelFill(): string {
  return document.documentElement.classList.contains("dark")
    ? SVG_SEL_FILL_DARK
    : SVG_SEL_FILL_LIGHT;
}

// ── Line-height normalisation helpers ───────────────────────────────────────
// After the SVG is laid out we bucket every word group by the Y midpoint of
// its bounding box (rounded to the nearest BUCKET SVG units).  Within each
// bucket we record the topmost Y and the bottommost edge so every word on the
// same visual line can share one uniform highlight rectangle height.

const LINE_BUCKET = 10; // SVG units — tolerance for baseline variation

interface LineHeightInfo { normY: number; normHeight: number; }

function buildLineHeightMap(container: Element): Map<number, LineHeightInfo> {
  const buckets = new Map<number, { minY: number; maxBottom: number }>();

  container.querySelectorAll<SVGGElement>("g[data-word-index-in-ayah]").forEach((wordEl) => {
    try {
      const bbox = wordEl.getBBox();
      if (bbox.width === 0 && bbox.height === 0) return;
      const key = Math.round((bbox.y + bbox.height / 2) / LINE_BUCKET);
      const cur = buckets.get(key);
      if (!cur) {
        buckets.set(key, { minY: bbox.y, maxBottom: bbox.y + bbox.height });
      } else {
        if (bbox.y < cur.minY) cur.minY = bbox.y;
        const bottom = bbox.y + bbox.height;
        if (bottom > cur.maxBottom) cur.maxBottom = bottom;
      }
    } catch { /* getBBox can throw for hidden/detached elements */ }
  });

  const result = new Map<number, LineHeightInfo>();
  buckets.forEach(({ minY, maxBottom }, key) => {
    result.set(key, { normY: minY, normHeight: maxBottom - minY });
  });
  return result;
}

function getLineNorm(bbox: SVGRect, map: Map<number, LineHeightInfo>): { y: number; height: number } {
  const key = Math.round((bbox.y + bbox.height / 2) / LINE_BUCKET);
  const info = map.get(key);
  return info ? { y: info.normY, height: info.normHeight } : { y: bbox.y, height: bbox.height };
}

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
  const isBrushingRef     = useRef(false);
  const croppedViewBoxRef  = useRef<string | null>(null);
  const originalViewBoxRef = useRef<string | null>(null);
  const lineHeightMapRef   = useRef<Map<number, LineHeightInfo>>(new Map());
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
  // Selection reuses the hover look — we inject a permanent md-hover-rect (marked
  // data-sel="true") and add md-word-hovered to each selected word group.
  // This guarantees the visual is identical to hover (which is known-working).
  // Diff-based: only processes newly added / newly removed words per update.
  const prevSvgSelectedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const next = new Set(selectedWordIds);
    const prev = prevSvgSelectedRef.current;

    // Remove visuals for words that are no longer selected.
    prev.forEach((id) => {
      if (!next.has(id)) {
        const wordEl = svgWordQuery(id, container);
        if (wordEl) {
          wordEl.querySelector<SVGRectElement>(".md-hover-rect[data-sel]")?.remove();
          // Keep class and inline fill if the mouse is still hovering — clearHoverWord
          // will handle clean-up on mouse-leave.
          if (wordEl !== hoverWordRef.current) {
            wordEl.classList.remove("md-word-hovered");
            wordEl.querySelectorAll<SVGPathElement>("path").forEach((p) => { p.style.fill = ""; });
          }
        }
      }
    });

    // Add visuals for newly selected words.
    next.forEach((id) => {
      if (!prev.has(id)) {
        const wordEl = svgWordQuery(id, container);
        if (!wordEl) return;
        wordEl.classList.add("md-word-hovered");
        // Set inline fill on every path so the colour is guaranteed to appear
        // regardless of CSS cascade on dynamically-injected SVG content.
        wordEl.querySelectorAll<SVGPathElement>("path").forEach((p) => { p.style.fill = getSvgSelFill(); });
        // Only inject a selection rect if one isn't already there.
        if (!wordEl.querySelector(".md-hover-rect[data-sel]")) {
          try {
            // Compute bbox BEFORE inserting the rect (child rect inflates getBBox).
            const bbox = (wordEl as SVGGElement).getBBox();
            if (bbox.width > 0 || bbox.height > 0) {
              const padX = 3, padY = 2;
              // Use the line-normalised height so all words on the same line
              // share the same highlight rectangle height.
              const { y: normY, height: normH } = getLineNorm(bbox, lineHeightMapRef.current);
              const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
              rect.classList.add("md-hover-rect");
              rect.setAttribute("data-sel", "true");
              rect.setAttribute("rx",    "6");
              rect.setAttribute("x",     String(bbox.x - padX));
              rect.setAttribute("y",     String(normY - padY));
              rect.setAttribute("width", String(bbox.width  + padX * 2));
              rect.setAttribute("height",String(normH + padY * 2));
              wordEl.insertBefore(rect, wordEl.firstChild);
            }
          } catch {
            // getBBox can throw for hidden/detached elements — skip silently.
          }
        }
      }
    });

    prevSvgSelectedRef.current = next;
  // svgText is included so the effect re-runs after the useLayoutEffect injects
  // fresh SVG content — ensuring selection visuals are applied to the new DOM.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWordIds, svgText]);

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
    lineHeightMapRef.current   = new Map();
  }, [pageNumber]);

  // Inject SVG text into the container manually so that React never resets it
  // during re-renders (selectedWordIds, availH, etc.), which would wipe injected
  // selection / hover / playback rects.  By setting innerHTML here — inside a
  // useLayoutEffect — we own the mutation and React leaves the div's children
  // completely untouched on every subsequent render.
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.innerHTML = svgText ?? "";
    // A fresh innerHTML means all previous rect injections are gone.
    // Reset the diff tracker so the selectedWordIds effect re-injects every
    // currently-selected word into the brand-new DOM on its next run.
    prevSvgSelectedRef.current = new Set();
  }, [svgText]);

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

      // Build the per-line height map now that layout is complete.
      // This must run after the viewBox update so getBBox() returns final values.
      lineHeightMapRef.current = buildLineHeightMap(container);
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
      // Don't strip md-word-hovered from a word that has a pinned selection rect —
      // that class and the inline fill are what keep the selection highlight visible.
      if (!hoverWordRef.current.querySelector(".md-hover-rect[data-sel]")) {
        hoverWordRef.current.classList.remove("md-word-hovered");
        hoverWordRef.current.querySelectorAll<SVGPathElement>("path").forEach((p) => { p.style.fill = ""; });
      }
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
      // Suppress hover entirely while a brush drag is active — selected words
      // are already highlighted and the hover rect would be distracting/confusing.
      if (isBrushingRef.current) return;

      const wordEl = getWordGroup(e.target as Element, e.currentTarget);

      if (!wordEl) { clearHoverWord(); removeHoverRect(); return; }

      // Same word still hovered — nothing to recompute (prevents bbox feedback loop)
      if (hoverWordRef.current === wordEl) return;

      clearHoverWord();
      wordEl.classList.add("md-word-hovered");
      hoverWordRef.current = wordEl;

      // If this word already has a pinned selection rect, don't inject the
      // transient hover rect on top — the selection rect provides the same look.
      if (wordEl.querySelector(".md-hover-rect[data-sel]")) return;

      // Compute bbox once, before inserting the hover rect (rect is a child
      // of the word group and would inflate getBBox on subsequent calls)
      let bbox: SVGRect;
      try { bbox = (wordEl as SVGGElement).getBBox(); } catch { return; }
      if (bbox.width === 0 && bbox.height === 0) return;

      const padX = 3, padY = 2;
      // Use the line-normalised height so all words on the same line share
      // the same highlight rectangle height for hover, just as for selection.
      const { y: normY, height: normH } = getLineNorm(bbox, lineHeightMapRef.current);
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
      rect.setAttribute("y",      String(normY - padY));
      rect.setAttribute("width",  String(bbox.width  + padX * 2));
      rect.setAttribute("height", String(normH + padY * 2));
    },
    [getWordGroup, clearHoverWord, removeHoverRect]
  );

  const handleMouseLeave = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      // During a brush drag hover was already cleared and is suppressed — skip.
      if (isBrushingRef.current) return;

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
      // Set brushing flag before clearing hover so mouse handlers can't race.
      isBrushingRef.current = true;
      clearHoverWord();
      removeHoverRect();
      brush.onPointerDown(e);
    },
    [brush, clearHoverWord, removeHoverRect]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      isBrushingRef.current = false;
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
          />
        </div>
      )}
    </div>
  );
}
