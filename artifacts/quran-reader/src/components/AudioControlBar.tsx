import { useEffect, useCallback, useRef, useMemo, useState } from "react";
import { Play, Pause, Repeat, Music2, Highlighter, ListMusic, CheckCheck, Loader2 } from "lucide-react";
import SpeedSelector from "./SpeedSelector";
import ReciterSelector from "./ReciterSelector";
import type { ChapterMap } from "../types/quran";
import { useSelectionAudio } from "../hooks/useSelectionAudio";
import type { QueuePlaybackState } from "../hooks/useQueuePlayback";
import { useQuranStore } from "../store/quranStore";
import type { PlaybackHighlightMode } from "../store/quranStore";
import { computeQueueItemLabel } from "../utils/queueLabel";
import { clampRepeat, nextRepeat, repeatLabel } from "../utils/repeatOptions";

function fmtTime(sec: number): string {
  const s = Math.floor(sec);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

interface AudioControlBarProps {
  chapters: ChapterMap;
  queuePlayback: QueuePlaybackState;
}

export default function AudioControlBar({ chapters, queuePlayback }: AudioControlBarProps) {
  const {
    isPlaying: selIsPlaying,
    progress: selProgress,
    currentAyahKey,
    hasSelection,
    hasAudio,
    isAudioLoading,
    regions: selRegions,
    play: selPlay,
    pause: selPause,
    seekTo: selSeekTo,
  } = useSelectionAudio();

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
  } = queuePlayback;

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
  const isSharedQueue = useQuranStore((s) => s.isSharedQueue);

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

  // Hoisted above all useCallback hooks so they can reference it safely.
  const clampedRepeat = clampRepeat(queueRepeatAll);

  // ── Repeat button (cycles queueRepeatAll; applies to queue + selection) ───
  // Always cycle from the clamped display value so a stale persisted 4/5
  // advances to ∞ (0) rather than falling back to 1× unexpectedly.
  const handleRepeatCycle = useCallback(() => {
    setQueueRepeatAll(nextRepeat(clampedRepeat));
  }, [clampedRepeat, setQueueRepeatAll]);

  // ── Add to queue ──────────────────────────────────────────────────────────
  const handleAddToQueue = useCallback(() => {
    let lineRange: { first: number; last: number } | undefined;
    if (brushFineness === "line") {
      const lineNumbers: number[] = [];
      selectedWordIds.forEach((id) => {
        const [s, a, w] = id.split(":");
        const el = document.querySelector(
          `g[data-surah="${s.padStart(3, "0")}"][data-aya="${a.padStart(3, "0")}"][data-word-index-in-ayah="${w}"][data-type="text"]`
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
      // Align with the visually-disabled play button: don't toggle playback
      // while the new reciter's audio is still loading.
      if (isAudioLoading && !queueActive) return;
      if (e.key === " ") {
        e.preventDefault();
        handlePlayPause();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [hasSelection, queueActive, handlePlayPause, isAudioLoading]);

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
  // On mobile: span full width with a small gutter on each side.
  // On sm+: intrinsic width anchored to bottom-right (unchanged desktop look).
  // Idle states stay single-row; active state stacks on mobile.
  // bottom tracks the live footer height (set by ResizeObserver in QuranPage)
  // so the bar always floats above the footer even when controls wrap on mobile.
  const barBottom = "calc(var(--mushaf-footer-h, 8.5rem) + 8px)";
  const barBaseRow =
    "fixed z-40 left-2 right-2 sm:left-auto sm:right-6 sm:w-auto flex flex-row items-center gap-3 rounded-2xl border border-border bg-card/95 backdrop-blur-md shadow-xl px-4 py-2.5 transition-all duration-200";
  const barBase =
    "fixed z-40 left-2 right-2 sm:left-auto sm:right-6 sm:w-auto flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 rounded-2xl border border-border bg-card/95 backdrop-blur-md shadow-xl px-4 py-2.5 transition-all duration-200";

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
        className={`${barBaseRow} opacity-60`}
        style={{ pointerEvents: "none", bottom: barBottom }}
        role="status"
        aria-label="Audio control bar"
      >
        <Music2 className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        <span className="text-xs text-muted-foreground whitespace-nowrap flex-1 min-w-0 truncate">
          Select text to play
        </span>
        <ReciterSelector style={{ pointerEvents: "auto" }} />
        {queueToggleBtn}
      </div>
    );
  }

  // Genuine empty state: the selected reciter has no timing data for this
  // selection. Suppressed while audio is still loading so a reciter switch
  // shows the spinner on the play button instead of momentarily flashing
  // "No audio for selection".
  if (!hasAudio && !queueActive && !isAudioLoading) {
    return (
      <div
        className={`${barBaseRow} opacity-60`}
        style={{ pointerEvents: "none", bottom: barBottom }}
        role="status"
        aria-label="Audio control bar"
      >
        <Music2 className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        <span className="text-xs text-muted-foreground whitespace-nowrap flex-1 min-w-0 truncate">
          No audio for selection
        </span>
        <ReciterSelector style={{ pointerEvents: "auto" }} />
        {queueToggleBtn}
      </div>
    );
  }

  const isCurrentlyPlaying = queueActive ? queueIsPlaying : selIsPlaying;
  const repeatIsActive = clampedRepeat !== 1;
  const showAudioLoading = isAudioLoading && !queueActive;

  const modeOptions: { value: PlaybackHighlightMode; label: string }[] = [
    { value: "line", label: "Line" },
    { value: "ayah", label: "Ayah" },
  ];

  // ── Shared secondary control elements ─────────────────────────────────────
  const addToQueueBtn = !queueActive && !isSharedQueue ? (
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
  ) : null;

  const highlightBtn = !queueActive ? (
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
  ) : null;

  const highlightModeGroup = !queueActive ? (
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
          className={`px-2 h-7 text-xs font-medium transition-colors ${
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
  ) : null;

  const repeatBtn = (
    <button
      onClick={handleRepeatCycle}
      style={{ pointerEvents: "auto" }}
      className={`h-7 rounded-lg flex items-center justify-center gap-1 transition-colors flex-shrink-0 border px-2 ${
        repeatIsActive
          ? "bg-primary/15 border-primary text-primary"
          : "border-border text-muted-foreground hover:bg-muted"
      }`}
      aria-label={`Repeat: ${repeatLabel(clampedRepeat)}`}
      title={`Repeat: ${repeatLabel(clampedRepeat)} — click to change`}
    >
      <Repeat className="w-3.5 h-3.5" />
      <span className="text-[10px] font-bold tabular-nums leading-none">
        {repeatLabel(clampedRepeat)}
      </span>
    </button>
  );

  return (
    <div
      className={barBase}
      style={{ pointerEvents: "none", bottom: barBottom }}
      role="region"
      aria-label="Audio playback controls"
      data-tour="audio-bar"
    >
      {/*
       * ── Primary row ──────────────────────────────────────────────────────
       * Mobile:  flex-row — play · progress (flex-1) · queue toggle
       * sm+:     `sm:contents` dissolves this wrapper so its children become
       *          direct flex items of the outer bar (single-row desktop look).
       */}
      <div className="flex items-center gap-2 sm:contents">
        {/* Play / Pause (or loading spinner while reciter audio is fetching) */}
        <button
          onClick={handlePlayPause}
          disabled={showAudioLoading}
          style={{ pointerEvents: "auto" }}
          className={`w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center transition-colors flex-shrink-0 ${
            showAudioLoading ? "cursor-wait opacity-70" : "hover:bg-primary/90"
          }`}
          aria-label={
            showAudioLoading
              ? "Loading reciter audio"
              : isCurrentlyPlaying
              ? "Pause"
              : "Play"
          }
          aria-busy={showAudioLoading}
        >
          {showAudioLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : isCurrentlyPlaying ? (
            <Pause className="w-4 h-4" />
          ) : (
            <Play className="w-4 h-4 ml-0.5" />
          )}
        </button>

        {/* Progress area */}
        <div className="flex flex-col gap-1 min-w-0 flex-1 sm:flex-none">
          {displayLabel && (
            <span className="text-xs font-medium truncate max-w-full sm:max-w-[14rem]">
              {displayLabel}
            </span>
          )}
          <div
            ref={progressBarRef}
            className="relative h-3 w-full sm:w-36 flex items-center cursor-pointer select-none touch-none"
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

        {/* Queue toggle — mobile: end of top row (hidden on sm+, re-rendered below) */}
        <div className="sm:hidden flex-shrink-0">{queueToggleBtn}</div>
      </div>

      {/*
       * ── Secondary controls ────────────────────────────────────────────────
       * Mobile:  flex-row (bottom row), wraps on very narrow screens.
       * sm+:     `sm:contents` dissolves this wrapper so items flow inline
       *          in the bar's single flex row, between progress and queue toggle.
       */}
      <div className="flex items-center gap-2 flex-wrap sm:contents">
        <div className="flex-shrink-0" style={{ pointerEvents: "auto" }}>
          <ReciterSelector style={{ pointerEvents: "auto" }} />
        </div>
        <div className="flex-shrink-0" style={{ pointerEvents: "auto" }}>
          <SpeedSelector style={{ pointerEvents: "auto" }} />
        </div>
        {repeatBtn}
        {highlightBtn}
        {highlightModeGroup}
        {addToQueueBtn}
      </div>

      {/* Queue toggle — sm+: appears after secondary controls in the single row */}
      <div className="hidden sm:block flex-shrink-0">{queueToggleBtn}</div>
    </div>
  );
}
