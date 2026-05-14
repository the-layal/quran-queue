import type { BrushFineness, ChapterMap } from "../types/quran";
import type { ReviewQueueItem, SubQueue } from "../store/quranStore";
import { computeQueueItemLabel } from "./queueLabel";

function genId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export type GroupedGranularity = "line" | "ayah";

export interface LineData {
  lineNumber: number;
  wordIds: string[];
}

export interface SectionPreview {
  label: string;
  lineNumbers: number[];
}

// Read all text-word elements from the currently-rendered Mushaf page.
export function getPageLineData(): LineData[] {
  const lineWordMap = new Map<number, string[]>();
  document
    .querySelectorAll<Element>(
      'g[data-line-number][data-surah][data-aya][data-word-index-in-ayah][data-type="text"]'
    )
    .forEach((el) => {
      const ln = el.getAttribute("data-line-number");
      const s = el.getAttribute("data-surah");
      const a = el.getAttribute("data-aya");
      const w = el.getAttribute("data-word-index-in-ayah");
      if (!ln || !s || !a || !w) return;
      const lineNum = parseInt(ln, 10);
      const surah = parseInt(s, 10);
      const ayah = parseInt(a, 10);
      const wordId = `${surah}:${ayah}:${w}`;
      if (!lineWordMap.has(lineNum)) lineWordMap.set(lineNum, []);
      lineWordMap.get(lineNum)!.push(wordId);
    });

  return Array.from(lineWordMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([lineNumber, wordIds]) => ({ lineNumber, wordIds }));
}

// Build ReviewQueueItems for a set of lines based on granularity.
//
// "line"  → one item per line, brushFineness "line"
// "ayah"  → one item per ayah visible in these lines, brushFineness "word"
//           Using "word" means the audio engine trims playback to the exact
//           timestamp range of the selected word IDs.  This lets boundary
//           ayahs (whose words are split across two sections) play only their
//           portion in each section rather than duplicating the full ayah.
function buildItemsForLines(
  lines: LineData[],
  granularity: GroupedGranularity,
  chapters: ChapterMap,
  repeatCount: number
): ReviewQueueItem[] {
  if (granularity === "line") {
    return lines.map((line) => ({
      id: genId(),
      selectedWordIds: line.wordIds,
      brushFineness: "line" as BrushFineness,
      label: computeQueueItemLabel(line.wordIds, "line", chapters, {
        first: line.lineNumber,
        last: line.lineNumber,
      }),
      repeatCount,
    }));
  }

  // Collect all words grouped by ayah within these lines.
  const ayahWordMap = new Map<string, string[]>();
  for (const line of lines) {
    for (const wordId of line.wordIds) {
      const parts = wordId.split(":");
      if (parts.length < 2) continue;
      const ayahKey = `${parts[0]}:${parts[1]}`;
      if (!ayahWordMap.has(ayahKey)) ayahWordMap.set(ayahKey, []);
      ayahWordMap.get(ayahKey)!.push(wordId);
    }
  }

  return Array.from(ayahWordMap.entries())
    .sort(([a], [b]) => {
      const [as_, aa] = a.split(":").map(Number);
      const [bs, ba] = b.split(":").map(Number);
      return as_ !== bs ? as_ - bs : aa - ba;
    })
    .map(([, wordIds]) => ({
      id: genId(),
      selectedWordIds: wordIds,
      // "word" fineness so the audio engine uses per-word timestamps.
      // A full ayah will play its full span; a partial boundary ayah will
      // play only the words present in this section.
      brushFineness: "word" as BrushFineness,
      label: computeQueueItemLabel(wordIds, "ayah", chapters),
      repeatCount,
    }));
}

function buildSubQueueLabel(lines: LineData[]): string {
  if (lines.length === 0) return "Group";
  const first = lines[0].lineNumber;
  const last = lines[lines.length - 1].lineNumber;
  if (first === last) return `Line ${first}`;
  return `Lines ${first}–${last}`;
}

// Divide `lines` into `n` roughly equal sections.
// Remainder lines are distributed to earlier sections so sizes differ by at most 1.
export function splitIntoNSections(
  lines: LineData[],
  n: number,
  granularity: GroupedGranularity,
  chapters: ChapterMap,
  repeatCount: number,
  subQueueRepeatCount: number
): SubQueue[] {
  if (lines.length === 0 || n <= 0) return [];
  const count = Math.min(n, lines.length);
  const base = Math.floor(lines.length / count);
  const remainder = lines.length % count;

  const subQueues: SubQueue[] = [];
  let offset = 0;
  for (let i = 0; i < count; i++) {
    const size = base + (i < remainder ? 1 : 0);
    const sectionLines = lines.slice(offset, offset + size);
    offset += size;
    if (sectionLines.length === 0) continue;
    const items = buildItemsForLines(sectionLines, granularity, chapters, repeatCount);
    if (items.length === 0) continue;
    subQueues.push({
      isSubQueue: true,
      id: genId(),
      label: buildSubQueueLabel(sectionLines),
      repeatCount: subQueueRepeatCount,
      items,
    });
  }
  return subQueues;
}

// Create groups of exactly `n` lines, with a smaller final group if needed.
export function splitIntoGroupsOfN(
  lines: LineData[],
  n: number,
  granularity: GroupedGranularity,
  chapters: ChapterMap,
  repeatCount: number,
  subQueueRepeatCount: number
): SubQueue[] {
  if (lines.length === 0 || n <= 0) return [];
  const subQueues: SubQueue[] = [];
  for (let offset = 0; offset < lines.length; offset += n) {
    const sectionLines = lines.slice(offset, offset + n);
    const items = buildItemsForLines(sectionLines, granularity, chapters, repeatCount);
    if (items.length === 0) continue;
    subQueues.push({
      isSubQueue: true,
      id: genId(),
      label: buildSubQueueLabel(sectionLines),
      repeatCount: subQueueRepeatCount,
      items,
    });
  }
  return subQueues;
}

// Generate section previews without building full items (for live preview UI).
export function previewSplitIntoNSections(lines: LineData[], n: number): SectionPreview[] {
  if (lines.length === 0 || n <= 0) return [];
  const count = Math.min(n, lines.length);
  const base = Math.floor(lines.length / count);
  const remainder = lines.length % count;
  const previews: SectionPreview[] = [];
  let offset = 0;
  for (let i = 0; i < count; i++) {
    const size = base + (i < remainder ? 1 : 0);
    const sectionLines = lines.slice(offset, offset + size);
    offset += size;
    if (sectionLines.length === 0) continue;
    previews.push({
      label: buildSubQueueLabel(sectionLines),
      lineNumbers: sectionLines.map((l) => l.lineNumber),
    });
  }
  return previews;
}

export function previewGroupsOfN(lines: LineData[], n: number): SectionPreview[] {
  if (lines.length === 0 || n <= 0) return [];
  const previews: SectionPreview[] = [];
  for (let offset = 0; offset < lines.length; offset += n) {
    const sectionLines = lines.slice(offset, offset + n);
    previews.push({
      label: buildSubQueueLabel(sectionLines),
      lineNumbers: sectionLines.map((l) => l.lineNumber),
    });
  }
  return previews;
}
