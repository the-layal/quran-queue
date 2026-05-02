import { useCallback, useRef, type RefObject } from "react";
import { useQuranStore } from "../store/quranStore";
import type { BrushFineness } from "../types/quran";
import { hasArabicLetter } from "../utils/arabicUtils";
import { preloadWordCounts, getAyahWordCount } from "../utils/quranWordCounts";

// Canonical verse counts per surah (1-indexed), used for cross-surah boundary detection.
// These are fixed constants of the Quran and will never change.
const SURAH_AYAH_COUNTS: readonly number[] = [
  7, 286, 200, 176, 120, 165, 206, 75, 129, 109, 123, 111, 43, 52, 99, 128,
  111, 110, 98, 135, 112, 78, 118, 64, 77, 227, 93, 88, 69, 60, 34, 30, 73,
  54, 45, 83, 182, 88, 75, 85, 54, 53, 89, 59, 37, 35, 38, 29, 18, 45, 60, 49,
  62, 55, 78, 96, 29, 22, 24, 13, 14, 11, 11, 18, 12, 12, 30, 52, 52, 44, 28,
  28, 20, 56, 40, 31, 50, 40, 46, 42, 29, 19, 36, 25, 22, 17, 19, 26, 30, 20,
  15, 21, 11, 8, 8, 19, 5, 8, 8, 11, 11, 8, 3, 9, 5, 4, 7, 3, 6, 3, 5, 4, 5, 6,
];

// Start fetching word-count data immediately so it is ready before any gesture.
preloadWordCounts();

// ── SVG helper types & utilities ─────────────────────────────────────────────

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

// Use the browser's native hit-tester to find the SVG word group at a point.
// document.elementFromPoint returns the topmost element at the given screen
// coordinate; .closest() then walks up to the nearest word group ancestor.
// This is the same approach used by reading mode and is always accurate —
// it works whether the click lands on a letter stroke, in the gap between
// strokes, or during a pointer-captured drag.
// The optional `container` guard ensures we only match word groups that belong
// to the current page surface, not a stacked layer or a different Mushaf page.
function findSvgWordAtPoint(
  clientX: number,
  clientY: number,
  container?: Element | null
): SvgInfo | null {
  const el = document.elementFromPoint(clientX, clientY);
  if (!el) return null;
  const wordGroup = el.closest('[data-word-index-in-ayah][data-type="text"]');
  if (!wordGroup) return null;
  if (container && !container.contains(wordGroup)) return null;
  return extractSvgInfo(wordGroup);
}

// ── Imperative DOM class helpers ──────────────────────────────────────────────

function applyReadingClass(id: string, add: boolean) {
  document.getElementById(id)?.classList.toggle("word-selected", add);
}

// Fill applied directly to SVG path elements during brush selection.
// Matches the CSS rule for .md-word-hovered path so inline style and class
// always agree; using inline style guarantees visibility regardless of CSS
// cascade issues on dynamically-injected SVG content.
// Theme-aware so contrast is correct in both light and dark mode.
const SVG_SEL_FILL_LIGHT = "hsl(153 35% 30%)";
const SVG_SEL_FILL_DARK  = "hsl(153 50% 68%)";
function getSvgSelFill(): string {
  return document.documentElement.classList.contains("dark")
    ? SVG_SEL_FILL_DARK
    : SVG_SEL_FILL_LIGHT;
}

function applySvgClass(nid: string, add: boolean, container: Element) {
  const [s, a, w] = nid.split(":");
  const surahPad = s.padStart(3, "0");
  const ayaPad = a.padStart(3, "0");
  const sel = `g[data-surah="${surahPad}"][data-aya="${ayaPad}"][data-word-index-in-ayah="${w}"][data-type="text"]`;
  const el = container.querySelector<Element>(sel);
  if (!el) return;
  if (add) {
    el.classList.add("md-word-hovered");
    el.querySelectorAll<SVGPathElement>("path").forEach((p) => { p.style.fill = getSvgSelFill(); });
  } else {
    // Only remove if there is no pinned selection rect — the word may still be
    // in the committed Zustand selection even as the brush moves away.
    if (!el.querySelector(".md-hover-rect[data-sel]")) {
      el.classList.remove("md-word-hovered");
      el.querySelectorAll<SVGPathElement>("path").forEach((p) => { p.style.fill = ""; });
    }
  }
}

// ── Cross-page adjacency helpers ─────────────────────────────────────────────
// When the user starts a new selection gesture on a page that has no currently
// selected words, we need to decide whether to treat the gesture as a
// continuation of the existing (cross-page) selection or as a fresh selection
// that should first clear the old one.

