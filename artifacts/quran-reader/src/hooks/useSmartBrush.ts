import { useCallback, useRef, type RefObject } from "react";
import { useQuranStore } from "../store/quranStore";
import type { BrushFineness } from "../types/quran";

// ── Reading-mode helpers ──────────────────────────────────────────────────────

function getReadingWordEl(el: Element): HTMLElement | null {
  return (el as HTMLElement).closest?.(".quran-word") as HTMLElement | null;
}

function readingExpand(wordEl: HTMLElement, fineness: BrushFineness): string[] {
  const id = wordEl.id;
  if (!id) return [];

  if (fineness === "word") return [id];

  if (fineness === "line") {
    const container = wordEl.closest(".quran-text");
    if (!container) return [id];
    const r = wordEl.getBoundingClientRect();
    const midY = r.top + r.height / 2;
    const tol = Math.max(r.height * 0.55, 6);
    const ids: string[] = [];
    container.querySelectorAll<HTMLElement>(".quran-word[id]").forEach((w) => {
      const wr = w.getBoundingClientRect();
      if (Math.abs(wr.top + wr.height / 2 - midY) <= tol && w.id) {
        ids.push(w.id);
      }
    });
    return ids.length > 0 ? ids : [id];
  }

  // ayah
  const s = wordEl.dataset.surah;
  const a = wordEl.dataset.ayah;
  if (!s || !a) return [id];
  const ids: string[] = [];
  document
    .querySelectorAll<HTMLElement>(
      `.quran-word[data-surah="${s}"][data-ayah="${a}"][id]`
    )
    .forEach((w) => {
      if (w.id) ids.push(w.id);
    });
  return ids.length > 0 ? ids : [id];
}

// ── SVG-mode helpers ──────────────────────────────────────────────────────────

interface SvgInfo {
  normalizedId: string;
  rawSurah: string;
  rawAya: string;
  lineNumber: string;
}

function extractSvgInfo(el: Element): SvgInfo | null {
  const surah = el.getAttribute("data-surah");
  const aya = el.getAttribute("data-aya");
  const wi = el.getAttribute("data-word-index-in-ayah");
  const line = el.getAttribute("data-line-number") ?? "";
  if (!surah || !aya || !wi) return null;
  const s = parseInt(surah, 10);
  const a = parseInt(aya, 10);
  const w = parseInt(wi, 10);
  if (isNaN(s) || isNaN(a) || isNaN(w)) return null;
  return { normalizedId: `${s}:${a}:${w}`, rawSurah: surah, rawAya: aya, lineNumber: line };
}

// Bounding-box scan over hit-rects — more reliable than elementFromPoint
// during pointer capture because SVG hit-testing rules differ from DOM
// hit-testing and browsers may behave inconsistently mid-drag.
function findSvgInfoAtPoint(clientX: number, clientY: number, container: Element): SvgInfo | null {
  const hitRects = container.querySelectorAll<Element>(".md-hit-rect");
  for (const rect of hitRects) {
    const bbox = rect.getBoundingClientRect();
    if (
      clientX >= bbox.left && clientX <= bbox.right &&
      clientY >= bbox.top  && clientY <= bbox.bottom
    ) {
      const wid = rect.getAttribute("data-target-word");
      if (!wid) continue;
      const wordGroup = container.querySelector(`#${wid}`);
      if (wordGroup) return extractSvgInfo(wordGroup);
    }
  }
  return null;
}

