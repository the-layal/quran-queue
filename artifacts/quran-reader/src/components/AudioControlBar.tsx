import { useEffect, useCallback } from "react";
import { Play, Pause, Repeat, Music2 } from "lucide-react";
import type { ChapterMap } from "../types/quran";
import { useSelectionAudio } from "../hooks/useSelectionAudio";
import { useQuranStore } from "../store/quranStore";
import type { PlaybackHighlightMode } from "../store/quranStore";

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
    play,
    pause,
    toggleLoop,
  } = useSelectionAudio();

  const playbackHighlightMode = useQuranStore((s) => s.playbackHighlightMode);
  const setPlaybackHighlightMode = useQuranStore((s) => s.setPlaybackHighlightMode);

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
        <div className="relative h-1 w-24 sm:w-36 rounded-full bg-muted overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 bg-primary rounded-full transition-[width] duration-100"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
      </div>

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
