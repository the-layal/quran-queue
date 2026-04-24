import { useState, useEffect, useRef, useCallback } from "react";
import { useQuranStore } from "../store/quranStore";
import { loadAudioData } from "../services/quranApi";
import { computePlaybackRegions, type PlaybackRegion } from "../utils/audioRegions";
import type { AudioDataMap } from "../types/quran";
import type { ReviewQueueItem } from "../store/quranStore";

export interface QueuePlaybackState {
  queueIsPlaying: boolean;
  activeItemIndex: number | null;
  playQueue: (startIndex?: number) => void;
  pauseQueue: () => void;
  stopQueue: () => void;
}

export function useQueuePlayback(): QueuePlaybackState {
  const reviewQueue = useQuranStore((s) => s.reviewQueue);
  const [queueIsPlaying, setQueueIsPlaying] = useState(false);
  const [activeItemIndex, setActiveItemIndex] = useState<number | null>(null);

  // ------------------------------------------------------------------
  // All mutable engine state in refs so closures never go stale.
  // ------------------------------------------------------------------
  const reviewQueueRef = useRef<ReviewQueueItem[]>(reviewQueue);
  reviewQueueRef.current = reviewQueue;

  const audioDataRef = useRef<AudioDataMap | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const isPlayingRef = useRef(false);

  // Playback cursor
  const itemIndexRef = useRef(0);
  const repeatNumRef = useRef(0);
  const currentRegionsRef = useRef<PlaybackRegion[]>([]);
  const elapsedBeforeRef = useRef(0);

  // React setter refs (setters are stable but we store for symmetry)
  const setQueueIsPlayingRef = useRef(setQueueIsPlaying);
  setQueueIsPlayingRef.current = setQueueIsPlaying;
  const setActiveItemIndexRef = useRef(setActiveItemIndex);
  setActiveItemIndexRef.current = setActiveItemIndex;

  // Mutual-recursion refs (set in useEffect below)
  const playRegionRef = useRef<((ri: number, gapless?: boolean) => void) | null>(null);
  const advanceToCursorRef = useRef<((itemIndex: number, repeatNum: number) => void) | null>(null);

  // ------------------------------------------------------------------
  // Load audio data once
  // ------------------------------------------------------------------
  useEffect(() => {
    loadAudioData()
      .then((data) => {
        audioDataRef.current = data;
      })
      .catch(() => {});
  }, []);

  // ------------------------------------------------------------------
  // Audio engine — set up once, only reads refs
  // ------------------------------------------------------------------
  useEffect(() => {
    function getOrCreateAudio(): HTMLAudioElement {
      if (!audioRef.current) audioRef.current = new Audio();
      return audioRef.current;
    }

    function cancelRaf() {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    }

    function getNextCursor(
      itemIndex: number,
      repeatNum: number
    ): { itemIndex: number; repeatNum: number } | null {
      const queue = reviewQueueRef.current;
      const item = queue[itemIndex];
      if (!item) return null;
      const rc = item.repeatCount;
      if (rc === 0 || repeatNum < rc - 1) {
        // repeat this item (0 = infinite, stays at repeatNum 0)
        return { itemIndex, repeatNum: rc === 0 ? 0 : repeatNum + 1 };
      }
      const next = itemIndex + 1;
      if (next >= queue.length) return null;
      return { itemIndex: next, repeatNum: 0 };
    }

    function updateVisualState(itemIndex: number) {
      const queue = reviewQueueRef.current;
      const item = queue[itemIndex];
      if (!item) return;
      setActiveItemIndexRef.current(itemIndex);
      // Use getState() to call stable Zustand actions without stale closures
      useQuranStore.getState().setActiveQueueItemId(item.id);
      useQuranStore.getState().setSelectedWordIds(item.selectedWordIds);
      useQuranStore.getState().setBrushFineness(item.brushFineness);
    }

    function advanceToCursor(itemIndex: number, repeatNum: number) {
      if (!isPlayingRef.current) return;
      const queue = reviewQueueRef.current;
      if (itemIndex >= queue.length) {
        // Queue finished
        isPlayingRef.current = false;
        setQueueIsPlayingRef.current(false);
        setActiveItemIndexRef.current(null);
        useQuranStore.getState().setActiveQueueItemId(null);
        return;
      }

      itemIndexRef.current = itemIndex;
      repeatNumRef.current = repeatNum;
      updateVisualState(itemIndex);

      const item = queue[itemIndex];
      const aData = audioDataRef.current;
      if (!aData) {
        isPlayingRef.current = false;
        setQueueIsPlayingRef.current(false);
        return;
      }

      const regions = computePlaybackRegions(item.selectedWordIds, aData, item.brushFineness);
      if (regions.length === 0) {
        // No audio for this item — skip to next cursor
        const nc = getNextCursor(itemIndex, repeatNum);
        if (nc) {
          advanceToCursorRef.current?.(nc.itemIndex, nc.repeatNum);
        } else {
          isPlayingRef.current = false;
          setQueueIsPlayingRef.current(false);
          setActiveItemIndexRef.current(null);
          useQuranStore.getState().setActiveQueueItemId(null);
        }
        return;
      }

      currentRegionsRef.current = regions;
      elapsedBeforeRef.current = 0;
      playRegionRef.current?.(0, false);
    }

    function playRegion(regionIndex: number, gapless = false) {
      if (!isPlayingRef.current) return;

      const allRegions = currentRegionsRef.current;

      if (regionIndex >= allRegions.length) {
        const nc = getNextCursor(itemIndexRef.current, repeatNumRef.current);
        if (!nc) {
          isPlayingRef.current = false;
          setQueueIsPlayingRef.current(false);
          setActiveItemIndexRef.current(null);
          useQuranStore.getState().setActiveQueueItemId(null);
          return;
        }
        advanceToCursorRef.current?.(nc.itemIndex, nc.repeatNum);
        return;
      }

      const region = allRegions[regionIndex];
      const startSec = region.startMs / 1000;
      const endSec = region.endMs / 1000;
      const regionDurSec = region.durationMs / 1000;
      const elapsedBefore = elapsedBeforeRef.current;

      cancelRaf();
      const audio = getOrCreateAudio();
      audio.onended = null;

      const startTicking = () => {
        const tick = () => {
          if (!isPlayingRef.current) return;

          const ct = audio.currentTime;

          // Determine next region — may cross item/repeat boundary for gapless
          let nextRegion: PlaybackRegion | null = null;
          if (regionIndex + 1 < allRegions.length) {
            nextRegion = allRegions[regionIndex + 1];
          } else {
            // Last region of this item's run — look ahead for cross-item gapless
            const nc = getNextCursor(itemIndexRef.current, repeatNumRef.current);
            if (nc) {
              const aData = audioDataRef.current;
              const nextItem = reviewQueueRef.current[nc.itemIndex];
              if (aData && nextItem) {
                const nextRegions = computePlaybackRegions(
                  nextItem.selectedWordIds,
                  aData,
                  nextItem.brushFineness
                );
                nextRegion = nextRegions[0] ?? null;
              }
            }
          }

          const gaplessOk =
            !audio.ended &&
            nextRegion != null &&
            nextRegion.audioUrl === region.audioUrl &&
            nextRegion.surahNumber === region.surahNumber &&
            nextRegion.ayahNumber === region.ayahNumber + 1;

          const endThreshold = gaplessOk ? endSec - 0.01 : endSec - 0.08;

          if (ct >= endThreshold || audio.ended) {
            elapsedBeforeRef.current = elapsedBefore + regionDurSec;

            if (gaplessOk) {
              if (regionIndex + 1 < allRegions.length) {
                // Normal within-item gapless
                playRegionRef.current?.(regionIndex + 1, true);
              } else {
                // Cross-item gapless: update cursor metadata without pausing audio
                const nc = getNextCursor(itemIndexRef.current, repeatNumRef.current)!;
                itemIndexRef.current = nc.itemIndex;
                repeatNumRef.current = nc.repeatNum;
                updateVisualState(nc.itemIndex);

                const aData = audioDataRef.current!;
                const nextItem = reviewQueueRef.current[nc.itemIndex];
                const nextRegions = computePlaybackRegions(
                  nextItem.selectedWordIds,
                  aData,
                  nextItem.brushFineness
                );
                currentRegionsRef.current = nextRegions;
                elapsedBeforeRef.current = 0;
                // Audio keeps playing — just track the new first region
                playRegionRef.current?.(0, true);
              }
            } else {
              audio.pause();
              audio.onended = null;
              playRegionRef.current?.(regionIndex + 1, false);
            }
            return;
          }

          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      };

      const doSeekAndPlay = () => {
        if (!isPlayingRef.current) return;
        const PREROLL_SEC = 0.1;
        audio.currentTime = Math.max(0, startSec - PREROLL_SEC);
        const p = audio.play();
        if (p) {
          p.then(startTicking).catch(() => {
            isPlayingRef.current = false;
            setQueueIsPlayingRef.current(false);
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
        startTicking();
      } else {
        doSeekAndPlay();
      }
    }

    playRegionRef.current = playRegion;
    advanceToCursorRef.current = advanceToCursor;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ------------------------------------------------------------------
  // Cleanup on unmount
  // ------------------------------------------------------------------
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (audioRef.current) {
        audioRef.current.onended = null;
        audioRef.current.pause();
        audioRef.current.src = "";
        audioRef.current = null;
      }
    };
  }, []);

  // ------------------------------------------------------------------
  // Public API
  // ------------------------------------------------------------------
  const playQueue = useCallback((startIndex = 0) => {
    isPlayingRef.current = true;
    setQueueIsPlaying(true);
    advanceToCursorRef.current?.(startIndex, 0);
  }, []);

  const pauseQueue = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    if (audioRef.current) audioRef.current.pause();
    isPlayingRef.current = false;
    setQueueIsPlaying(false);
  }, []);

  const stopQueue = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    if (audioRef.current) {
      audioRef.current.onended = null;
      audioRef.current.pause();
    }
    isPlayingRef.current = false;
    setQueueIsPlaying(false);
    setActiveItemIndex(null);
  }, []);

  return { queueIsPlaying, activeItemIndex, playQueue, pauseQueue, stopQueue };
}
