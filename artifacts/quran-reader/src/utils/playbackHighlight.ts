import { hasArabicLetter } from "./arabicUtils";
import type { AudioDataMap } from "../types/quran";

function getWordElement(wordId: string): Element | null {
  const el = document.getElementById(wordId);
  if (el) return el;
  const [s, a, w] = wordId.split(":");
  return document.querySelector(
    `g[data-surah="${s.padStart(3, "0")}"][data-aya="${a.padStart(3, "0")}"][data-word-index-in-ayah="${w}"][data-type="text"]`
  );
}

export function getAllAyahWordIds(ayahKey: string): string[] {
  const [surahStr, ayahStr] = ayahKey.split(":");
  const surah = parseInt(surahStr, 10);
  const ayah = parseInt(ayahStr, 10);
  const ids: string[] = [];

  const htmlWords = document.querySelectorAll<HTMLElement>(
    `.quran-word[data-surah="${surah}"][data-ayah="${ayah}"]`
  );
  htmlWords.forEach((el) => {
    if (el.id) ids.push(el.id);
  });

  const svgWords = document.querySelectorAll<Element>(
    `g[data-surah="${String(surah).padStart(3, "0")}"][data-aya="${String(ayah).padStart(3, "0")}"][data-word-index-in-ayah][data-type="text"]`
  );
  svgWords.forEach((el) => {
    const hafs = el.getAttribute("data-hafs");
    if (hafs !== null && hafs !== "" && !hasArabicLetter(hafs)) return;
    const wi = el.getAttribute("data-word-index-in-ayah");
    if (wi) ids.push(`${surah}:${ayah}:${wi}`);
  });

  return ids;
}

export function getAllLineWordIds(activeKey: string, currentWordIndex: number): string[] {
  const [surahStr, ayahStr] = activeKey.split(":");
  const surah = parseInt(surahStr, 10);
  const ayah = parseInt(ayahStr, 10);
  const currentWordId = `${surah}:${ayah}:${currentWordIndex}`;
  const currentEl = getWordElement(currentWordId);

  if (!currentEl) {
    return getAllAyahWordIds(activeKey);
  }

  const lineNumber = currentEl.getAttribute("data-line-number");
  if (lineNumber) {
    const ids: string[] = [];
    const lineWords = document.querySelectorAll<Element>(
      `g[data-line-number="${lineNumber}"][data-word-index-in-ayah][data-type="text"]`
    );
    lineWords.forEach((el) => {
      const hafs = el.getAttribute("data-hafs");
      if (hafs !== null && hafs !== "" && !hasArabicLetter(hafs)) return;
      const s = el.getAttribute("data-surah");
      const a = el.getAttribute("data-aya");
      const w = el.getAttribute("data-word-index-in-ayah");
      if (s && a && w) {
        ids.push(`${parseInt(s, 10)}:${parseInt(a, 10)}:${w}`);
      }
    });
    return ids;
  }

  const currentRect = currentEl.getBoundingClientRect();
  const targetY = currentRect.top + currentRect.height / 2;
  const tolerance = Math.max(currentRect.height * 0.55, 8);
  const ids: string[] = [];
  const allReadingWords = document.querySelectorAll<HTMLElement>(".quran-word[id]");
  allReadingWords.forEach((el) => {
    const rect = el.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    if (Math.abs(midY - targetY) <= tolerance && el.id) {
      ids.push(el.id);
    }
  });
  return ids;
}

export function computeCurrentWordIndex(
  audioRelativeMs: number,
  audioData: AudioDataMap,
  activeKey: string
): number | null {
  const ayahAudio = audioData[activeKey];
  if (!ayahAudio || ayahAudio.segments.length === 0) return null;

  const segments = ayahAudio.segments;
  let bestStart = -Infinity;
  let currentWordIndex: number | null = null;

  for (const [wi, segStart, segEnd] of segments) {
    if (audioRelativeMs >= segStart && audioRelativeMs < segEnd) {
      return wi;
    }
    if (audioRelativeMs >= segStart && segStart > bestStart) {
      bestStart = segStart;
      currentWordIndex = wi;
    }
  }

  if (currentWordIndex === null) {
    currentWordIndex = segments[0][0];
  }
  return currentWordIndex;
}
