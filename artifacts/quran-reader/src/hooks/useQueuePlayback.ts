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

interface PauseState {
  regionIndex: number;
  offsetInRegion: number; // seconds from region start
  elapsedBefore: number;
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
  const regionIndexRef = useRef(0);
  const currentRegionsRef = useRef<PlaybackRegion[]>([]);
  const elapsedBeforeRef = useRef(0);

  // Pause resume state (null when not paused)
  const pauseStateRef = useRef<PauseState | null>(null);

  // React setter refs
  const setQueueIsPlayingRef = useRef(setQueueIsPlaying);
  setQueueIsPlayingRef.current = setQueueIsPlaying;
  const setActiveItemIndexRef = useRef(setActiveItemIndex);
  setActiveItemIndexRef.current = setActiveItemIndex;

  // Mutual-recursion refs (set in useEffect below)
  const playRegionRef = useRef<((ri: number, gapless?: boolean, seekOffsetSec?: number) => void) | null>(null);
  const advanceToCursorRef = useRef<((itemIndex: number, repeatNum: number) => void) | null>(null);

  // ------------------------------------------------------------------
  // Load audio data once
  // ------------------------------------------------------------------
  useEffect(() => {
    loadAudioData()
      .then((data) => { audioDataRef.current = data; })
      .catch(() => {});
  }, []);

  // ------------------------------------------------------------------
  // Audio engine — set up once with empty deps; accesses all state via refs
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
      useQuranStore.getState().setActiveQueueItemId(item.id);
      useQuranStore.getState().setSelectedWordIds(item.selectedWordIds);
      useQuranStore.getState().setBrushFineness(item.brushFineness);
    }

    function finishIdle() {
      isPlayingRef.current = false;
      setQueueIsPlayingRef.current(false);
      setActiveItemIndexRef.current(null);
      useQuranStore.getState().setActiveQueueItemId(null);
    }

    function advanceToCursor(itemIndex: number, repeatNum: number) {
      if (!isPlayingRef.current) return;
      const queue = reviewQueueRef.current;
      if (itemIndex >= queue.length) {
        finishIdle();
        return;
      }

      itemIndexRef.current = itemIndex;
      repeatNumRef.current = repeatNum;
      updateVisualState(itemIndex);

      const item = queue[itemIndex];
      const aData = audioDataRef.current;
      if (!aData) { isPlayingRef.current = false; setQueueIsPlayingRef.current(false); return; }

      const regions = computePlaybackRegions(item.selectedWordIds, aData, item.brushFineness);
      if (regions.length === 0) {
        const nc = getNextCursor(itemIndex, repeatNum);
        if (nc) advanceToCursorRef.current?.(nc.itemIndex, nc.repeatNum);
        else finishIdle();
        return;
      }

      currentRegionsRef.current = regions;
      elapsedBeforeRef.current = 0;
      playRegionRef.current?.(0, false);
    }

    function playRegion(regionIndex: number, gapless = false, seekOffsetSec?: number) {
      if (!isPlayingRef.current) return;

      const allRegions = currentRegionsRef.current;
      if (regionIndex >= allRegions.length) {
        const nc = getNextCursor(itemIndexRef.current, repeatNumRef.current);
        if (!nc) { finishIdle(); return; }
        advanceToCursorRef.current?.(nc.itemIndex, nc.repeatNum);
        return;
      }

      const region = allRegions[regionIndex];
      const startSec = region.startMs / 1000;
      const endSec = region.endMs / 1000;
      const regionDurSec = region.durationMs / 1000;
      const elapsedBefore = elapsedBeforeRef.current;
      regionIndexRef.current = regionIndex;

      cancelRaf();
      const audio = getOrCreateAudio();
      audio.onended = null;

      const startTicking = () => {
        const tick = () => {
          if (!isPlayingRef.current) return;
          const ct = audio.currentTime;

          // Determine next region — may cross item/repeat boundaries for gapless
          let nextRegion: PlaybackRegion | null = null;
          if (regionIndex + 1 < allRegions.length) {
            nextRegion = allRegions[regionIndex + 1];
          } else {
            const nc = getNextCursor(itemIndexRef.current, repeatNumRef.current);
            if (nc) {
              const aData = audioDataRef.current;
              const nextItem = reviewQueueRef.current[nc.itemIndex];
              if (aData && nextItem) {
                const nr = computePlaybackRegions(nextItem.selectedWordIds, aData, nextItem.brushFineness);
                nextRegion = nr[0] ?? null;
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
                playRegionRef.current?.(regionIndex + 1, true);
              } else {
                // Cross-item/repeat gapless: update cursor without pausing audio
                const nc = getNextCursor(itemIndexRef.current, repeatNumRef.current)!;
                itemIndexRef.current = nc.itemIndex;
                repeatNumRef.current = nc.repeatNum;
                updateVisualState(nc.itemIndex);
                const aData = audioDataRef.current!;
                const nextItem = reviewQueueRef.current[nc.itemIndex];
                const nextRegions = computePlaybackRegions(nextItem.selectedWordIds, aData, nextItem.brushFineness);
                currentRegionsRef.current = nextRegions;
                elapsedBeforeRef.current = 0;
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
        // When resuming from pause, seek to the exact saved offset; otherwise use preroll
        const targetTime =
          seekOffsetSec !== undefined
            ? startSec + seekOffsetSec
            : Math.max(0, startSec - PREROLL_SEC);
        audio.currentTime = targetTime;
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
  const playQueue = useCallback(
    (startIndex?: number) => {
      const currentItemIndex = activeItemIndex;
      const isPaused = !isPlayingRef.current && currentItemIndex !== null;

      // Resume from paused position if caller doesn't specify a different index
      if (
        isPaused &&
        pauseStateRef.current &&
        (startIndex === undefined || startIndex === currentItemIndex)
      ) {
        const ps = pauseStateRef.current;
        pauseStateRef.current = null;
        isPlayingRef.current = true;
        setQueueIsPlaying(true);
        // Restore elapsed context and play from paused position
        elapsedBeforeRef.current = ps.elapsedBefore;
        playRegionRef.current?.(ps.regionIndex, false, ps.offsetInRegion);
      } else {
        // Fresh start (or jump to a specific item)
        pauseStateRef.current = null;
        isPlayingRef.current = true;
        setQueueIsPlaying(true);
        advanceToCursorRef.current?.(startIndex ?? 0, 0);
      }
    },
    [activeItemIndex]
  );

  const pauseQueue = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    const audio = audioRef.current;
    if (audio) {
      const allRegions = currentRegionsRef.current;
      const ri = regionIndexRef.current;
      const region = allRegions[ri];
      if (region) {
        pauseStateRef.current = {
          regionIndex: ri,
          offsetInRegion: Math.max(0, audio.currentTime - region.startMs / 1000),
          elapsedBefore: elapsedBeforeRef.current,
        };
      }
      audio.pause();
    }
    isPlayingRef.current = false;
    setQueueIsPlaying(false);
  }, []);

  const stopQueue = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (audioRef.current) {
      audioRef.current.onended = null;
      audioRef.current.pause();
    }
    pauseStateRef.current = null;
    isPlayingRef.current = false;
    setQueueIsPlaying(false);
    setActiveItemIndex(null);
    // Clear store active-item highlight for full idle reset
    useQuranStore.getState().setActiveQueueItemId(null);
  }, []);

  return { queueIsPlaying, activeItemIndex, playQueue, pauseQueue, stopQueue };
}