/** Parse either "S:A:W" (mushaf) or "word-S-A-W" (reading) into numbers. */
function parseWordId(id: string): { s: number; a: number; w: number } | null {
  if (id.includes(":")) {
    const parts = id.split(":").map(Number);
    if (parts.length === 3 && parts.every((n) => !isNaN(n) && n > 0)) {
      return { s: parts[0], a: parts[1], w: parts[2] };
    }
    return null;
  }
  const m = id.match(/^word-(\d+)-(\d+)-(\d+)$/);
  if (m) return { s: +m[1], a: +m[2], w: +m[3] };
  return null;
}

/** Stable numeric key for sorting word IDs in Quran order. */
function wordOrderKey(id: string): number {
  const p = parseWordId(id);
  if (!p) return -1;
  // Max surah=114, max ayah~286, max word/ayah~50 — large multipliers avoid collision
  return p.s * 1_000_000 + p.a * 1_000 + p.w;
}

/** Return the word ID with the highest Quran-order position from a collection. */
function getLastWordId(ids: Iterable<string>): string | null {
  let bestId: string | null = null;
  let bestKey = -1;
  for (const id of ids) {
    const k = wordOrderKey(id);
    if (k > bestKey) { bestKey = k; bestId = id; }
  }
  return bestId;
}

/** Return the word ID with the lowest Quran-order position from a unit. */
function getFirstWordId(unit: Unit): string | null {
  if (unit.length === 0) return null;
  return unit.reduce((best, cur) => wordOrderKey(cur) < wordOrderKey(best) ? cur : best);
}

/**
 * Returns true iff `candidateId` is the direct next word after `lastId` in
 * the Quran word sequence.  Three cases are handled:
 *
 *  1. Same ayah, consecutive word (w2 === w1 + 1) — exact, no extra data.
 *
 *  2. First word of the next ayah in the same surah (a2 === a1+1, w2 === 1):
 *     exact — confirmed only when w1 === getAyahWordCount(s1, a1), proving
 *     lastId is the final word of its ayah.  Returns false if word-count data
 *     has not loaded yet (safe conservative fallback).
 *
 *  3. First word of ayah 1 of the next surah (s2 === s1+1, a2 === 1, w2 === 1):
 *     exact — confirmed when a1 is the last ayah of surah s1 (via the canonical
 *     SURAH_AYAH_COUNTS table) AND w1 is the last word of that ayah (via
 *     getAyahWordCount).  Returns false if word-count data not loaded.
 */
function isDirectlyAdjacentInQuran(lastId: string, candidateId: string): boolean {
  const p1 = parseWordId(lastId);
  const p2 = parseWordId(candidateId);
  if (!p1 || !p2) return false;

  // Case 1: same ayah, next word — exact
  if (p1.s === p2.s && p1.a === p2.a && p2.w === p1.w + 1) return true;

  // Case 2: first word of the next ayah in the same surah
  if (p1.s === p2.s && p2.a === p1.a + 1 && p2.w === 1) {
    const wordCount = getAyahWordCount(p1.s, p1.a);
    return wordCount !== null && p1.w === wordCount;
  }

  // Case 3: first word of the first ayah of the next surah
  if (p2.s === p1.s + 1 && p2.a === 1 && p2.w === 1) {
    const lastAyahOfSurah = SURAH_AYAH_COUNTS[p1.s - 1]; // 1-indexed
    if (p1.a !== lastAyahOfSurah) return false;           // not the final ayah
    const wordCount = getAyahWordCount(p1.s, p1.a);
    return wordCount !== null && p1.w === wordCount;
  }

  return false;
}

// ── Ordered unit index builders ───────────────────────────────────────────────
// A "unit" is the group of word IDs selected atomically together.
// For word fineness: one unit = one word.
// For line fineness: one unit = all words on that visual line.
// For ayah fineness: one unit = all words in that ayah.

type Unit = string[];

