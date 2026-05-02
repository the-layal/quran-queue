import { useState, useEffect, useRef, useCallback } from "react";
import { useQuranStore } from "../store/quranStore";
import { loadAudioData } from "../services/quranApi";
import { computePlaybackRegions, type PlaybackRegion } from "../utils/audioRegions";
import type { AudioDataMap } from "../types/quran";
import { clampRepeat } from "../utils/repeatOptions";
import {
  getAllAyahWordIds,
  getAllLineWordIds,
  computeCurrentWordIndex,
} from "../utils/playbackHighlight";

export interface SelectionAudioState {
  isPlaying: boolean;
  progress: number;
  currentAyahKey: string | null;
  hasSelection: boolean;
  hasAudio: boolean;
  isAudioLoading: boolean;
  regions: PlaybackRegion[];
  play: () => void;
  pause: () => void;
  seekTo: (fraction: number) => void;
}

export function useSelectionAudio(): SelectionAudioState {
  const selectedWordIds = useQuranStore((s) => s.selectedWordIds);
  const brushFineness = useQuranStore((s) => s.brushFineness);
  const playbackHighlightMode = useQuranStore((s) => s.playbackHighlightMode);
  const playbackHighlightEnabled = useQuranStore((s) => s.playbackHighlightEnabled);
  const setPlaybackActiveIds = useQuranStore((s) => s.setPlaybackActiveIds);
  const setPlaybackCurrentWordId = useQuranStore((s) => s.setPlaybackCurrentWordId);
  const queueRepeatAll = useQuranStore((s) => s.queueRepeatAll);
  const selectedReciterId = useQuranStore((s) => s.selectedReciterId);
  const svgToJsonWordMap = useQuranStore((s) => s.svgToJsonWordMap);
  const svgToJsonWordMapRef = useRef(svgToJsonWordMap);
  svgToJsonWordMapRef.current = svgToJsonWordMap;

  const playbackRate = useQuranStore((s) => s.playbackRate);
  const playbackRateRef = useRef(playbackRate);
  playbackRateRef.current = playbackRate;

  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentAyahKey, setCurrentAyahKey] = useState<string | null>(null);
  const [audioData, setAudioData] = useState<AudioDataMap | null>(null);
  const [regions, setRegions] = useState<PlaybackRegion[]>([]);
  // True while the selected reciter's audio data is being fetched. Used by
  // AudioControlBar to render a loading spinner on the play button instead
  // of momentarily flashing the "No audio for selection" empty state.
  const [isAudioLoading, setIsAudioLoading] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  // rafRef kept for legacy cancel sites but no longer used for timing
  const rafRef = useRef<number | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timeupdateListenerRef = useRef<(() => void) | null>(null);
  // AbortController for any pending "canplay" listener attached after a
  // src change. stopPlayback() aborts it so a delayed canplay from an old
  // region (or old reciter) cannot resume playback after stop.
  const canplayAbortRef = useRef<AbortController | null>(null);
  const regionEndedRef = useRef(false);
  const queueRepeatAllRef = useRef(queueRepeatAll);
  queueRepeatAllRef.current = queueRepeatAll;
  const repeatsDoneRef = useRef(0);
  const isPlayingRef = useRef(false);
  const regionsRef = useRef<PlaybackRegion[]>([]);
  const regionIndexRef = useRef(0);
  const totalDurSecRef = useRef(0);
  const elapsedBeforeSecRef = useRef(0);
  const pendingSeekRef = useRef<{
    regionIndex: number;
    offsetInRegion: number;
    elapsedBefore: number;
  } | null>(null);
  const prevActiveIdsRef = useRef<string[]>([]);
  const prevCurrentWordIdRef = useRef<string | null>(null);

  const playbackHighlightModeRef = useRef(playbackHighlightMode);
  playbackHighlightModeRef.current = playbackHighlightMode;

  const playbackHighlightEnabledRef = useRef(playbackHighlightEnabled);
  playbackHighlightEnabledRef.current = playbackHighlightEnabled;

  const audioDataRef = useRef(audioData);
  audioDataRef.current = audioData;

  const selectedWordIdsRef = useRef<string[]>(selectedWordIds);
  selectedWordIdsRef.current = selectedWordIds;

  isPlayingRef.current = isPlaying;
  regionsRef.current = regions;

  // When the highlight mode changes, invalidate the cached IDs so the very next
  // timeupdate tick always pushes a fresh update — even if the new mode happens to
  // produce the same word list as the old mode (e.g. a single-line short ayah).
  useEffect(() => {
    prevActiveIdsRef.current = [];
    prevCurrentWordIdRef.current = null;
  }, [playbackHighlightMode]);

  // When word highlighting is disabled, clear both highlights immediately.
  useEffect(() => {
    if (!playbackHighlightEnabled) {
      prevCurrentWordIdRef.current = null;
      prevActiveIdsRef.current = [];
      setPlaybackActiveIds([]);
      setPlaybackCurrentWordId(null);
    }
  }, [playbackHighlightEnabled, setPlaybackActiveIds, setPlaybackCurrentWordId]);

  // Load (or reload) audio data whenever the selected reciter changes.
  // Stop any in-flight playback first so the user never hears the old reciter
  // bleed into the new one. Flips isAudioLoading on/off so the control bar
  // can show a spinner on the play button rather than the "No audio" empty
  // state during the manifest fetch.
  useEffect(() => {
    stopPlayback();
    setAudioData(null);
    setRegions([]);
    setProgress(0);
    setCurrentAyahKey(null);
    setIsAudioLoading(true);

    let cancelled = false;
    loadAudioData(selectedReciterId)
      .then((data) => {
        if (cancelled) return;
        setAudioData(data);
        setIsAudioLoading(false);
      })
      .catch(() => {
        // On rapid switches, only the most recent run clears the flag — the
        // newer effect run will have already set isAudioLoading back to true,
        // and its own resolution/rejection will be the one to clear it.
        if (cancelled) return;
        setIsAudioLoading(false);
      });
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedReciterId]);

  useEffect(() => {
    if (!audioData) return;
    const newRegions = computePlaybackRegions(
      selectedWordIds,
      audioData,
      brushFineness,
      svgToJsonWordMapRef.current
    );
    // Initialise totalDurSecRef eagerly so seekTo() works before the first play().
    totalDurSecRef.current =
      newRegions.reduce((sum, r) => sum + r.durationMs, 0) / 1000;
    setRegions(newRegions);
    stopPlayback();
    setProgress(0);
    setCurrentAyahKey(null);
  }, [selectedWordIds, audioData, brushFineness, svgToJsonWordMap]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  function getOrCreateAudio(): HTMLAudioElement {
    if (!audioRef.current) {
      audioRef.current = new Audio();
    }
    audioRef.current.playbackRate = playbackRateRef.current;
    return audioRef.current;
  }

  function clearActiveHighlight() {
    prevActiveIdsRef.current = [];
    prevCurrentWordIdRef.current = null;
    setPlaybackActiveIds([]);
    setPlaybackCurrentWordId(null);
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
    if (canplayAbortRef.current) {
      canplayAbortRef.current.abort();
      canplayAbortRef.current = null;
    }
  }

  function stopPlayback() {
    cancelTimers();
    pendingSeekRef.current = null;
    if (audioRef.current) {
      audioRef.current.onended = null;
      audioRef.current.pause();
    }
    regionIndexRef.current = 0;
    elapsedBeforeSecRef.current = 0;
    setIsPlaying(false);
    clearActiveHighlight();
  }

  const playRegion = useCallback((regionIndex: number, gapless = false, seekOffsetSec?: number) => {
    const allRegions = regionsRef.current;

    if (regionIndex >= allRegions.length) {
      const rc = clampRepeat(queueRepeatAllRef.current); // 1=once, 2=2×, 3=3×, 0=∞
      const done = repeatsDoneRef.current + 1;
      if (rc === 0 || done < rc) {
        repeatsDoneRef.current = done;
        elapsedBeforeSecRef.current = 0;
        playRegion(0);
      } else {
        repeatsDoneRef.current = 0;
        cancelTimers();
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
    cancelTimers();

    const audio = getOrCreateAudio();
    audio.onended = null;

    // Precompute static gapless eligibility.
    const nextIndex = regionIndex + 1;
    const nextRegion = allRegions[nextIndex] ?? null;
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

        elapsedBeforeSecRef.current = elapsedBefore + regionDurSec;

        const gaplessOk = gaplessStaticOk && !audio.ended;

        if (gaplessOk) {
          // Same adjacent surah region: audio keeps playing uninterrupted.
          playRegion(nextIndex, true);
        } else {
          audio.pause();
          audio.onended = null;
          playRegion(nextIndex, false);
        }
      };

      // Primary mechanism: timeupdate fires ~4× per second even in background tabs.
      const onTimeUpdate = () => {
        const ct = audio.currentTime;
        const regionElapsed = Math.max(0, ct - startSec);
        const prog =
          totalDur > 0
            ? Math.min((elapsedBefore + regionElapsed) / totalDur, 1)
            : 0;
        setProgress(prog);

        // Highlight tracking: compute which words are active and push to store
        const highlightEnabled = playbackHighlightEnabledRef.current;
        const mode = playbackHighlightModeRef.current;
        const aData = audioDataRef.current;
        const activeKey = region.ayahKey;
        const audioRelativeMs = region.playFullAyah
          ? regionElapsed * 1000
          : region.startMs + regionElapsed * 1000;

        let newActiveIds: string[] = [];
        let currentWordIndex: number | null = null;

        if (highlightEnabled) {
          if (mode === "ayah") {
            newActiveIds = getAllAyahWordIds(activeKey);
            currentWordIndex = aData
              ? computeCurrentWordIndex(audioRelativeMs, aData, activeKey)
              : null;
          } else {
            // "line" mode: only highlight words that are both on the current
            // line AND inside the user's original selection.
            const selectionSet = new Set(selectedWordIdsRef.current);
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
        }

        const prev = prevActiveIdsRef.current;
        const changed =
          newActiveIds.length !== prev.length ||
          newActiveIds.some((id, i) => id !== prev[i]);
        if (changed) {
          prevActiveIdsRef.current = newActiveIds;
          setPlaybackActiveIds(newActiveIds);
        }

        // Publish the single current-word highlight only when word highlighting is on.
        // Deduplicate to avoid unnecessary Zustand updates on every timeupdate tick.
        if (highlightEnabled) {
          const [surahStr, ayahStr] = activeKey.split(":");
          const newCurrentWordId =
            currentWordIndex !== null
              ? `${parseInt(surahStr, 10)}:${parseInt(ayahStr, 10)}:${currentWordIndex}`
              : null;
          if (newCurrentWordId !== prevCurrentWordIdRef.current) {
            prevCurrentWordIdRef.current = newCurrentWordId;
            setPlaybackCurrentWordId(newCurrentWordId);
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
      // When seeking to a specific offset within the region (scrubbing), jump
      // directly to the target time. Otherwise use the pre-roll approach to
      // avoid MP3 frame-alignment cut-offs at region boundaries.
      const PREROLL_SEC = 0.1;
      const targetTime =
        seekOffsetSec !== undefined
          ? startSec + seekOffsetSec
          : Math.max(0, startSec - PREROLL_SEC);
      audio.currentTime = targetTime;
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
      // Abort any previous pending canplay so only the most recent src change
      // can resume playback. cancelTimers() also aborts on stop.
      canplayAbortRef.current?.abort();
      canplayAbortRef.current = new AbortController();
      audio.addEventListener("canplay", doSeekAndPlay, {
        once: true,
        signal: canplayAbortRef.current.signal,
      });
    } else if (gapless) {
      // Same URL, audio is already playing — skip the seek and start tracking
      // the new region immediately.
      startTicking();
    } else {
      doSeekAndPlay();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const play = useCallback(() => {
    if (regions.length === 0) return;
    totalDurSecRef.current =
      regions.reduce((sum, r) => sum + r.durationMs, 0) / 1000;

    const pending = pendingSeekRef.current;
    pendingSeekRef.current = null;

    setIsPlaying(true);
    if (pending) {
      // Resume from a position the user scrubbed to while paused — don't reset repeat counter.
      elapsedBeforeSecRef.current = pending.elapsedBefore;
      regionIndexRef.current = pending.regionIndex;
      playRegion(pending.regionIndex, false, pending.offsetInRegion);
    } else {
      // Fresh start: reset repeat counter so the full repeat cycle runs from the top.
      repeatsDoneRef.current = 0;
      elapsedBeforeSecRef.current = 0;
      regionIndexRef.current = 0;
      playRegion(0);
    }
  }, [regions, playRegion]);

  const pause = useCallback(() => {
    stopPlayback();
  }, []);

  const seekTo = useCallback(
    (fraction: number) => {
      const allRegions = regionsRef.current;
      if (allRegions.length === 0) return;
      const totalDur = totalDurSecRef.current;
      if (totalDur <= 0) return;

      const clamped = Math.max(0, Math.min(1, fraction));
      const targetSec = clamped * totalDur;

      // Find which region this target falls in and the offset within it.
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

      const wasPlaying = isPlayingRef.current;

      // Stop the timers and pause audio before seeking.
      cancelTimers();
      if (audioRef.current) audioRef.current.pause();

      elapsedBeforeSecRef.current = accumulated;
      setCurrentAyahKey(allRegions[targetRegionIndex].ayahKey);
      setProgress(clamped);

      // Invalidate cached highlight IDs so the first tick after seek fires fresh.
      prevActiveIdsRef.current = [];
      prevCurrentWordIdRef.current = null;

      if (wasPlaying) {
        setIsPlaying(true);
        playRegion(targetRegionIndex, false, offsetInRegion);
      } else {
        // When paused: record the seeked position so play() resumes from here.
        pendingSeekRef.current = {
          regionIndex: targetRegionIndex,
          offsetInRegion,
          elapsedBefore: accumulated,
        };
        // Pre-load and seek the underlying audio element so there is no
        // startup delay when the user later presses play.
        const audio = getOrCreateAudio();
        const region = allRegions[targetRegionIndex];
        const targetTime = region.startMs / 1000 + offsetInRegion;
        if (audio.src !== region.audioUrl) {
          audio.src = region.audioUrl;
          audio.load();
          // Same abort pattern as playRegion: cancelTimers/stopPlayback can
          // cancel this pending preload-seek if the user changes reciter or
          // re-seeks before this canplay fires.
          canplayAbortRef.current?.abort();
          canplayAbortRef.current = new AbortController();
          audio.addEventListener(
            "canplay",
            () => {
              audio.currentTime = targetTime;
            },
            { once: true, signal: canplayAbortRef.current.signal }
          );
        } else {
          audio.currentTime = targetTime;
        }
      }
    },
    [playRegion]
  );

  useEffect(() => {
    return () => {
      cancelTimers();
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
    progress,
    currentAyahKey,
    hasSelection,
    hasAudio,
    isAudioLoading,
    regions,
    play,
    pause,
    seekTo,
  };
}
