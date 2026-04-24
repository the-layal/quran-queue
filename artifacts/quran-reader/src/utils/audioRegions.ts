import type { AudioDataMap, BrushFineness } from "../types/quran";

export interface PlaybackRegion {
  audioUrl: string;
  startMs: number;
  endMs: number;
  ayahKey: string;
  surahNumber: number;
  ayahNumber: number;
  durationMs: number;
  playFullAyah?: boolean;
}

export function computePlaybackRegions(
  selectedWordIds: string[],
  audioData: AudioDataMap,
  brushFineness: BrushFineness = "word",
  svgToJsonWordMap?: Record<string, Record<number, number>>
): PlaybackRegion[] {
  const parsed = selectedWordIds
    .map((id) => {
      const parts = id.split(":").map(Number);
      if (parts.length !== 3 || parts.some(isNaN)) return null;
      return { surah: parts[0], ayah: parts[1], wordIndex: parts[2] };
    })
    .filter(Boolean) as { surah: number; ayah: number; wordIndex: number }[];

  const ayahMap = new Map<
    string,
    { surah: number; ayah: number; wordIndices: number[] }
  >();

  for (const { surah, ayah, wordIndex } of parsed) {
    const key = `${surah}:${ayah}`;
    if (!ayahMap.has(key)) {
      ayahMap.set(key, { surah, ayah, wordIndices: [] });
    }
    ayahMap.get(key)!.wordIndices.push(wordIndex);
  }

  const sortedEntries = Array.from(ayahMap.entries()).sort(([, a], [, b]) => {
    if (a.surah !== b.surah) return a.surah - b.surah;
    return a.ayah - b.ayah;
  });

  const regions: PlaybackRegion[] = [];

  // "ayah" fineness plays the full ayah span; "word" and "line" play the
  // selected word segments.  In the new surah-level data, all timestamps
  // (both word-segment and ayah timestamp_from/to) are absolute offsets
  // within the surah MP3, so the same non-branching playback path handles
  // every case.
  const fullAyahMode = brushFineness !== "word" && brushFineness !== "line";

  for (const [ayahKey, { surah, ayah, wordIndices }] of sortedEntries) {
    const ayahAudio = audioData[ayahKey];
    if (!ayahAudio) continue;

    if (fullAyahMode) {
      const startMs = ayahAudio.timestamp_from;
      const endMs = ayahAudio.timestamp_to;
      regions.push({
        audioUrl: ayahAudio.audio_url,
        startMs,
        endMs,
        ayahKey,
        surahNumber: surah,
        ayahNumber: ayah,
        durationMs: Math.max(0, endMs - startMs),
      });
      continue;
    }

    // Word / line mode: use the word-level segment timestamps.
    // Segments are [wordIndex, startMs, endMs] — absolute within surah MP3.
    // The SVG assigns separate word indices to waw al-atf groups, but the JSON
    // bundles each waw with the word that follows it — so SVG word indices are
    // offset past any preceding waw groups.  svgToJsonWordMap provides the
    // corrected JSON segment index for every SVG word index in ayahs that have
    // waw al-atf splits; for other ayahs the SVG and JSON indices align 1-to-1.
    const svgMap = svgToJsonWordMap?.[ayahKey];
    const matched = wordIndices
      .map((wi) => {
        const jsonWi = svgMap ? (svgMap[wi] ?? wi) : wi;
        return ayahAudio.segments.find((seg) => seg[0] === jsonWi);
      })
      .filter(Boolean) as [number, number, number][];

    if (matched.length === 0) continue;

    const startMs = Math.min(...matched.map((s) => s[1]));
    const endMs = Math.max(...matched.map((s) => s[2]));
    const durationMs = Math.max(0, endMs - startMs);

    regions.push({
      audioUrl: ayahAudio.audio_url,
      startMs,
      endMs,
      ayahKey,
      surahNumber: surah,
      ayahNumber: ayah,
      durationMs,
    });
  }

  return regions;
}
