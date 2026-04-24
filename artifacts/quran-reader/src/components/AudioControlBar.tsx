import { useEffect, useCallback, useRef, useMemo, useState } from "react";
import { Play, Pause, Repeat, Music2, Highlighter, ListMusic, CheckCheck } from "lucide-react";
import type { ChapterMap } from "../types/quran";
import { useSelectionAudio } from "../hooks/useSelectionAudio";
import { useQueuePlayback } from "../hooks/useQueuePlayback";
import { useQuranStore } from "../store/quranStore";
import type { PlaybackHighlightMode } from "../store/quranStore";
import { computeQueueItemLabel } from "../utils/queueLabel";

function fmtTime(sec: number): string {
  const s = Math.floor(sec);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

const REPEAT_OPTIONS = [1, 3, 5, 0] as const;
type RepeatOption = (typeof REPEAT_OPTIONS)[number];

function nextRepeat(current: number): number {
  const idx = REPEAT_OPTIONS.indexOf(current as RepeatOption);
  return REPEAT_OPTIONS[idx === -1 ? 0 : (idx + 1) % REPEAT_OPTIONS.length];
}

function repeatLabel(count: number): string {
  return count === 0 ? "∞" : `${count}×`;
}

interface AudioControlBarProps {
  chapters: ChapterMap;
}

export default function AudioControlBar({ chapters }: AudioControlBarProps) {
  const selectionAudio = useSelectionAudio();
  const {
    isPlaying: selIsPlaying,
    progress: selProgress,
    currentAyahKey,
    hasSelection,
    hasAudio,
    regions: selRegions,
    play: selPlay,
    pause: selPause,
    seekTo: selSeekTo,
  } = selectionAudio;

  const {
    queueIsPlaying,
    activeItemIndex,
    queueProgress,
    queueTotalDurationSec,
    queueCurrentRegions,
    queueActiveLabel,
    playQueue,
    pauseQueue,
    seekQueueTo,
  } = useQueuePlayback();

  // ── Store state ───────────────────────────────────────────────────────────
  const playbackHighlightMode = useQuranStore((s) => s.playbackHighlightMode);
  const setPlaybackHighlightMode = useQuranStore((s) => s.setPlaybackHighlightMode);
  const playbackHighlightEnabled = useQuranStore((s) => s.playbackHighlightEnabled);
  const setPlaybackHighlightEnabled = useQuranStore((s) => s.setPlaybackHighlightEnabled);
  const selectedWordIds = useQuranStore((s) => s.selectedWordIds);
  const brushFineness = useQuranStore((s) => s.brushFineness);
  const addToQueue = useQuranStore((s) => s.addToQueue);
  const queuePanelOpen = useQuranStore((s) => s.queuePanelOpen);
  const setQueuePanelOpen = useQuranStore((s) => s.setQueuePanelOpen);
  const reviewQueue = useQuranStore((s) => s.reviewQueue);
  const queueRepeatAll = useQuranStore((s) => s.queueRepeatAll);
  const setQueueRepeatAll = useQuranStore((s) => s.setQueueRepeatAll);

  const [justAdded, setJustAdded] = useState(false);

  // ── Derived flags ─────────────────────────────────────────────────────────
  // Queue is "active" if it is playing or paused at a position
  const queueActive = queueIsPlaying || activeItemIndex !== null;

  // ── Progress bar machinery ────────────────────────────────────────────────
  // In queue mode the bar reflects the active queue item; otherwise the selection.
  const activeProgress = queueActive ? queueProgress : selProgress;
  const activeRegions = queueActive ? queueCurrentRegions : selRegions;
  const activeTotalDurationSec = useMemo(
    () =>
      queueActive
        ? queueTotalDurationSec
        : selRegions.reduce((sum, r) => sum + r.durationMs, 0) / 1000,
    [queueActive, queueTotalDurationSec, selRegions]
  );
  const activeElapsedSec = activeProgress * activeTotalDurationSec;

  const activeBoundaryFractions = useMemo(() => {
    if (activeRegions.length <= 1 || activeTotalDurationSec <= 0) return [];
    const fracs: number[] = [];
    let cum = 0;
    for (let i = 0; i < activeRegions.length - 1; i++) {
      cum += activeRegions[i].durationMs / 1000;
      fracs.push(cum / activeTotalDurationSec);
    }
    return fracs;
  }, [activeRegions, activeTotalDurationSec]);

  const progressBarRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);

  const getFractionFromEvent = useCallback((clientX: number): number => {
    const el = progressBarRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      isDraggingRef.current = true;
      progressBarRef.current?.setPointerCapture(e.pointerId);
      const frac = getFractionFromEvent(e.clientX);
      if (queueActive) seekQueueTo(frac);
      else selSeekTo(frac);
    },
    [queueActive, seekQueueTo, selSeekTo, getFractionFromEvent]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDraggingRef.current) return;
      e.preventDefault();
      const frac = getFractionFromEvent(e.clientX);
      if (queueActive) seekQueueTo(frac);
      else selSeekTo(frac);
    },
    [queueActive, seekQueueTo, selSeekTo, getFractionFromEvent]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      progressBarRef.current?.releasePointerCapture(e.pointerId);
      const frac = getFractionFromEvent(e.clientX);
      if (queueActive) seekQueueTo(frac);
      else selSeekTo(frac);
    },
    [queueActive, seekQueueTo, selSeekTo, getFractionFromEvent]
  );

  const handlePointerCancel = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      progressBarRef.current?.releasePointerCapture(e.pointerId);
    },
    []
  );

  // ── Play / Pause ──────────────────────────────────────────────────────────
  const handlePlayPause = useCallback(() => {
    if (queueActive) {
      if (queueIsPlaying) pauseQueue();
      else playQueue(activeItemIndex ?? 0);
    } else {
      if (selIsPlaying) selPause();
      else selPlay();
    }
  }, [queueActive, queueIsPlaying, pauseQueue, playQueue, activeItemIndex, selIsPlaying, selPause, selPlay]);

  // ── Repeat button (cycles queueRepeatAll; applies to queue + selection) ───
  const handleRepeatCycle = useCallback(() => {
    setQueueRepeatAll(nextRepeat(queueRepeatAll));
  }, [queueRepeatAll, setQueueRepeatAll]);

  // ── Add to queue ──────────────────────────────────────────────────────────
  const handleAddToQueue = useCallback(() => {
    let lineRange: { first: number; last: number } | undefined;
    if (brushFineness === "line") {
      const lineNumbers: number[] = [];
      selectedWordIds.forEach((id) => {
        const [s, a, w] = id.split(":");
        const el = document.querySelector(
          `g[data-surah="${s.padStart(3, "0")}"][data-aya="${a.padStart(3, "0")}"][data-word-index-in-ayah="${w}"]`
        );
        const ln = el?.getAttribute("data-line-number");
        if (ln) lineNumbers.push(parseInt(ln, 10));
      });
      if (lineNumbers.length > 0) {
        lineRange = { first: Math.min(...lineNumbers), last: Math.max(...lineNumbers) };
      }
    }
    const label = computeQueueItemLabel(selectedWordIds, brushFineness, chapters, lineRange);
    addToQueue({ selectedWordIds, brushFineness, label, repeatCount: 1 });
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 1500);
  }, [selectedWordIds, brushFineness, chapters, addToQueue]);

  // ── Keyboard shortcut (space) ─────────────────────────────────────────────
  useEffect(() => {
    if (!hasSelection && !queueActive) return;
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
  }, [hasSelection, queueActive, handlePlayPause]);

  // ── Label text ────────────────────────────────────────────────────────────
  let displayLabel: string | null = null;
  if (queueActive && queueActiveLabel) {
    displayLabel = queueActiveLabel;
  } else if (currentAyahKey) {
    const [s, a] = currentAyahKey.split(":").map(Number);
    const chapter = chapters[s];
    displayLabel = chapter ? `${chapter.nameSimple} ${s}:${a}` : `${s}:${a}`;
  }

  // ── Shared style atoms ────────────────────────────────────────────────────
  const barBase =
    "fixed z-40 bottom-[8.5rem] left-1/2 -translate-x-1/2 sm:left-auto sm:right-6 sm:translate-x-0 sm:bottom-[8.5rem] flex items-center gap-3 rounded-2xl border border-border bg-card/95 backdrop-blur-md shadow-xl px-4 py-2.5 transition-all duration-200";

  const queueToggleBtn = (
    <button
      onClick={() => setQueuePanelOpen(!queuePanelOpen)}
      style={{ pointerEvents: "auto" }}
      className={`relative w-7 h-7 rounded-lg flex items-center justify-center transition-colors flex-shrink-0 border ${
        queuePanelOpen
          ? "bg-primary/15 border-primary text-primary"
          : "border-border text-muted-foreground hover:bg-muted"
      }`}
      aria-label={queuePanelOpen ? "Close review queue" : "Open review queue"}
      aria-pressed={queuePanelOpen}
      title="Review queue"
    >
      <ListMusic className="w-3.5 h-3.5" />
      {reviewQueue.length > 0 && (
        <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-primary text-primary-foreground text-[8px] font-bold flex items-center justify-center leading-none tabular-nums">
          {reviewQueue.length > 9 ? "9+" : reviewQueue.length}
        </span>
      )}
    </button>
  );

  // ── Idle states (no selection, no queue active) ───────────────────────────
  if (!hasSelection && !queueActive) {
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
        {queueToggleBtn}
      </div>
    );
  }

  if (!hasAudio && !queueActive) {
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
        {queueToggleBtn}
      </div>
    );
  }

  const isCurrentlyPlaying = queueActive ? queueIsPlaying : selIsPlaying;
  const repeatIsActive = queueRepeatAll !== 1;

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
      {/* Play / Pause */}
      <button
        onClick={handlePlayPause}
        style={{ pointerEvents: "auto" }}
        className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 transition-colors flex-shrink-0"
        aria-label={isCurrentlyPlaying ? "Pause" : "Play"}
      >
        {isCurrentlyPlaying ? (
          <Pause className="w-4 h-4" />
        ) : (
          <Play className="w-4 h-4 ml-0.5" />
        )}
      </button>

      {/* Progress area */}
      <div className="flex flex-col gap-1 min-w-0">
        {displayLabel && (
          <span className="text-xs font-medium truncate max-w-[10rem] sm:max-w-[14rem]">
            {displayLabel}
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
          aria-valuenow={Math.round(activeProgress * 100)}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
        >
          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1 rounded-full bg-muted overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 bg-primary rounded-full"
              style={{ width: `${Math.round(activeProgress * 100)}%` }}
            />
          </div>
          {activeBoundaryFractions.map((frac) => (
            <div
              key={frac}
              className="absolute top-1/2 -translate-y-1/2 w-px h-2.5 bg-black pointer-events-none"
              style={{ left: `${frac * 100}%` }}
            />
          ))}
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full bg-primary shadow-sm"
            style={{ left: `${Math.round(activeProgress * 100)}%` }}
          />
        </div>
        {activeTotalDurationSec > 0 && (
          <span className="text-[10px] tabular-nums text-muted-foreground leading-none">
            {fmtTime(activeElapsedSec)} / {fmtTime(activeTotalDurationSec)}
          </span>
        )}
      </div>

      {/* Add to queue — hidden while queue mode is active so the bar stays compact */}
      {!queueActive && (
        <button
          onClick={handleAddToQueue}
          style={{ pointerEvents: "auto" }}
          className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all flex-shrink-0 border ${
            justAdded
              ? "bg-emerald-500/15 border-emerald-500 text-emerald-600 dark:text-emerald-400 scale-110"
              : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
          aria-label="Add selection to review queue"
          title="Add to review queue"
        >
          <CheckCheck className="w-3.5 h-3.5" />
        </button>
      )}

      {/* Highlight toggle — only meaningful outside queue mode */}
      {!queueActive && (
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
      )}

      {/* Highlight mode segment — only outside queue mode */}
      {!queueActive && (
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
      )}

      {/* Repeat button — cycles through 1×/3×/5×/∞, synced with queue */}
      <button
        onClick={handleRepeatCycle}
        style={{ pointerEvents: "auto" }}
        className={`h-7 rounded-lg flex items-center justify-center gap-1 transition-colors flex-shrink-0 border px-2 ${
          repeatIsActive
            ? "bg-primary/15 border-primary text-primary"
            : "border-border text-muted-foreground hover:bg-muted"
        }`}
        aria-label={`Repeat: ${repeatLabel(queueRepeatAll)}`}
        title={`Repeat: ${repeatLabel(queueRepeatAll)} — click to change`}
      >
        <Repeat className="w-3.5 h-3.5" />
        <span className="text-[10px] font-bold tabular-nums leading-none">
          {repeatLabel(queueRepeatAll)}
        </span>
      </button>

      {queueToggleBtn}
    </div>
  );
}
