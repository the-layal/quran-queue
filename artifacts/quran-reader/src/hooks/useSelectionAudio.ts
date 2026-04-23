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
  audioContext: AudioContext | null;
}

interface SchedulerState {
  sources: AudioBufferSourceNode[];
  startedAtContextTime: number;
  totalDurationSec: number;
  regions: PlaybackRegion[];
  looping: boolean;
}

const bufferCache = new Map<string, AudioBuffer>();

async function fetchAndDecode(
  ctx: AudioContext,
  url: string
): Promise<AudioBuffer> {
  const cached = bufferCache.get(url);
  if (cached) return cached;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Audio fetch failed: ${url}`);
  const arrayBuffer = await res.arrayBuffer();
  const decoded = await ctx.decodeAudioData(arrayBuffer);
  bufferCache.set(url, decoded);
  return decoded;
}

function stopAllSources(sources: AudioBufferSourceNode[]) {
  for (const src of sources) {
    try {
      src.onended = null;
      src.stop();
    } catch {
    }
  }
}

export function useSelectionAudio(): SelectionAudioState {
  const selectedWordIds = useQuranStore((s) => s.selectedWordIds);
  const brushFineness = useQuranStore((s) => s.brushFineness);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isLooping, setIsLooping] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentAyahKey, setCurrentAyahKey] = useState<string | null>(null);
  const [audioData, setAudioData] = useState<AudioDataMap | null>(null);
  const [regions, setRegions] = useState<PlaybackRegion[]>([]);

  const ctxRef = useRef<AudioContext | null>(null);
  const schedulerRef = useRef<SchedulerState | null>(null);
  const rafRef = useRef<number | null>(null);
  const isLoopingRef = useRef(false);

  isLoopingRef.current = isLooping;

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

  function getOrCreateContext(): AudioContext {
    if (!ctxRef.current || ctxRef.current.state === "closed") {
      ctxRef.current = new AudioContext();
    }
    return ctxRef.current;
  }

  function stopPlayback() {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (schedulerRef.current) {
      stopAllSources(schedulerRef.current.sources);
      schedulerRef.current = null;
    }
    setIsPlaying(false);
  }

  function startProgressLoop(
    ctx: AudioContext,
    startedAt: number,
    totalDuration: number,
    regionsSnapshot: PlaybackRegion[]
  ) {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);

    function tick() {
      const elapsed = ctx.currentTime - startedAt;
      const prog = totalDuration > 0 ? Math.min(elapsed / totalDuration, 1) : 0;
      setProgress(prog);

      let cumulative = 0;
      let activeKey: string | null = null;
      for (const region of regionsSnapshot) {
        const regionDur = region.durationMs / 1000;
        if (elapsed >= cumulative && elapsed < cumulative + regionDur) {
          activeKey = region.ayahKey;
          break;
        }
        cumulative += regionDur;
      }
      if (activeKey === null && regionsSnapshot.length > 0) {
        activeKey = regionsSnapshot[regionsSnapshot.length - 1].ayahKey;
      }
      setCurrentAyahKey(activeKey);

      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
  }

  const scheduleRegions = useCallback(
    async (regionsToPlay: PlaybackRegion[], loop: boolean) => {
      if (regionsToPlay.length === 0) return;

      const ctx = getOrCreateContext();
      if (ctx.state === "suspended") {
        await ctx.resume();
      }

      const buffers = await Promise.all(
        regionsToPlay.map((r) => fetchAndDecode(ctx, r.audioUrl))
      );

      if (schedulerRef.current) {
        stopAllSources(schedulerRef.current.sources);
      }

      const sources: AudioBufferSourceNode[] = [];
      const resolvedRegions: PlaybackRegion[] = [];
      let scheduleTime = ctx.currentTime;
      const startedAt = scheduleTime;
      let totalDuration = 0;

      for (let i = 0; i < regionsToPlay.length; i++) {
        const region = regionsToPlay[i];
        const buffer = buffers[i];

        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);

        const startSec = region.startMs / 1000;
        const durSec = region.durationMs / 1000;

        if (durSec <= 0) continue;

        source.start(scheduleTime, startSec, durSec);
        sources.push(source);
        resolvedRegions.push(region);
        scheduleTime += durSec;
        totalDuration += durSec;
      }

      schedulerRef.current = {
        sources,
        startedAtContextTime: startedAt,
        totalDurationSec: totalDuration,
        regions: resolvedRegions,
        looping: loop,
      };

      setIsPlaying(true);
      setCurrentAyahKey(resolvedRegions[0]?.ayahKey ?? regionsToPlay[0].ayahKey);
      startProgressLoop(ctx, startedAt, totalDuration, resolvedRegions);

      const lastSource = sources[sources.length - 1];
      if (lastSource) {
        lastSource.onended = () => {
          const current = schedulerRef.current;
          if (!current) return;

          const ctx2 = ctxRef.current;
          if (!ctx2) return;

          const elapsed = ctx2.currentTime - current.startedAtContextTime;
          if (elapsed < current.totalDurationSec - 0.1) return;

          if (isLoopingRef.current) {
            scheduleRegions(current.regions, true);
          } else {
            if (rafRef.current !== null) {
              cancelAnimationFrame(rafRef.current);
              rafRef.current = null;
            }
            schedulerRef.current = null;
            setIsPlaying(false);
            setProgress(1);
          }
        };
      }
    },
    []
  );

  const play = useCallback(() => {
    if (regions.length === 0) return;
    scheduleRegions(regions, isLoopingRef.current);
  }, [regions, scheduleRegions]);

  const pause = useCallback(() => {
    stopPlayback();
  }, []);

  const toggleLoop = useCallback(() => {
    setIsLooping((prev) => {
      const next = !prev;
      if (schedulerRef.current) {
        schedulerRef.current.looping = next;
      }
      return next;
    });
  }, []);

  useEffect(() => {
    return () => {
      stopPlayback();
      ctxRef.current?.close().catch(() => {});
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
    audioContext: ctxRef.current,
  };
}
