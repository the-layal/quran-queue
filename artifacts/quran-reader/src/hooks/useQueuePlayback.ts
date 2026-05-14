import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useQuranStore } from "../store/quranStore";
import { loadAudioData } from "../services/quranApi";
import { computePlaybackRegions, type PlaybackRegion } from "../utils/audioRegions";
import type { AudioDataMap } from "../types/quran";
import type { ReviewQueueItem, QueueEntry } from "../store/quranStore";
import { isSubQueue } from "../store/quranStore";
import { clampRepeat } from "../utils/repeatOptions";
import {
  getAllAyahWordIds,
  getAllLineWordIds,
  computeCurrentWordIndex,
} from "../utils/playbackHighlight";

export interface QueuePlaybackState {
  queueIsPlaying: boolean;
  activeItemIndex: number | null;
  activeSubItemIndex: number | null;
  queueProgress: number;
  queueTotalDurationSec: number;
  queueCurrentRegions: PlaybackRegion[];
  queueActiveLabel: string | null;
  hasPrev: boolean;
  hasNext: boolean;
  playQueue: (startGroupIndex?: number, startSubItemIndex?: number) => void;
  pauseQueue: () => void;
  stopQueue: () => void;
  seekQueueTo: (fraction: number) => void;
  skipToPrev: () => void;
  skipToNext: () => void;
}

interface PauseState {
  regionIndex: number;
  offsetInRegion: number;
  elapsedBefore: number;
}

// Three-part cursor tracking position within the mixed queue
interface Cursor {
  groupIndex: number;    // index into reviewQueue (top-level)
  subItemIndex: number;  // index within SubQueue.items (0 for flat items)
  itemRepeat: number;    // current item-level repeat (0-based)
  groupRepeat: number;   // current group-level repeat (0 for flat items)
}