function buildReadingUnits(container: Element, fineness: BrushFineness): Unit[] {
  const allWords = Array.from(
    container.querySelectorAll<HTMLElement>(".quran-word[id]")
  ).filter((w) => !!w.id);

  if (fineness === "word") {
    return allWords.map((w) => [w.id]);
  }

  if (fineness === "line") {
    // Group by visual line using y-midpoint proximity
    const lineKeys: number[] = [];
    const lineMap = new Map<number, string[]>();

    allWords.forEach((w) => {
      const r = w.getBoundingClientRect();
      const midY = r.top + r.height / 2;
      const tol = Math.max(r.height * 0.55, 6);

      let found = -1;
      for (const key of lineKeys) {
        if (Math.abs(key - midY) <= tol) {
          found = key;
          break;
        }
      }
      if (found === -1) {
        lineKeys.push(midY);
        lineMap.set(midY, [w.id]);
      } else {
        lineMap.get(found)!.push(w.id);
      }
    });

    return lineKeys.map((k) => lineMap.get(k)!);
  }

  // ayah fineness — group by surah:ayah (DOM order is already ayah-ordered)
  const ayahKeys: string[] = [];
  const ayahMap = new Map<string, string[]>();

  allWords.forEach((w) => {
    const s = w.dataset.surah;
    const a = w.dataset.ayah;
    if (!s || !a) return;
    const key = `${s}:${a}`;
    if (!ayahMap.has(key)) {
      ayahMap.set(key, []);
      ayahKeys.push(key);
    }
    ayahMap.get(key)!.push(w.id);
  });

  return ayahKeys.map((k) => ayahMap.get(k)!);
}

function buildSvgUnits(container: Element, fineness: BrushFineness): Unit[] {
  const allGroups = Array.from(
    container.querySelectorAll<Element>(
      'g[data-surah][data-aya][data-word-index-in-ayah][data-type="text"]'
    )
  ).filter((g) => {
    // Exclude waqf/pause marks (ۚ ۖ ۗ ۘ ۛ) — they have data-type="text" but
    // contain no Arabic letter codepoints and have no audio segments.
    const hafs = g.getAttribute("data-hafs");
    return hafs === null || hafs === "" || hasArabicLetter(hafs);
  });

  const parsed = allGroups
    .map((g) => {
      const info = extractSvgInfo(g);
      return info ? { info } : null;
    })
    .filter(Boolean) as { info: SvgInfo }[];

  // Stable numeric sort: surah → aya → wordIndex
  parsed.sort((a, b) => {
    const [as_, aa, aw] = a.info.normalizedId.split(":").map(Number);
    const [bs, ba, bw] = b.info.normalizedId.split(":").map(Number);
    if (as_ !== bs) return as_ - bs;
    if (aa !== ba) return aa - ba;
    return aw - bw;
  });

  if (fineness === "word") {
    return parsed.map((p) => [p.info.normalizedId]);
  }

  if (fineness === "line") {
    const lineKeys: string[] = [];
    const lineMap = new Map<string, string[]>();
    parsed.forEach(({ info }) => {
      const key = info.lineNumber;
      if (!lineMap.has(key)) {
        lineMap.set(key, []);
        lineKeys.push(key);
      }
      lineMap.get(key)!.push(info.normalizedId);
    });
    return lineKeys.map((k) => lineMap.get(k)!);
  }

  // ayah fineness
  const ayahKeys: string[] = [];
  const ayahMap = new Map<string, string[]>();
  parsed.forEach(({ info }) => {
    const [s, a] = info.normalizedId.split(":");
    const key = `${s}:${a}`;
    if (!ayahMap.has(key)) {
      ayahMap.set(key, []);
      ayahKeys.push(key);
    }
    ayahMap.get(key)!.push(info.normalizedId);
  });
  return ayahKeys.map((k) => ayahMap.get(k)!);
}

// Find which unit index contains a given word ID
function findUnitIndex(units: Unit[], wordId: string): number {
  for (let i = 0; i < units.length; i++) {
    if (units[i].includes(wordId)) return i;
  }
  return -1;
}

// ── Main hook ─────────────────────────────────────────────────────────────────

