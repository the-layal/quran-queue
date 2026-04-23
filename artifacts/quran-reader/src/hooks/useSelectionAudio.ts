import { useState, useEffect, useRef, useCallback } from "react";
import { useQuranStore } from "../store/quranStore";
import { loadAudioData } from "../services/quranApi";
import { computePlaybackRegions, type PlaybackRegion } from "../utils/audioRegions";
import type { AudioDataMap } from "../types/quran";

export interface SelectionAudioState {
  isPlaying: boolean;
  isLooping: boolean;
  progress: number;
  currentAyahKey: string | null;
  hasSelection: boolean;
  hasAudio: boolean;
  play: () => void;
  pause: () => void;
  toggleLoop: () => void;
}

function getWordElement(wordId: string): Element | null {
  const el = document.getElementById(wordId);
  if (el) return el;
  const [s, a, w] = wordId.split(":");
  return document.querySelector(
    `g[data-surah="${s.padStart(3, "0")}"][data-aya="${a.padStart(3, "0")}"][data-word-index-in-ayah="${w}"]`
  );
}

function getAllAyahWordIds(ayahKey: string): string[] {
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
    `g[data-surah="${String(surah).padStart(3, "0")}"][data-aya="${String(ayah).padStart(3, "0")}"][data-word-index-in-ayah]`
  );
  svgWords.forEach((el) => {
    const wi = el.getAttribute("data-word-index-in-ayah");
    if (wi) ids.push(`${surah}:${ayah}:${wi}`);
  });

  return ids;
}