export function useQueuePlayback(): QueuePlaybackState {
  const reviewQueue = useQuranStore((s) => s.reviewQueue);
  const activeQueueItemId = useQuranStore((s) => s.activeQueueItemId);
  const queueLoopCount = useQuranStore((s) => s.queueLoopCount);
  const svgToJsonWordMap = useQuranStore((s) => s.svgToJsonWordMap);
  const playbackRate = useQuranStore((s) => s.playbackRate);
  const playbackHighlightMode = useQuranStore((s) => s.playbackHighlightMode);
  const playbackHighlightEnabled = useQuranStore((s) => s.playbackHighlightEnabled);
  const selectedReciterId = useQuranStore((s) => s.selectedReciterId);

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
  const [activeSubItemIndex, setActiveSubItemIndex] = useState<number | null>(null);
  const [queueProgress, setQueueProgress] = useState(0);
  const [queueTotalDurationSec, setQueueTotalDurationSec] = useState(0);
  const [queueCurrentRegions, setQueueCurrentRegions] = useState<PlaybackRegion[]>([]);

  // ------------------------------------------------------------------
  // All mutable engine state in refs so closures never go stale.
  // ------------------------------------------------------------------
  const reviewQueueRef = useRef<QueueEntry[]>(reviewQueue);
  reviewQueueRef.current = reviewQueue;

  const queueLoopCountRef = useRef(queueLoopCount);
  queueLoopCountRef.current = queueLoopCount;

  const audioDataRef = useRef<AudioDataMap | null>(null);
  const svgToJsonWordMapRef = useRef(svgToJsonWordMap);
  svgToJsonWordMapRef.current = svgToJsonWordMap;
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timeupdateListenerRef = useRef<(() => void) | null>(null);
  const canplayAbortRef = useRef<AbortController | null>(null);
  const regionEndedRef = useRef(false);
  const isPlayingRef = useRef(false);

  // Three-part playback cursor
  const groupIndexRef = useRef(0);
  const subItemIndexRef = useRef(0);
  const itemRepeatRef = useRef(0);
  const groupRepeatRef = useRef(0);

  const regionIndexRef = useRef(0);
  const currentRegionsRef = useRef<PlaybackRegion[]>([]);
  const elapsedBeforeRef = useRef(0);
  const queueTotalDurationSecRef = useRef(0);

  // Queue-level loop tracking
  const queueLoopNumRef = useRef(0);

  // Pause resume state
  const pauseStateRef = useRef<PauseState | null>(null);

  // React setter refs
  const setQueueIsPlayingRef = useRef(setQueueIsPlaying);
  setQueueIsPlayingRef.current = setQueueIsPlaying;
  const setActiveItemIndexRef = useRef(setActiveItemIndex);
  setActiveItemIndexRef.current = setActiveItemIndex;
  const setActiveSubItemIndexRef = useRef(setActiveSubItemIndex);
  setActiveSubItemIndexRef.current = setActiveSubItemIndex;
  const setQueueProgressRef = useRef(setQueueProgress);
  setQueueProgressRef.current = setQueueProgress;
  const setQueueTotalDurationSecRef = useRef(setQueueTotalDurationSec);
  setQueueTotalDurationSecRef.current = setQueueTotalDurationSec;
  const setQueueCurrentRegionsRef = useRef(setQueueCurrentRegions);
  setQueueCurrentRegionsRef.current = setQueueCurrentRegions;

  // Mutual-recursion refs
  const playRegionRef = useRef<((ri: number, gapless?: boolean, seekOffsetSec?: number) => void) | null>(null);
  const advanceToCursorRef = useRef<((cursor: Cursor) => void) | null>(null);

  // Seek ref
  const seekQueueToRef = useRef<((fraction: number) => void) | null>(null);

  // ------------------------------------------------------------------
  // Load (or reload) audio data when reciter changes — hard-stop queue.
  // ------------------------------------------------------------------
  useEffect(() => {
    if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (timeoutRef.current !== null) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
    if (timeupdateListenerRef.current && audioRef.current) {
      audioRef.current.removeEventListener("timeupdate", timeupdateListenerRef.current);
      timeupdateListenerRef.current = null;
    }
    if (canplayAbortRef.current) { canplayAbortRef.current.abort(); canplayAbortRef.current = null; }
    if (audioRef.current) {
      audioRef.current.onended = null;
      audioRef.current.pause();
      audioRef.current.removeAttribute("src");
    }
    pauseStateRef.current = null;
    isPlayingRef.current = false;
    setQueueIsPlayingRef.current(false);
    setActiveItemIndexRef.current(null);
    setActiveSubItemIndexRef.current(null);
    setQueueProgressRef.current(0);
    setQueueCurrentRegionsRef.current([]);
    setQueueTotalDurationSecRef.current(0);
    useQuranStore.getState().setActiveQueueItemId(null);
    prevActiveIdsRef.current = [];
    prevCurrentWordIdRef.current = null;
    useQuranStore.getState().setPlaybackActiveIds([]);
    useQuranStore.getState().setPlaybackCurrentWordId(null);
    audioDataRef.current = null;

    let cancelled = false;
    loadAudioData(selectedReciterId)
      .then((data) => { if (!cancelled) audioDataRef.current = data; })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [selectedReciterId]);

  // ------------------------------------------------------------------
  // Clear highlights when word highlighting is disabled mid-playback.
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!playbackHighlightEnabled) {
      prevActiveIdsRef.current = [];
      prevCurrentWordIdRef.current = null;
      useQuranStore.getState().setPlaybackActiveIds([]);
      useQuranStore.getState().setPlaybackCurrentWordId(null);
    }
  }, [playbackHighlightEnabled]);

  useEffect(() => {
    prevActiveIdsRef.current = [];
    prevCurrentWordIdRef.current = null;
  }, [playbackHighlightMode]);

  // ------------------------------------------------------------------
  // Stop on queue cleared
  // ------------------------------------------------------------------
  useEffect(() => {
    if (reviewQueue.length === 0) {
      if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
      if (timeoutRef.current !== null) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
      if (timeupdateListenerRef.current && audioRef.current) {
        audioRef.current.removeEventListener("timeupdate", timeupdateListenerRef.current);
        timeupdateListenerRef.current = null;
      }
      if (audioRef.current) { audioRef.current.onended = null; audioRef.current.pause(); }
      pauseStateRef.current = null;
      isPlayingRef.current = false;
      setQueueIsPlayingRef.current(false);
      setActiveItemIndexRef.current(null);
      setActiveSubItemIndexRef.current(null);
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
  // Audio engine — set up once; accesses all state via refs
  // ------------------------------------------------------------------
  useEffect(() => {
    function getOrCreateAudio(): HTMLAudioElement {
      if (!audioRef.current) audioRef.current = new Audio();
      audioRef.current.playbackRate = playbackRateRef.current;
      return audioRef.current;
    }

    function cancelTimers() {
      if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
      if (timeoutRef.current !== null) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
      if (timeupdateListenerRef.current && audioRef.current) {
        audioRef.current.removeEventListener("timeupdate", timeupdateListenerRef.current);
        timeupdateListenerRef.current = null;
      }
      if (canplayAbortRef.current) { canplayAbortRef.current.abort(); canplayAbortRef.current = null; }
    }

    // Look up the ReviewQueueItem at a given cursor position.
    function getItemAtCursor(groupIndex: number, subItemIndex: number): ReviewQueueItem | null {
      const queue = reviewQueueRef.current;
      const group = queue[groupIndex];
      if (!group) return null;
      if (isSubQueue(group)) return group.items[subItemIndex] ?? null;
      return group as ReviewQueueItem;
    }

    // Compute the next cursor position given the current one.
    // Returns null when the entire top-level queue is exhausted.
    function getNextCursor(cursor: Cursor): Cursor | null {
      const { groupIndex, subItemIndex, itemRepeat, groupRepeat } = cursor;
      const queue = reviewQueueRef.current;
      const group = queue[groupIndex];
      if (!group) return null;

      const item = getItemAtCursor(groupIndex, subItemIndex);
      if (!item) return null;

      const rc = clampRepeat(item.repeatCount);
      // Can we do another item-level repeat?
      if (rc === 0 || itemRepeat < rc - 1) {
        return { groupIndex, subItemIndex, itemRepeat: rc === 0 ? 0 : itemRepeat + 1, groupRepeat };
      }

      // Item repeats exhausted — next item within SubQueue?
      if (isSubQueue(group)) {
        const nextSub = subItemIndex + 1;
        if (nextSub < group.items.length) {
          return { groupIndex, subItemIndex: nextSub, itemRepeat: 0, groupRepeat };
        }
        // End of SubQueue items — another group repeat?
        const grc = clampRepeat(group.repeatCount);
        if (grc === 0 || groupRepeat < grc - 1) {
          return { groupIndex, subItemIndex: 0, itemRepeat: 0, groupRepeat: grc === 0 ? 0 : groupRepeat + 1 };
        }
      }

      // Advance to next top-level group
      const nextGroup = groupIndex + 1;
      if (nextGroup >= queue.length) return null;
      return { groupIndex: nextGroup, subItemIndex: 0, itemRepeat: 0, groupRepeat: 0 };
    }

    function updateVisualState(groupIndex: number, subItemIndex: number, item: ReviewQueueItem) {
      setActiveItemIndexRef.current(groupIndex);
      setActiveSubItemIndexRef.current(subItemIndex);
      useQuranStore.getState().setActiveQueueItemId(item.id);
      useQuranStore.getState().setSelectedWordIds(item.selectedWordIds);
      useQuranStore.getState().setBrushFineness(item.brushFineness);
      useQuranStore.getState().clearLockedContext();
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
      setActiveSubItemIndexRef.current(null);
      setQueueProgressRef.current(0);
      useQuranStore.getState().setActiveQueueItemId(null);
      clearHighlights();
    }

    function advanceToCursor(cursor: Cursor) {
      if (!isPlayingRef.current) return;
      const queue = reviewQueueRef.current;

      // End of queue: check for queue-level loop
      if (cursor.groupIndex >= queue.length) {
        const lc = queueLoopCountRef.current;
        const loopNum = queueLoopNumRef.current;
        if (lc === 0 || loopNum < lc - 1) {
          queueLoopNumRef.current = loopNum + 1;
          advanceToCursorRef.current?.({ groupIndex: 0, subItemIndex: 0, itemRepeat: 0, groupRepeat: 0 });
        } else {
          finishIdle();
        }
        return;
      }

      // Skip SubQueues with no items
      const group = queue[cursor.groupIndex];
      if (isSubQueue(group) && group.items.length === 0) {
        advanceToCursorRef.current?.({ groupIndex: cursor.groupIndex + 1, subItemIndex: 0, itemRepeat: 0, groupRepeat: 0 });
        return;
      }

      groupIndexRef.current = cursor.groupIndex;
      subItemIndexRef.current = cursor.subItemIndex;
      itemRepeatRef.current = cursor.itemRepeat;
      groupRepeatRef.current = cursor.groupRepeat;

      const item = getItemAtCursor(cursor.groupIndex, cursor.subItemIndex);
      if (!item) {
        advanceToCursorRef.current?.({ groupIndex: cursor.groupIndex + 1, subItemIndex: 0, itemRepeat: 0, groupRepeat: 0 });
        return;
      }

      updateVisualState(cursor.groupIndex, cursor.subItemIndex, item);

      const aData = audioDataRef.current;
      if (!aData) { isPlayingRef.current = false; setQueueIsPlayingRef.current(false); return; }

      const regions = computePlaybackRegions(item.selectedWordIds, aData, item.brushFineness, svgToJsonWordMapRef.current);

      const totalDur = regions.reduce((sum, r) => sum + r.durationMs, 0) / 1000;
      queueTotalDurationSecRef.current = totalDur;
      setQueueTotalDurationSecRef.current(totalDur);
      setQueueCurrentRegionsRef.current(regions);

      if (regions.length === 0) {
        const nc = getNextCursor({ groupIndex: cursor.groupIndex, subItemIndex: cursor.subItemIndex, itemRepeat: cursor.itemRepeat, groupRepeat: cursor.groupRepeat });
        if (nc) advanceToCursorRef.current?.(nc);
        else advanceToCursorRef.current?.({ groupIndex: queue.length, subItemIndex: 0, itemRepeat: 0, groupRepeat: 0 });
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
        const nc = getNextCursor({
          groupIndex: groupIndexRef.current,
          subItemIndex: subItemIndexRef.current,
          itemRepeat: itemRepeatRef.current,
          groupRepeat: groupRepeatRef.current,
        });
        if (!nc) {
          advanceToCursorRef.current?.({ groupIndex: reviewQueueRef.current.length, subItemIndex: 0, itemRepeat: 0, groupRepeat: 0 });
          return;
        }
        advanceToCursorRef.current?.(nc);
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

      // Gapless eligibility check
      let nextRegion: PlaybackRegion | null = null;
      if (regionIndex + 1 < allRegions.length) {
        nextRegion = allRegions[regionIndex + 1];
      } else {
        const nc = getNextCursor({
          groupIndex: groupIndexRef.current,
          subItemIndex: subItemIndexRef.current,
          itemRepeat: itemRepeatRef.current,
          groupRepeat: groupRepeatRef.current,
        });
        if (nc) {
          const aData = audioDataRef.current;
          const nextItem = getItemAtCursor(nc.groupIndex, nc.subItemIndex);
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
        regionEndedRef.current = false;

        const handleRegionEnd = () => {
          if (regionEndedRef.current) return;
          regionEndedRef.current = true;

          if (timeupdateListenerRef.current) {
            audio.removeEventListener("timeupdate", timeupdateListenerRef.current);
            timeupdateListenerRef.current = null;
          }
          if (timeoutRef.current !== null) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }

          if (!isPlayingRef.current) return;

          elapsedBeforeRef.current = elapsedBefore + regionDurSec;

          const gaplessOk = gaplessStaticOk && !audio.ended;

          if (gaplessOk) {
            if (regionIndex + 1 < allRegions.length) {
              playRegionRef.current?.(regionIndex + 1, true);
            } else {
              const nc = getNextCursor({
                groupIndex: groupIndexRef.current,
                subItemIndex: subItemIndexRef.current,
                itemRepeat: itemRepeatRef.current,
                groupRepeat: groupRepeatRef.current,
              })!;
              groupIndexRef.current = nc.groupIndex;
              subItemIndexRef.current = nc.subItemIndex;
              itemRepeatRef.current = nc.itemRepeat;
              groupRepeatRef.current = nc.groupRepeat;
              const nextItem = getItemAtCursor(nc.groupIndex, nc.subItemIndex);
              if (nextItem) updateVisualState(nc.groupIndex, nc.subItemIndex, nextItem);
              const aData = audioDataRef.current!;
              const nextItemSafe = nextItem!;
              const nextRegions = computePlaybackRegions(nextItemSafe.selectedWordIds, aData, nextItemSafe.brushFineness, svgToJsonWordMapRef.current);
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

        const onTimeUpdate = () => {
          if (!isPlayingRef.current) return;
          const ct = audio.currentTime;

          const regionElapsed = Math.max(0, ct - startSec);
          const prog = totalDur > 0 ? Math.min((elapsedBefore + regionElapsed) / totalDur, 1) : 0;
          setQueueProgressRef.current(prog);

          if (playbackHighlightEnabledRef.current) {
            const mode = playbackHighlightModeRef.current;
            const aData = audioDataRef.current;
            const activeKey = region.ayahKey;
            const audioRelativeMs = region.playFullAyah
              ? regionElapsed * 1000
              : region.startMs + regionElapsed * 1000;

            const item = getItemAtCursor(groupIndexRef.current, subItemIndexRef.current);
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
            audio.removeEventListener("timeupdate", onTimeUpdate);
            timeupdateListenerRef.current = null;
            if (timeoutRef.current !== null) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
            timeoutRef.current = setTimeout(handleRegionEnd, 0);
          }
        };

        timeupdateListenerRef.current = onTimeUpdate;
        audio.addEventListener("timeupdate", onTimeUpdate);

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
        canplayAbortRef.current?.abort();
        canplayAbortRef.current = new AbortController();
        audio.addEventListener("canplay", doSeekAndPlay, {
          once: true,
          signal: canplayAbortRef.current.signal,
        });
      } else if (gapless) {
        startTicking();
      } else {
        doSeekAndPlay();
      }
    }

    // Seek within the active queue item
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
        pauseStateRef.current = {
          regionIndex: targetRegionIndex,
          offsetInRegion,
          elapsedBefore: accumulated,
        };
        const audio = getOrCreateAudio();
        const region = allRegions[targetRegionIndex];
        const targetTime = region.startMs / 1000 + offsetInRegion;
        if (audio.src !== region.audioUrl) {
          audio.src = region.audioUrl;
          audio.load();
          canplayAbortRef.current?.abort();
          canplayAbortRef.current = new AbortController();
          audio.addEventListener(
            "canplay",
            () => { audio.currentTime = targetTime; },
            { once: true, signal: canplayAbortRef.current.signal }
          );
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
    if (audioRef.current) audioRef.current.playbackRate = playbackRate;
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
    (startGroupIndex?: number, startSubItemIndex?: number) => {
      const currentGroupIndex = activeItemIndex;
      const currentSubItem = activeSubItemIndex ?? 0;
      const isPaused = !isPlayingRef.current && currentGroupIndex !== null;

      if (
        isPaused &&
        pauseStateRef.current &&
        (startGroupIndex === undefined || startGroupIndex === currentGroupIndex) &&
        (startSubItemIndex === undefined || startSubItemIndex === currentSubItem)
      ) {
        const ps = pauseStateRef.current;
        pauseStateRef.current = null;
        isPlayingRef.current = true;
        setQueueIsPlaying(true);
        elapsedBeforeRef.current = ps.elapsedBefore;
        playRegionRef.current?.(ps.regionIndex, false, ps.offsetInRegion);
      } else {
        pauseStateRef.current = null;
        queueLoopNumRef.current = 0;
        isPlayingRef.current = true;
        setQueueIsPlaying(true);
        advanceToCursorRef.current?.({
          groupIndex: startGroupIndex ?? 0,
          subItemIndex: startSubItemIndex ?? 0,
          itemRepeat: 0,
          groupRepeat: 0,
        });
      }
    },
    [activeItemIndex, activeSubItemIndex]
  );

  const pauseQueue = useCallback(() => {
    if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (timeoutRef.current !== null) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
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
    if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (timeoutRef.current !== null) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
    if (timeupdateListenerRef.current && audioRef.current) {
      audioRef.current.removeEventListener("timeupdate", timeupdateListenerRef.current);
      timeupdateListenerRef.current = null;
    }
    if (audioRef.current) { audioRef.current.onended = null; audioRef.current.pause(); }
    pauseStateRef.current = null;
    queueLoopNumRef.current = 0;
    isPlayingRef.current = false;
    setQueueIsPlaying(false);
    setActiveItemIndex(null);
    setActiveSubItemIndex(null);
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

  // Find the top-level group index containing the currently-active item.
  const effectiveGroupIndex = useMemo(() => {
    if (activeQueueItemId === null) return -1;
    for (let i = 0; i < reviewQueue.length; i++) {
      const entry = reviewQueue[i];
      if (isSubQueue(entry)) {
        if (entry.items.some((item) => item.id === activeQueueItemId)) return i;
      } else {
        if (entry.id === activeQueueItemId) return i;
      }
    }
    return -1;
  }, [activeQueueItemId, reviewQueue]);

  const skipToPrev = useCallback(() => {
    if (effectiveGroupIndex <= 0) return;
    playQueue(effectiveGroupIndex - 1, 0);
  }, [effectiveGroupIndex, playQueue]);

  const skipToNext = useCallback(() => {
    if (effectiveGroupIndex < 0 || effectiveGroupIndex >= reviewQueue.length - 1) return;
    playQueue(effectiveGroupIndex + 1, 0);
  }, [effectiveGroupIndex, reviewQueue.length, playQueue]);

  const hasPrev = effectiveGroupIndex > 0;
  const hasNext = effectiveGroupIndex >= 0 && effectiveGroupIndex < reviewQueue.length - 1;

  const queueActiveLabel = useMemo(() => {
    if (activeItemIndex === null) return null;
    const entry = reviewQueue[activeItemIndex];
    if (!entry) return null;
    if (isSubQueue(entry)) {
      const sub = activeSubItemIndex !== null ? entry.items[activeSubItemIndex] : null;
      return sub?.label ?? entry.label;
    }
    return (entry as ReviewQueueItem).label;
  }, [activeItemIndex, activeSubItemIndex, reviewQueue]);

  return {
    queueIsPlaying,
    activeItemIndex,
    activeSubItemIndex,
    queueProgress,
    queueTotalDurationSec,
    queueCurrentRegions,
    queueActiveLabel,
    hasPrev,
    hasNext,
    playQueue,
    pauseQueue,
    stopQueue,
    seekQueueTo,
    skipToPrev,
    skipToNext,
  };
}