function svgExpand(info: SvgInfo, fineness: BrushFineness, container: Element): string[] {
  if (fineness === "word") return [info.normalizedId];

  if (fineness === "line") {
    const ids: string[] = [];
    container
      .querySelectorAll<Element>(
        `g[data-line-number="${info.lineNumber}"][data-word-index-in-ayah]`
      )
      .forEach((g) => {
        const i = extractSvgInfo(g);
        if (i) ids.push(i.normalizedId);
      });
    return ids.length > 0 ? ids : [info.normalizedId];
  }

  // ayah
  const ids: string[] = [];
  container
    .querySelectorAll<Element>(
      `g[data-surah="${info.rawSurah}"][data-aya="${info.rawAya}"][data-word-index-in-ayah]`
    )
    .forEach((g) => {
      const i = extractSvgInfo(g);
      if (i) ids.push(i.normalizedId);
    });
  return ids.length > 0 ? ids : [info.normalizedId];
}

// ── Imperative DOM class helpers (used inside the hook for zero-latency feel) ─

function applyReadingClass(id: string, add: boolean) {
  document.getElementById(id)?.classList.toggle("word-selected", add);
}

function applySvgClass(nid: string, add: boolean, container: Element) {
  const [s, a, w] = nid.split(":");
  const surahPad = s.padStart(3, "0");
  const ayaPad = a.padStart(3, "0");
  container
    .querySelector<Element>(
      `g[data-surah="${surahPad}"][data-aya="${ayaPad}"][data-word-index-in-ayah="${w}"]`
    )
    ?.classList.toggle("md-word-selected", add);
}

// ── Main hook ─────────────────────────────────────────────────────────────────

export function useSmartBrush(
  mode: "reading" | "mushaf",
  containerRef: RefObject<HTMLElement | null>
) {
  const brushFineness = useQuranStore((s) => s.brushFineness);
  const setSelectedWordIds = useQuranStore((s) => s.setSelectedWordIds);

  const isDragging = useRef(false);
  // Accumulated IDs for the current drag gesture
  const dragSet = useRef<Set<string>>(new Set());
  // Keep fineness in a ref so pointermove callbacks see the latest value without re-creating
  const finenessRef = useRef<BrushFineness>(brushFineness);
  finenessRef.current = brushFineness;

  const resolveIds = useCallback(
    (clientX: number, clientY: number): string[] => {
      const fineness = finenessRef.current;

      if (mode === "reading") {
        const el = document.elementFromPoint(clientX, clientY);
        if (!el) return [];
        const wordEl = getReadingWordEl(el);
        if (!wordEl) return [];
        return readingExpand(wordEl, fineness);
      } else {
        // SVG mode: bounding-box scan is reliable across all browsers during
        // pointer capture — elementFromPoint is not used here at all.
        const container = containerRef.current;
        if (!container) return [];
        const info = findSvgInfoAtPoint(clientX, clientY, container);
        if (!info) return [];
        return svgExpand(info, fineness, container);
      }
    },
    [mode, containerRef]
  );

  const commitIds = useCallback(
    (ids: string[]) => {
      const container = containerRef.current;
      let changed = false;
      ids.forEach((id) => {
        if (!dragSet.current.has(id)) {
          dragSet.current.add(id);
          changed = true;
          // Immediate DOM feedback — no waiting for React cycle
          if (mode === "reading") applyReadingClass(id, true);
          else if (container) applySvgClass(id, true, container);
        }
      });
      if (changed) setSelectedWordIds([...dragSet.current]);
    },
    [mode, containerRef, setSelectedWordIds]
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      const ids = resolveIds(e.clientX, e.clientY);
      if (ids.length === 0) return; // Not on a word — let native scroll continue

      // Prevent text-selection (reading) and touch-scroll (SVG) for both modes.
      // In SVG mode, click events won't fire after this — the MushafSvgPage
      // wrapper handles single-tap (active-word toggle) via onPointerUp detection.
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      isDragging.current = true;
      dragSet.current = new Set();
      commitIds(ids);
    },
    [resolveIds, commitIds]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (!isDragging.current) return;
      e.preventDefault();
      const ids = resolveIds(e.clientX, e.clientY);
      if (ids.length > 0) commitIds(ids);
    },
    [resolveIds, commitIds]
  );

  const onPointerUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel: onPointerUp,
  };
}