function getAllLineWordIds(activeKey: string, currentWordIndex: number): string[] {
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
      `g[data-line-number="${lineNumber}"][data-word-index-in-ayah]`
    );
    lineWords.forEach((el) => {
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

function computeCurrentWordIndex(
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

export function useSelectionAudio(): SelectionAudioState {
  const selectedWordIds = useQuranStore((s) => s.selectedWordIds);
  const brushFineness = useQuranStore((s) => s.brushFineness);
  const playbackHighlightMode = useQuranStore((s) => s.playbackHighlightMode);
  const setPlaybackActiveIds = useQuranStore((s) => s.setPlaybackActiveIds);
  const setPlaybackCurrentWordId = useQuranStore((s) => s.setPlaybackCurrentWordId);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isLooping, setIsLooping] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentAyahKey, setCurrentAyahKey] = useState<string | null>(null);
  const [audioData, setAudioData] = useState<AudioDataMap | null>(null);
  const [regions, setRegions] = useState<PlaybackRegion[]>([]);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const isLoopingRef = useRef(false);
  const regionsRef = useRef<PlaybackRegion[]>([]);
  const regionIndexRef = useRef(0);
  const totalDurSecRef = useRef(0);
  const elapsedBeforeSecRef = useRef(0);
  const prevActiveIdsRef = useRef<string[]>([]);
  const prevCurrentWordIdRef = useRef<string | null>(null);

  const playbackHighlightModeRef = useRef(playbackHighlightMode);
  playbackHighlightModeRef.current = playbackHighlightMode;

  const audioDataRef = useRef(audioData);
  audioDataRef.current = audioData;

  isLoopingRef.current = isLooping;
  regionsRef.current = regions;

  // When the highlight mode changes, invalidate the cached IDs so the very next
  // RAF tick always pushes a fresh update — even if the new mode happens to
  // produce the same word list as the old mode (e.g. a single-line short ayah).
  useEffect(() => {
    prevActiveIdsRef.current = [];
    prevCurrentWordIdRef.current = null;
  }, [playbackHighlightMode]);

  useEffect(() => {
    loadAudioData()
      .then(setAudioData)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!audioData) return;
    const newRegions = computePlaybackRegions(selectedWordIds, audioData, brushFineness);
    setRegions(newRegions);
    stopPlayback();
    setProgress(0);
    setCurrentAyahKey(null);
  }, [selectedWordIds, audioData, brushFineness]);

  function getOrCreateAudio(): HTMLAudioElement {
    if (!audioRef.current) {
      audioRef.current = new Audio();
    }
    return audioRef.current;
  }

  function clearActiveHighlight() {
    prevActiveIdsRef.current = [];
    prevCurrentWordIdRef.current = null;
    setPlaybackActiveIds([]);
    setPlaybackCurrentWordId(null);
  }

  function cancelRaf() {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }

  function stopPlayback() {
    cancelRaf();
    if (audioRef.current) {
      audioRef.current.onended = null;
      audioRef.current.pause();
    }
    regionIndexRef.current = 0;
    elapsedBeforeSecRef.current = 0;
    setIsPlaying(false);
    clearActiveHighlight();
  }

  const playRegion = useCallback((regionIndex: number, gapless = false) => {
    const allRegions = regionsRef.current;

    if (regionIndex >= allRegions.length) {
      if (isLoopingRef.current) {
        elapsedBeforeSecRef.current = 0;
        playRegion(0);
      } else {
        cancelRaf();
        setIsPlaying(false);
        setProgress(1);
        prevActiveIdsRef.current = [];
        prevCurrentWordIdRef.current = null;
        setPlaybackActiveIds([]);
        setPlaybackCurrentWordId(null);
      }
      return;
    }

    const region = allRegions[regionIndex];
    regionIndexRef.current = regionIndex;

    const startSec = region.startMs / 1000;
    const endSec = region.endMs / 1000;
    const regionDurSec = region.durationMs / 1000;
    const totalDur = totalDurSecRef.current;
    const elapsedBefore = elapsedBeforeSecRef.current;

    setCurrentAyahKey(region.ayahKey);
    cancelRaf();

    const audio = getOrCreateAudio();
    audio.onended = null;

    const startTicking = () => {
      const tick = () => {
        const ct = audio.currentTime;
        const regionElapsed = Math.max(0, ct - startSec);
        const prog =
          totalDur > 0
            ? Math.min((elapsedBefore + regionElapsed) / totalDur, 1)
            : 0;
        setProgress(prog);

        // Highlight tracking: compute which words are active and push to store
        const mode = playbackHighlightModeRef.current;
        const aData = audioDataRef.current;
        const activeKey = region.ayahKey;
        const audioRelativeMs = region.playFullAyah
          ? regionElapsed * 1000
          : region.startMs + regionElapsed * 1000;

        let newActiveIds: string[];
        let currentWordIndex: number | null = null;

        if (mode === "ayah") {
          newActiveIds = getAllAyahWordIds(activeKey);
          currentWordIndex = aData
            ? computeCurrentWordIndex(audioRelativeMs, aData, activeKey)
            : null;
        } else {
          currentWordIndex = aData
            ? computeCurrentWordIndex(audioRelativeMs, aData, activeKey)
            : null;
          if (currentWordIndex !== null) {
            newActiveIds = getAllLineWordIds(activeKey, currentWordIndex);
          } else {
            newActiveIds = getAllAyahWordIds(activeKey);
          }
        }

        const prev = prevActiveIdsRef.current;
        const changed =
          newActiveIds.length !== prev.length ||
          newActiveIds.some((id, i) => id !== prev[i]);
        if (changed) {
          prevActiveIdsRef.current = newActiveIds;
          setPlaybackActiveIds(newActiveIds);
        }

        // Publish the single word being spoken right now (for word-level overlay).
        // Deduplicate: only update the store when the word actually changes so we
        // don't trigger unnecessary Zustand updates on every RAF tick.
        const [surahStr, ayahStr] = activeKey.split(":");
        const newCurrentWordId =
          currentWordIndex !== null
            ? `${parseInt(surahStr, 10)}:${parseInt(ayahStr, 10)}:${currentWordIndex}`
            : null;
        if (newCurrentWordId !== prevCurrentWordIdRef.current) {
          prevCurrentWordIdRef.current = newCurrentWordId;
          setPlaybackCurrentWordId(newCurrentWordId);
        }

        // Pre-compute gapless eligibility so we can set the boundary threshold
        // correctly: gapless transitions need no seek, so a tight boundary is
        // fine; pause/seek transitions need an 80 ms lookahead to avoid stutters.
        const nextIndex = regionIndex + 1;
        const nextRegion = allRegions[nextIndex];
        const gaplessOk =
          !audio.ended &&
          nextRegion != null &&
          nextRegion.audioUrl === region.audioUrl &&
          nextRegion.surahNumber === region.surahNumber &&
          nextRegion.ayahNumber === region.ayahNumber + 1;
        // For gapless: fire at the true boundary (10 ms slack for float jitter).
        // For pause/seek: keep the original 80 ms lookahead.
        const endThreshold = gaplessOk ? endSec - 0.01 : endSec - 0.08;

        if (ct >= endThreshold || audio.ended) {
          elapsedBeforeSecRef.current = elapsedBefore + regionDurSec;

          if (gaplessOk) {
            // Same adjacent surah region: audio keeps playing uninterrupted.
            playRegion(nextIndex, true);
          } else {
            audio.pause();
            audio.onended = null;
            playRegion(nextIndex, false);
          }
          return;
        }

        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    };

    const doSeekAndPlay = () => {
      // Seek slightly before the desired start to avoid MP3 frame-alignment
      // cut-offs (the decoder snaps to the nearest keyframe, which can be
      // ~26 ms after the requested point). The RAF loop discards the pre-roll
      // via Math.max(0, ct - startSec), so highlights and progress are
      // unaffected. 100 ms is typically inter-word silence in recitation.
      const PREROLL_SEC = 0.1;
      audio.currentTime = Math.max(0, startSec - PREROLL_SEC);
      const p = audio.play();
      if (p) {
        p.then(startTicking).catch(() => {
          setIsPlaying(false);
        });
      } else {
        startTicking();
      }
    };

    if (audio.src !== region.audioUrl) {
      audio.src = region.audioUrl;
      audio.load();
      audio.addEventListener("canplay", doSeekAndPlay, { once: true });
    } else if (gapless) {
      // Same URL, audio is already playing — skip the seek and start tracking
      // the new region immediately.
      startTicking();
    } else {
      doSeekAndPlay();
    }
  }, []);

  const play = useCallback(() => {
    if (regions.length === 0) return;
    const totalMs = regions.reduce((sum, r) => sum + r.durationMs, 0);
    totalDurSecRef.current = totalMs / 1000;
    elapsedBeforeSecRef.current = 0;
    regionIndexRef.current = 0;
    setIsPlaying(true);
    playRegion(0);
  }, [regions, playRegion]);

  const pause = useCallback(() => {
    stopPlayback();
  }, []);

  const toggleLoop = useCallback(() => {
    setIsLooping((prev) => !prev);
  }, []);

  useEffect(() => {
    return () => {
      cancelRaf();
      if (audioRef.current) {
        audioRef.current.onended = null;
        audioRef.current.pause();
        audioRef.current.src = "";
        audioRef.current = null;
      }
    };
  }, []);

  const hasSelection = selectedWordIds.length > 0;
  const hasAudio = regions.length > 0;

  return {
    isPlaying,
    isLooping,
    progress,
    currentAyahKey,
    hasSelection,
    hasAudio,
    play,
    pause,
    toggleLoop,
  };
}
