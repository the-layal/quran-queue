import type { BrushFineness, ChapterMap } from "../types/quran";

export function computeQueueItemLabel(
  selectedWordIds: string[],
  brushFineness: BrushFineness,
  chapterMap: ChapterMap,
  lineRange?: { first: number; last: number }
): string {
  if (brushFineness === "line" && lineRange) {
    if (lineRange.first === lineRange.last) return `Line ${lineRange.first}`;
    return `Lines ${lineRange.first}–${lineRange.last}`;
  }

  const ayahKeys = new Set<string>();
  for (const id of selectedWordIds) {
    const parts = id.split(":");
    if (parts.length >= 2) {
      ayahKeys.add(`${parts[0]}:${parts[1]}`);
    }
  }

  const sorted = Array.from(ayahKeys)
    .map((k) => {
      const [s, a] = k.split(":").map(Number);
      return { surah: s, ayah: a };
    })
    .sort((a, b) => (a.surah !== b.surah ? a.surah - b.surah : a.ayah - b.ayah));

  if (sorted.length === 0) return "Selection";

  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const chapter = chapterMap[first.surah];
  const prefix = chapter ? `${chapter.nameSimple} ` : "";

  if (first.surah === last.surah && first.ayah === last.ayah) {
    return `${prefix}${first.surah}:${first.ayah}`;
  }
  if (first.surah === last.surah) {
    return `${prefix}${first.surah}:${first.ayah}–${last.ayah}`;
  }
  return `${first.surah}:${first.ayah} – ${last.surah}:${last.ayah}`;
}