export function useSmartBrush(
  mode: "reading" | "mushaf",
  containerRef: RefObject<HTMLElement | null>
) {
  const brushFineness = useQuranStore((s) => s.brushFineness);
  const selectedWordIds = useQuranStore((s) => s.selectedWordIds);
  const setSelectedWordIds = useQuranStore((s) => s.setSelectedWordIds);

  const isDragging = useRef(false);
  // True when the drag gesture should remove words (pointer started on a selected word)
  const isDeselecting = useRef(false);
  // Keep fineness in a ref so pointermove callbacks see the latest value without re-creating
  const finenessRef = useRef<BrushFineness>(brushFineness);
  finenessRef.current = brushFineness;
  // Mirror of selectedWordIds in a ref for synchronous access inside pointer handlers
  const selectedSetRef = useRef<Set<string>>(new Set());
  selectedSetRef.current = new Set(selectedWordIds);

  // ── Contiguous-selection state (add mode) ──────────────────────────────────
  // Ordered units built once per gesture
  const orderedUnitsRef = useRef<Unit[]>([]);
  // Index of the anchor unit (where the gesture started)
  const anchorIndexRef = useRef<number>(-1);
  // Words contributed by the CURRENT gesture's range (excludes base)
  const activeRangeIdsRef = useRef<Set<string>>(new Set());
  // Pre-existing selection at gesture start — preserved across the gesture
  const baseIdsRef = useRef<Set<string>>(new Set());

  // ── Deselect-mode state ────────────────────────────────────────────────────
  // Snapshot of selection at gesture start (for deselect mode)
  const initialSelectedRef = useRef<Set<string>>(new Set());
  // Words removed so far in this deselect gesture
  const deselectedSetRef = useRef<Set<string>>(new Set());

  // Resolve the single word ID directly under the pointer (no fineness expansion).
  // Used to decide add-vs-deselect mode.
  const resolveAnchorWordId = useCallback(
    (clientX: number, clientY: number): string | null => {
      if (mode === "reading") {
        const el = document.elementFromPoint(clientX, clientY);
        if (!el) return null;
        const wordEl = (el as HTMLElement).closest?.(".quran-word") as HTMLElement | null;
        return wordEl?.id ?? null;
      } else {
        const info = findSvgWordAtPoint(clientX, clientY, containerRef.current);
        return info ? info.normalizedId : null;
      }
    },
    [mode, containerRef]
  );

  // Resolve the unit index under the pointer using the already-built ordered list.
  const resolveCurrentUnitIndex = useCallback(
    (clientX: number, clientY: number): number => {
      const units = orderedUnitsRef.current;
      if (units.length === 0) return -1;

      if (mode === "reading") {
        const el = document.elementFromPoint(clientX, clientY);
        if (!el) return -1;
        const wordEl = (el as HTMLElement).closest?.(".quran-word") as HTMLElement | null;
        if (!wordEl?.id) return -1;
        return findUnitIndex(units, wordEl.id);
      } else {
        const info = findSvgWordAtPoint(clientX, clientY, containerRef.current);
        if (!info) return -1;
        return findUnitIndex(units, info.normalizedId);
      }
    },
    [mode, containerRef]
  );

  // Apply a contiguous range of units as the current gesture's contribution,
  // preserving the base (pre-gesture) selection. Diffs only the gesture portion
  // to toggle DOM classes for changed elements only.
  const applyRange = useCallback(
    (fromIdx: number, toIdx: number) => {
      const units = orderedUnitsRef.current;
      const container = containerRef.current;
      const base = baseIdsRef.current;
      const lo = Math.min(fromIdx, toIdx);
      const hi = Math.max(fromIdx, toIdx);

      // Build the new range for this gesture
      const newRangeIds = new Set<string>();
      for (let i = lo; i <= hi; i++) {
        for (const id of units[i]) newRangeIds.add(id);
      }

      const prevRangeIds = activeRangeIdsRef.current;

      // Remove IDs that left the gesture range and are not in the base selection
      for (const id of prevRangeIds) {
        if (!newRangeIds.has(id) && !base.has(id)) {
          if (mode === "reading") applyReadingClass(id, false);
          else if (container) applySvgClass(id, false, container);
        }
      }

      // Add IDs that entered the gesture range and are not already shown via base
      for (const id of newRangeIds) {
        if (!prevRangeIds.has(id) && !base.has(id)) {
          if (mode === "reading") applyReadingClass(id, true);
          else if (container) applySvgClass(id, true, container);
        }
      }

      activeRangeIdsRef.current = newRangeIds;
      // Publish the union of base + current gesture range
      setSelectedWordIds([...new Set([...base, ...newRangeIds])]);
    },
    [mode, containerRef, setSelectedWordIds]
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      const anchorWordId = resolveAnchorWordId(e.clientX, e.clientY);
      if (!anchorWordId) return; // Not on a word — preserve existing selection

      const snap = selectedSetRef.current;
      initialSelectedRef.current = new Set(snap);
      isDeselecting.current = snap.has(anchorWordId);

      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      isDragging.current = true;

      if (isDeselecting.current) {
        // Deselect mode: brush removes words from the existing selection.
        deselectedSetRef.current = new Set();
        activeRangeIdsRef.current = new Set();
        baseIdsRef.current = new Set();

        // Build and cache units once so pointermove doesn't need to rebuild
        const container = containerRef.current;
        const fineness = finenessRef.current;
        const units =
          mode === "reading"
            ? container ? buildReadingUnits(container, fineness) : []
            : container ? buildSvgUnits(container, fineness) : [];
        orderedUnitsRef.current = units;
        anchorIndexRef.current = -1;

        const aidx = findUnitIndex(units, anchorWordId);
        const peers = aidx >= 0 ? units[aidx] : [anchorWordId];

        peers.forEach((id) => {
          if (snap.has(id)) {
            deselectedSetRef.current.add(id);
            if (mode === "reading") applyReadingClass(id, false);
            else if (container) applySvgClass(id, false, container);
          }
        });

        setSelectedWordIds([...snap].filter((id) => !deselectedSetRef.current.has(id)));
        return;
      }

      // Add mode: build ordered units and record anchor.
      const fineness = finenessRef.current;
      const container = containerRef.current;

      const units =
        mode === "reading"
          ? container ? buildReadingUnits(container, fineness) : []
          : container ? buildSvgUnits(container, fineness) : [];

      orderedUnitsRef.current = units;

      // ── Cross-page auto-clear ───────────────────────────────────────────────
      // If there is an existing selection and none of its words appear in the
      // current page's unit list, the selection was made on a different page.
      // In that case check whether the new anchor is a direct Quran-sequence
      // continuation of the old selection.  If it is not, clear the old
      // selection first so the user starts fresh rather than accumulating
      // unrelated words from different pages.
      let effectiveBase = new Set(snap);
      if (snap.size > 0) {
        const currentPageIds = new Set(units.flatMap((u) => u));
        const existingOnCurrentPage = [...snap].some((id) => currentPageIds.has(id));

        if (!existingOnCurrentPage) {
          // Find the anchor unit (need aidx a step early to get firstAnchorId)
          const tentativeAidx = findUnitIndex(units, anchorWordId);
          const firstAnchorId =
            tentativeAidx >= 0 ? getFirstWordId(units[tentativeAidx]) : null;
          const lastExistingId = getLastWordId(snap);

          const isContinuation =
            firstAnchorId !== null &&
            lastExistingId !== null &&
            isDirectlyAdjacentInQuran(lastExistingId, firstAnchorId);

          if (!isContinuation) {
            // Non-contiguous cross-page selection — wipe the old base.
            // The previous page's DOM will re-sync from the store on next render.
            effectiveBase = new Set();
            setSelectedWordIds([]);
          }
          // If it IS a continuation, effectiveBase stays as snap — the new
          // gesture will extend the existing selection seamlessly.
        }
      }

      baseIdsRef.current = effectiveBase;
      activeRangeIdsRef.current = new Set();

      const aidx = findUnitIndex(units, anchorWordId);
      if (aidx === -1) return;
      anchorIndexRef.current = aidx;

      applyRange(aidx, aidx);
    },
    [mode, containerRef, resolveAnchorWordId, applyRange, setSelectedWordIds]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (!isDragging.current) return;
      e.preventDefault();

      if (isDeselecting.current) {
        // Deselect mode: remove any newly touched peers using the cached unit list
        const container = containerRef.current;
        const snap = initialSelectedRef.current;

        let wordId: string | null = null;
        if (mode === "reading") {
          const el = document.elementFromPoint(e.clientX, e.clientY);
          wordId = el
            ? ((el as HTMLElement).closest?.(".quran-word") as HTMLElement | null)?.id ?? null
            : null;
        } else {
          const info = findSvgWordAtPoint(e.clientX, e.clientY, container);
          wordId = info ? info.normalizedId : null;
        }

        if (!wordId) return;

        // Reuse cached units built in onPointerDown; avoids per-move DOM query
        const units = orderedUnitsRef.current;
        const uidx = findUnitIndex(units, wordId);
        const peers = uidx >= 0 ? units[uidx] : [wordId];

        let changed = false;
        peers.forEach((id) => {
          if (snap.has(id) && !deselectedSetRef.current.has(id)) {
            deselectedSetRef.current.add(id);
            changed = true;
            if (mode === "reading") applyReadingClass(id, false);
            else if (container) applySvgClass(id, false, container);
          }
        });

        if (changed) {
          setSelectedWordIds([...snap].filter((id) => !deselectedSetRef.current.has(id)));
        }
        return;
      }

      // Add mode: compute contiguous range from anchor to current unit
      const currentIdx = resolveCurrentUnitIndex(e.clientX, e.clientY);
      if (currentIdx === -1) return;
      const anchor = anchorIndexRef.current;
      if (anchor === -1) return;

      applyRange(anchor, currentIdx);
    },
    [mode, containerRef, resolveCurrentUnitIndex, applyRange, setSelectedWordIds]
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
