import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useQuranStore } from "../store/quranStore";
import { loadAudioData } from "../services/quranApi";
import { computePlaybackRegions, type PlaybackRegion } from "../utils/audioRegions";
import type { AudioDataMap } from "../types/quran";
import type { ReviewQueueItem } from "../store/quranStore";
import { clampRepeat } from "../utils/repeatOptions";
import {
  getAllAyahWordIds,
  getAllLineWordIds,
  computeCurrentWordIndex,
} from "../utils/playbackHighlight";

export interface QueuePlaybackState {
  queueIsPlaying: boolean;
  activeItemIndex: number | null;
  queueProgress: number;
  queueTotalDurationSec: number;
  queueCurrentRegions: PlaybackRegion[];
  queueActiveLabel: string | null;
  playQueue: (startIndex?: number) => void;
  pauseQueue: () => void;
  stopQueue: () => void;
  seekQueueTo: (fraction: number) => void;
}

interface PauseState {
  regionIndex: number;
  offsetInRegion: number;
  elapsedBefore: number;
}

export function useQueuePlayback(): QueuePlaybackState {
  const reviewQueue = useQuranStore((s) => s.reviewQueue);
  const queueLoopCount = useQuranStore((s) => s.queueLoopCount);
  const svgToJsonWordMap = useQuranStore((s) => s.svgToJsonWordMap);
  const playbackRate = useQuranStore((s) => s.playbackRate);
  const playbackHighlightMode = useQuranStore((s) => s.playbackHighlightMode);
  const playbackHighlightEnabled = useQuranStore((s) => s.playbackHighlightEnabled);

  const playbackRateRef = useRef(playbackRate);
  playbackRateRef.current = playbackRate;

  const playbackHighlightModeRef = useRef(playbackHighlightMode);
  playbackHighlightModeRef.current = playbackHighlightMode;

  const playbackHighlightEnabledRef = useRef(playbackHighlightEnabled);
  playbackHighlightEnabledRef.current = playbackHighlightEnabled;

  const prevActiveIdsRef = useRef<string[]>([]);
  const prevCurrentWordIdRef = useRef<string | null>(null);

  const [queueIsPlaying, setQueueIsPlaying] = useState(false);
  const [activeItemIndex, setActiveItemIndex] = useState<number | null>(null);
  const [queueProgress, setQueueProgress] = useState(0);
  const [queueTotalDurationSec, setQueueTotalDurationSec] = useState(0);
  const [queueCurrentRegions, setQueueCurrentRegions] = useState<PlaybackRegion[]>([]);

  // ------------------------------------------------------------------
  // All mutable engine state in refs so closures never go stale.
  // ------------------------------------------------------------------
  const reviewQueueRef = useRef<ReviewQueueItem[]>(reviewQueue);
  reviewQueueRef.current = reviewQueue;

  const queueLoopCountRef = useRef(queueLoopCount);
  queueLoopCountRef.current = queueLoopCount;

  const audioDataRef = useRef<AudioDataMap | null>(null);
  const svgToJsonWordMapRef = useRef(svgToJsonWordMap);
  svgToJsonWordMapRef.current = svgToJsonWordMap;
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // rafRef kept for legacy cancel sites but no longer used for timing
  const rafRef = useRef<number | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timeupdateListenerRef = useRef<(() => void) | null>(null);
  const regionEndedRef = useRef(false);
  const isPlayingRef = useRef(false);

  // Playback cursor
  const itemIndexRef = useRef(0);
  const repeatNumRef = useRef(0);
  const regionIndexRef = useRef(0);
  const currentRegionsRef = useRef<PlaybackRegion[]>([]);
  const elapsedBeforeRef = useRef(0);
  const queueTotalDurationSecRef = useRef(0);

  // Queue-level loop tracking (how many full passes done so far)
  const queueLoopNumRef = useRef(0);

  // Pause resume state (null when not paused)
  const pauseStateRef = useRef<PauseState | null>(null);

  // React setter refs (stable across renders, safe to call inside engine closures)
  const setQueueIsPlayingRef = useRef(setQueueIsPlaying);
  setQueueIsPlayingRef.current = setQueueIsPlaying;
  const setActiveItemIndexRef = useRef(setActiveItemIndex);
  setActiveItemIndexRef.current = setActiveItemIndex;
  const setQueueProgressRef = useRef(setQueueProgress);
  setQueueProgressRef.current = setQueueProgress;
  const setQueueTotalDurationSecRef = useRef(setQueueTotalDurationSec);
  setQueueTotalDurationSecRef.current = setQueueTotalDurationSec;
  const setQueueCurrentRegionsRef = useRef(setQueueCurrentRegions);
  setQueueCurrentRegionsRef.current = setQueueCurrentRegions;

  // Mutual-recursion refs (set in useEffect below)
  const playRegionRef = useRef<((ri: number, gapless?: boolean, seekOffsetSec?: number) => void) | null>(null);
  const advanceToCursorRef = useRef<((itemIndex: number, repeatNum: number) => void) | null>(null);

  // Seek ref exposed to public API (set after engine useEffect)
  const seekQueueToRef = useRef<((fraction: number) => void) | null>(null);

  // ------------------------------------------------------------------
  // Load audio data once
  // ------------------------------------------------------------------
  useEffect(() => {
    loadAudioData()
      .then((data) => { audioDataRef.current = data; })
      .catch(() => {});
  }, []);

  // ------------------------------------------------------------------
  // Clear highlights immediately when word highlighting is disabled mid-playback.
  // Without this, stale highlights linger until the next timeupdate tick (or
  // forever, if currently paused). Mirrors useSelectionAudio's behavior.
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!playbackHighlightEnabled) {
      prevActiveIdsRef.current = [];
      prevCurrentWordIdRef.current = null;
      useQuranStore.getState().setPlaybackActiveIds([]);
      useQuranStore.getState().setPlaybackCurrentWordId(null);
    }
  }, [playbackHighlightEnabled]);

  // Invalidate cached IDs when mode changes so the very next tick always
  // pushes a fresh update, even if the new mode produces the same word list
  // as the old one. Mirrors useSelectionAudio.
  useEffect(() => {
    prevActiveIdsRef.current = [];
    prevCurrentWordIdRef.current = null;
  }, [playbackHighlightMode]);

  // ------------------------------------------------------------------
  // Stop on queue cleared (whether playing or paused at a position)
  // ------------------------------------------------------------------
  useEffect(() => {
    if (reviewQueue.length === 0) {
      // Hard stop — cancel timers, pause audio, reset all state regardless of
      // playing/paused so stale "queue-active" visuals never persist.
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      if (timeupdateListenerRef.current && audioRef.current) {
        audioRef.current.removeEventListener("timeupdate", timeupdateListenerRef.current);
        timeupdateListenerRef.current = null;
      }
      if (audioRef.current) {
        audioRef.current.onended = null;
        audioRef.current.pause();
      }
      pauseStateRef.current = null;
      isPlayingRef.current = false;
      setQueueIsPlayingRef.current(false);
      setActiveItemIndexRef.current(null);
      setQueueProgressRef.current(0);
      setQueueCurrentRegionsRef.current([]);
      setQueueTotalDurationSecRef.current(0);
      useQuranStore.getState().setActiveQueueItemId(null);
      prevActiveIdsRef.current = [];
      prevCurrentWordIdRef.current = null;
      useQuranStore.getState().setPlaybackActiveIds([]);
      useQuranStore.getState().setPlaybackCurrentWordId(null);
    }
  }, [reviewQueue.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // ------------------------------------------------------------------
  // Audio engine — set up once with empty deps; accesses all state via refs
  // ------------------------------------------------------------------
  useEffect(() => {
    function getOrCreateAudio(): HTMLAudioElement {
      if (!audioRef.current) audioRef.current = new Audio();
      audioRef.current.playbackRate = playbackRateRef.current;
      return audioRef.current;
    }

    function cancelTimers() {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      if (timeupdateListenerRef.current && audioRef.current) {
        audioRef.current.removeEventListener("timeupdate", timeupdateListenerRef.current);
        timeupdateListenerRef.current = null;
      }
    }

    function getNextCursor(
      itemIndex: number,
      repeatNum: number
    ): { itemIndex: number; repeatNum: number } | null {
      const queue = reviewQueueRef.current;
      const item = queue[itemIndex];
      if (!item) return null;
      const rc = clampRepeat(item.repeatCount); // guard against stale persisted 4/5
      if (rc === 0 || repeatNum < rc - 1) {
        return { itemIndex, repeatNum: rc === 0 ? 0 : repeatNum + 1 };
      }
      const next = itemIndex + 1;
      if (next >= queue.length) return null; // end of queue — caller handles loop logic
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

    function clearHighlights() {
      prevActiveIdsRef.current = [];
      prevCurrentWordIdRef.current = null;
      useQuranStore.getState().setPlaybackActiveIds([]);
      useQuranStore.getState().setPlaybackCurrentWordId(null);
    }

    function finishIdle() {
      isPlayingRef.current = false;
      setQueueIsPlayingRef.current(false);
      setActiveItemIndexRef.current(null);
      setQueueProgressRef.current(0);
      useQuranStore.getState().setActiveQueueItemId(null);
      clearHighlights();
    }

    function advanceToCursor(itemIndex: number, repeatNum: number) {
      if (!isPlayingRef.current) return;
      const queue = reviewQueueRef.current;

      // End of queue: check for queue-level loop
      if (itemIndex >= queue.length) {
        const lc = queueLoopCountRef.current;
        const loopNum = queueLoopNumRef.current;
        if (lc === 0 || loopNum < lc - 1) {
          queueLoopNumRef.current = loopNum + 1;
          advanceToCursorRef.current?.(0, 0);
        } else {
          finishIdle();
        }
        return;
      }

      itemIndexRef.current = itemIndex;
      repeatNumRef.current = repeatNum;
      updateVisualState(itemIndex);

      const item = queue[itemIndex];
      const aData = audioDataRef.current;
      if (!aData) { isPlayingRef.current = false; setQueueIsPlayingRef.current(false); return; }

      const regions = computePlaybackRegions(item.selectedWordIds, aData, item.brushFineness, svgToJsonWordMapRef.current);

      // Update total duration + regions state for the control bar
      const totalDur = regions.reduce((sum, r) => sum + r.durationMs, 0) / 1000;
      queueTotalDurationSecRef.current = totalDur;
      setQueueTotalDurationSecRef.current(totalDur);
      setQueueCurrentRegionsRef.current(regions);

      if (regions.length === 0) {
        const nc = getNextCursor(itemIndex, repeatNum);
        if (nc) advanceToCursorRef.current?.(nc.itemIndex, nc.repeatNum);
        else advanceToCursorRef.current?.(queue.length, 0); // trigger end-of-queue logic
        return;
      }

      currentRegionsRef.current = regions;
      elapsedBeforeRef.current = 0;
      setQueueProgressRef.current(0);
      playRegionRef.current?.(0, false);
    }

    function playRegion(regionIndex: number, gapless = false, seekOffsetSec?: number) {
      if (!isPlayingRef.current) return;

      const allRegions = currentRegionsRef.current;
      if (regionIndex >= allRegions.length) {
        const nc = getNextCursor(itemIndexRef.current, repeatNumRef.current);
        if (!nc) {
          // Reached the natural end of this item's repeats → trigger end-of-queue logic
          advanceToCursorRef.current?.(reviewQueueRef.current.length, 0);
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
      const totalDur = queueTotalDurationSecRef.current;
      regionIndexRef.current = regionIndex;

      cancelTimers();
      const audio = getOrCreateAudio();
      audio.onended = null;

      // Precompute the static part of gapless eligibility up-front.
      // (audio.ended is checked at fire-time to handle natural track end.)
      let nextRegion: PlaybackRegion | null = null;
      if (regionIndex + 1 < allRegions.length) {
        nextRegion = allRegions[regionIndex + 1];
      } else {
        const nc = getNextCursor(itemIndexRef.current, repeatNumRef.current);
        if (nc) {
          const aData = audioDataRef.current;
          const nextItem = reviewQueueRef.current[nc.itemIndex];
          if (aData && nextItem) {
            const nr = computePlaybackRegions(nextItem.selectedWordIds, aData, nextItem.brushFineness, svgToJsonWordMapRef.current);
            nextRegion = nr[0] ?? null;
          }
        }
      }

      const gaplessStaticOk =
        nextRegion != null &&
        nextRegion.audioUrl === region.audioUrl &&
        nextRegion.surahNumber === region.surahNumber &&
        nextRegion.ayahNumber === region.ayahNumber + 1;

      const endThreshold = gaplessStaticOk ? endSec - 0.01 : endSec - 0.08;

      const startTicking = () => {
        // Reset the double-fire guard for this new region.
        regionEndedRef.current = false;

        const handleRegionEnd = () => {
          if (regionEndedRef.current) return;
          regionEndedRef.current = true;

          // Clean up both mechanisms.
          if (timeupdateListenerRef.current) {
            audio.removeEventListener("timeupdate", timeupdateListenerRef.current);
            timeupdateListenerRef.current = null;
          }
          if (timeoutRef.current !== null) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
          }

          if (!isPlayingRef.current) return;

          elapsedBeforeRef.current = elapsedBefore + regionDurSec;

          const gaplessOk = gaplessStaticOk && !audio.ended;

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
              const nextRegions = computePlaybackRegions(nextItem.selectedWordIds, aData, nextItem.brushFineness, svgToJsonWordMapRef.current);
              const nextTotalDur = nextRegions.reduce((s, r) => s + r.durationMs, 0) / 1000;
              queueTotalDurationSecRef.current = nextTotalDur;
              setQueueTotalDurationSecRef.current(nextTotalDur);
              setQueueCurrentRegionsRef.current(nextRegions);
              currentRegionsRef.current = nextRegions;
              elapsedBeforeRef.current = 0;
              playRegionRef.current?.(0, true);
            }
          } else {
            audio.pause();
            audio.onended = null;
            playRegionRef.current?.(regionIndex + 1, false);
          }
        };

        // Primary mechanism: timeupdate fires ~4× per second even in background tabs.
        const onTimeUpdate = () => {
          if (!isPlayingRef.current) return;
          const ct = audio.currentTime;

          // Update progress for the control bar.
          const regionElapsed = Math.max(0, ct - startSec);
          const prog = totalDur > 0 ? Math.min((elapsedBefore + regionElapsed) / totalDur, 1) : 0;
          setQueueProgressRef.current(prog);

          // Word highlight tracking — mirrors useSelectionAudio's onTimeUpdate logic.
          if (playbackHighlightEnabledRef.current) {
            const mode = playbackHighlightModeRef.current;
            const aData = audioDataRef.current;
            const activeKey = region.ayahKey;
            const audioRelativeMs = region.playFullAyah
              ? regionElapsed * 1000
              : region.startMs + regionElapsed * 1000;

            const item = reviewQueueRef.current[itemIndexRef.current];
            const selectionSet = new Set(item?.selectedWordIds ?? []);

            let newActiveIds: string[] = [];
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
                newActiveIds = getAllLineWordIds(activeKey, currentWordIndex).filter(
                  (id) => selectionSet.has(id)
                );
              } else {
                newActiveIds = getAllAyahWordIds(activeKey).filter(
                  (id) => selectionSet.has(id)
                );
              }
            }

            const prev = prevActiveIdsRef.current;
            const changed =
              newActiveIds.length !== prev.length ||
              newActiveIds.some((id, i) => id !== prev[i]);
            if (changed) {
              prevActiveIdsRef.current = newActiveIds;
              useQuranStore.getState().setPlaybackActiveIds(newActiveIds);
            }

            const [surahStr, ayahStr] = activeKey.split(":");
            const newCurrentWordId =
              currentWordIndex !== null
                ? `${parseInt(surahStr, 10)}:${parseInt(ayahStr, 10)}:${currentWordIndex}`
                : null;
            if (newCurrentWordId !== prevCurrentWordIdRef.current) {
              prevCurrentWordIdRef.current = newCurrentWordId;
              useQuranStore.getState().setPlaybackCurrentWordId(newCurrentWordId);
            }
          }

          if (ct >= endThreshold || audio.ended) {
            handleRegionEnd();
          }
        };

        timeupdateListenerRef.current = onTimeUpdate;
        audio.addEventListener("timeupdate", onTimeUpdate);

        // Fallback mechanism: setTimeout scheduled for the expected cut point.
        // Adds 150 ms buffer to account for timeupdate firing late; the
        // double-fire guard ensures only the first arrival takes effect.
        const remainingMs = (endThreshold - audio.currentTime) / (audio.playbackRate || 1) * 1000;
        timeoutRef.current = setTimeout(handleRegionEnd, Math.max(0, remainingMs + 150));
      };

      const doSeekAndPlay = () => {
        if (!isPlayingRef.current) return;
        const PREROLL_SEC = 0.1;
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

    // ---- Seek within active queue item ----
    function seekQueueTo(fraction: number) {
      const allRegions = currentRegionsRef.current;
      if (allRegions.length === 0) return;
      const totalDur = queueTotalDurationSecRef.current;
      if (totalDur <= 0) return;

      const clamped = Math.max(0, Math.min(1, fraction));
      const targetSec = clamped * totalDur;

      let accumulated = 0;
      let targetRegionIndex = allRegions.length - 1;
      let offsetInRegion = 0;

      for (let i = 0; i < allRegions.length; i++) {
        const regionDurSec = allRegions[i].durationMs / 1000;
        if (accumulated + regionDurSec > targetSec || i === allRegions.length - 1) {
          targetRegionIndex = i;
          offsetInRegion = Math.max(0, targetSec - accumulated);
          break;
        }
        accumulated += regionDurSec;
      }

      cancelTimers();
      if (audioRef.current) audioRef.current.pause();

      elapsedBeforeRef.current = accumulated;
      regionIndexRef.current = targetRegionIndex;
      setQueueProgressRef.current(clamped);

      if (isPlayingRef.current) {
        playRegionRef.current?.(targetRegionIndex, false, offsetInRegion);
      } else {
        // Store as pause state so resume picks up from here
        pauseStateRef.current = {
          regionIndex: targetRegionIndex,
          offsetInRegion,
          elapsedBefore: accumulated,
        };
        // Pre-seek audio element for instant resume
        const audio = getOrCreateAudio();
        const region = allRegions[targetRegionIndex];
        const targetTime = region.startMs / 1000 + offsetInRegion;
        if (audio.src !== region.audioUrl) {
          audio.src = region.audioUrl;
          audio.load();
          audio.addEventListener("canplay", () => { audio.currentTime = targetTime; }, { once: true });
        } else {
          audio.currentTime = targetTime;
        }
      }
    }

    playRegionRef.current = playRegion;
    advanceToCursorRef.current = advanceToCursor;
    seekQueueToRef.current = seekQueueTo;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Apply rate changes to the audio element mid-playback
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  // ------------------------------------------------------------------
  // Cleanup on unmount
  // ------------------------------------------------------------------
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (timeoutRef.current !== null) clearTimeout(timeoutRef.current);
      if (timeupdateListenerRef.current && audioRef.current) {
        audioRef.current.removeEventListener("timeupdate", timeupdateListenerRef.current);
        timeupdateListenerRef.current = null;
      }
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

      if (
        isPaused &&
        pauseStateRef.current &&
        (startIndex === undefined || startIndex === currentItemIndex)
      ) {
        const ps = pauseStateRef.current;
        pauseStateRef.current = null;
        isPlayingRef.current = true;
        setQueueIsPlaying(true);
        elapsedBeforeRef.current = ps.elapsedBefore;
        playRegionRef.current?.(ps.regionIndex, false, ps.offsetInRegion);
      } else {
        pauseStateRef.current = null;
        queueLoopNumRef.current = 0; // reset queue-level loop counter on fresh start
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
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (timeupdateListenerRef.current && audioRef.current) {
      audioRef.current.removeEventListener("timeupdate", timeupdateListenerRef.current);
      timeupdateListenerRef.current = null;
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
    prevActiveIdsRef.current = [];
    prevCurrentWordIdRef.current = null;
    useQuranStore.getState().setPlaybackActiveIds([]);
    useQuranStore.getState().setPlaybackCurrentWordId(null);
  }, []);

  const stopQueue = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (timeupdateListenerRef.current && audioRef.current) {
      audioRef.current.removeEventListener("timeupdate", timeupdateListenerRef.current);
      timeupdateListenerRef.current = null;
    }
    if (audioRef.current) {
      audioRef.current.onended = null;
      audioRef.current.pause();
    }
    pauseStateRef.current = null;
    queueLoopNumRef.current = 0;
    isPlayingRef.current = false;
    setQueueIsPlaying(false);
    setActiveItemIndex(null);
    setQueueProgress(0);
    setQueueCurrentRegions([]);
    setQueueTotalDurationSec(0);
    useQuranStore.getState().setActiveQueueItemId(null);
    prevActiveIdsRef.current = [];
    prevCurrentWordIdRef.current = null;
    useQuranStore.getState().setPlaybackActiveIds([]);
    useQuranStore.getState().setPlaybackCurrentWordId(null);
  }, []);

  const seekQueueTo = useCallback((fraction: number) => {
    seekQueueToRef.current?.(fraction);
  }, []);

  const queueActiveLabel = useMemo(
    () => (activeItemIndex !== null ? (reviewQueue[activeItemIndex]?.label ?? null) : null),
    [activeItemIndex, reviewQueue]
  );

  return {
    queueIsPlaying,
    activeItemIndex,
    queueProgress,
    queueTotalDurationSec,
    queueCurrentRegions,
    queueActiveLabel,
    playQueue,
    pauseQueue,
    stopQueue,
    seekQueueTo,
  };
}
