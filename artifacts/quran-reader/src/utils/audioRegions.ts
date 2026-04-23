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
  brushFineness: BrushFineness = "word"
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

  const fullAyahMode = brushFineness !== "word" && brushFineness !== "line";

  for (const [ayahKey, { surah, ayah, wordIndices }] of sortedEntries) {
    const ayahAudio = audioData[ayahKey];
    if (!ayahAudio) continue;

    if (fullAyahMode) {
      regions.push({
        audioUrl: ayahAudio.audio_url,
        startMs: 0,
        endMs: 0,
        ayahKey,
        surahNumber: surah,
        ayahNumber: ayah,
        durationMs: 0,
        playFullAyah: true,
      });
      continue;
    }

    const matched = wordIndices
      .map((wi) => ayahAudio.segments.find((seg) => seg[0] === wi))
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
