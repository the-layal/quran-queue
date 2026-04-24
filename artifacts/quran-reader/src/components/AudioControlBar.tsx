import { useEffect, useCallback, useRef, useMemo } from "react";
import { Play, Pause, Repeat, Music2, Highlighter } from "lucide-react";
import type { ChapterMap } from "../types/quran";
import { useSelectionAudio } from "../hooks/useSelectionAudio";
import { useQuranStore } from "../store/quranStore";
import type { PlaybackHighlightMode } from "../store/quranStore";

function fmtTime(sec: number): string {
  const s = Math.floor(sec);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

interface AudioControlBarProps {
  chapters: ChapterMap;
}

export default function AudioControlBar({ chapters }: AudioControlBarProps) {
  const {
    isPlaying,
    isLooping,
    progress,
    currentAyahKey,
    hasSelection,
    hasAudio,
    regions,
    play,
    pause,
    toggleLoop,
    seekTo,
  } = useSelectionAudio();

  const totalDurationSec = useMemo(
    () => regions.reduce((sum, r) => sum + r.durationMs, 0) / 1000,
    [regions]
  );

  const elapsedSec = progress * totalDurationSec;

  // Fractional positions (0–1) of each inter-ayah boundary on the progress bar.
  // One tick per boundary between consecutive regions.
  const boundaryFractions = useMemo(() => {
    if (regions.length <= 1 || totalDurationSec <= 0) return [];
    const fracs: number[] = [];
    let cum = 0;
    for (let i = 0; i < regions.length - 1; i++) {
      cum += regions[i].durationMs / 1000;
      fracs.push(cum / totalDurationSec);
    }
    return fracs;
  }, [regions, totalDurationSec]);

  const progressBarRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);

  const getFractionFromEvent = useCallback(
    (clientX: number): number => {
      const el = progressBarRef.current;
      if (!el) return 0;
      const rect = el.getBoundingClientRect();
      return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    },
    []
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      isDraggingRef.current = true;
      progressBarRef.current?.setPointerCapture(e.pointerId);
      seekTo(getFractionFromEvent(e.clientX));
    },
    [seekTo, getFractionFromEvent]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDraggingRef.current) return;
      e.preventDefault();
      seekTo(getFractionFromEvent(e.clientX));
    },
    [seekTo, getFractionFromEvent]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      progressBarRef.current?.releasePointerCapture(e.pointerId);
      seekTo(getFractionFromEvent(e.clientX));
    },
    [seekTo, getFractionFromEvent]
  );

  const handlePointerCancel = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      progressBarRef.current?.releasePointerCapture(e.pointerId);
      // Do not seek on cancel — just end the drag at the last valid position.
    },
    []
  );

  const playbackHighlightMode = useQuranStore((s) => s.playbackHighlightMode);
  const setPlaybackHighlightMode = useQuranStore((s) => s.setPlaybackHighlightMode);
  const playbackHighlightEnabled = useQuranStore((s) => s.playbackHighlightEnabled);
  const setPlaybackHighlightEnabled = useQuranStore((s) => s.setPlaybackHighlightEnabled);

  const handlePlayPause = useCallback(() => {
    if (isPlaying) {
      pause();
    } else {
      play();
    }
  }, [isPlaying, play, pause]);

  useEffect(() => {
    if (!hasSelection) return;

    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.target instanceof HTMLTextAreaElement) return;
      if (e.key === " ") {
        e.preventDefault();
        handlePlayPause();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [hasSelection, handlePlayPause]);

  let ayahLabel: string | null = null;
  if (currentAyahKey) {
    const [s, a] = currentAyahKey.split(":").map(Number);
    const chapter = chapters[s];
    if (chapter) {
      ayahLabel = `${chapter.nameSimple} ${s}:${a}`;
    } else {
      ayahLabel = `${s}:${a}`;
    }
  }

  const barBase =
    "fixed z-40 bottom-[8.5rem] left-1/2 -translate-x-1/2 sm:left-auto sm:right-6 sm:translate-x-0 sm:bottom-[8.5rem] flex items-center gap-3 rounded-2xl border border-border bg-card/95 backdrop-blur-md shadow-xl px-4 py-2.5 transition-all duration-200";

  if (!hasSelection) {
    return (
      <div
        className={`${barBase} opacity-60`}
        style={{ pointerEvents: "none" }}
        role="status"
        aria-label="Audio control bar"
      >
        <Music2 className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          Select text to play
        </span>
      </div>
    );
  }

  if (!hasAudio) {
    return (
      <div
        className={`${barBase} opacity-60`}
        style={{ pointerEvents: "none" }}
        role="status"
        aria-label="Audio control bar"
      >
        <Music2 className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          No audio for selection
        </span>
      </div>
    );
  }

  const modeOptions: { value: PlaybackHighlightMode; label: string }[] = [
    { value: "line", label: "Line" },
    { value: "ayah", label: "Ayah" },
  ];

  return (
    <div
      className={barBase}
      style={{ pointerEvents: "none" }}
      role="region"
      aria-label="Audio playback controls"
    >
      <button
        onClick={handlePlayPause}
        style={{ pointerEvents: "auto" }}
        className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 transition-colors flex-shrink-0"
        aria-label={isPlaying ? "Pause" : "Play"}
      >
        {isPlaying ? (
          <Pause className="w-4 h-4" />
        ) : (
          <Play className="w-4 h-4 ml-0.5" />
        )}
      </button>

      <div className="flex flex-col gap-1 min-w-0">
        {ayahLabel && (
          <span className="text-xs font-medium truncate max-w-[10rem] sm:max-w-[14rem]">
            {ayahLabel}
          </span>
        )}
        <div
          ref={progressBarRef}
          className="relative h-3 w-24 sm:w-36 flex items-center cursor-pointer select-none touch-none"
          style={{ pointerEvents: "auto" }}
          role="slider"
          aria-label="Playback position"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
        >
          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1 rounded-full bg-muted overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 bg-primary rounded-full"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
          {boundaryFractions.map((frac) => (
            <div
              key={frac}
              className="absolute top-1/2 -translate-y-1/2 w-px h-2.5 bg-foreground/60 pointer-events-none"
              style={{ left: `${frac * 100}%` }}
            />
          ))}
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full bg-primary shadow-sm"
            style={{ left: `${Math.round(progress * 100)}%` }}
          />
        </div>
        {totalDurationSec > 0 && (
          <span className="text-[10px] tabular-nums text-muted-foreground leading-none">
            {fmtTime(elapsedSec)} / {fmtTime(totalDurationSec)}
          </span>
        )}
      </div>

      <button
        onClick={() => setPlaybackHighlightEnabled(!playbackHighlightEnabled)}
        style={{ pointerEvents: "auto" }}
        className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors flex-shrink-0 border ${
          playbackHighlightEnabled
            ? "bg-primary/15 border-primary text-primary"
            : "border-border text-muted-foreground hover:bg-muted"
        }`}
        aria-label={playbackHighlightEnabled ? "Disable per-word colour highlight" : "Enable per-word colour highlight"}
        aria-pressed={playbackHighlightEnabled}
        title={playbackHighlightEnabled ? "Word colour: on" : "Word colour: off"}
      >
        <Highlighter className="w-3.5 h-3.5" />
      </button>

      <div
        className="flex items-center rounded-lg border border-border overflow-hidden flex-shrink-0"
        style={{ pointerEvents: "auto" }}
        role="group"
        aria-label="Highlight mode"
      >
        {modeOptions.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setPlaybackHighlightMode(value)}
            className={`px-2 py-1 text-xs font-medium transition-colors ${
              playbackHighlightMode === value
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:bg-muted"
            }`}
            aria-pressed={playbackHighlightMode === value}
            title={`Highlight by ${label.toLowerCase()}`}
          >
            {label}
          </button>
        ))}
      </div>

      <button
        onClick={toggleLoop}
        style={{ pointerEvents: "auto" }}
        className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors flex-shrink-0 border ${
          isLooping
            ? "bg-primary/15 border-primary text-primary"
            : "border-border text-muted-foreground hover:bg-muted"
        }`}
        aria-label={isLooping ? "Disable loop" : "Enable loop"}
        aria-pressed={isLooping}
        title={isLooping ? "Loop on" : "Loop off"}
      >
        <Repeat className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
