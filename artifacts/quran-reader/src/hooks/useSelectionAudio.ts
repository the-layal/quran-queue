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

export function useSelectionAudio(): SelectionAudioState {
  const selectedWordIds = useQuranStore((s) => s.selectedWordIds);
  const brushFineness = useQuranStore((s) => s.brushFineness);

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

  isLoopingRef.current = isLooping;
  regionsRef.current = regions;

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
  }

  const playRegion = useCallback((regionIndex: number) => {
    const allRegions = regionsRef.current;

    if (regionIndex >= allRegions.length) {
      if (isLoopingRef.current) {
        elapsedBeforeSecRef.current = 0;
        playRegion(0);
      } else {
        cancelRaf();
        setIsPlaying(false);
        setProgress(1);
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

        if (ct >= endSec - 0.08 || audio.ended) {
          audio.pause();
          audio.onended = null;
          elapsedBeforeSecRef.current = elapsedBefore + regionDurSec;
          playRegion(regionIndex + 1);
          return;
        }

        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    };

    const doSeekAndPlay = () => {
      audio.currentTime = startSec;
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
