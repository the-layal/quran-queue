import { useRef, useState, useEffect } from "react";
import {
  X,
  GripVertical,
  ListMusic,
  Play,
  Pause,
  Square,
  Sparkles,
  Music2,
  Share2,
  Copy,
  ExternalLink,
} from "lucide-react";
import { useQuranStore } from "../store/quranStore";
import type { QueuePlaybackState } from "../hooks/useQueuePlayback";
import { computeQueueItemLabel } from "../utils/queueLabel";
import { toast } from "../hooks/use-toast";
import type { ReviewQueueItem } from "../store/quranStore";
import type { ChapterMap, BrushFineness } from "../types/quran";

// ── Helpers ────────────────────────────────────────────────────────────────

function genId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

const REPEAT_OPTIONS = [1, 3, 5, 0] as const;
type RepeatOption = (typeof REPEAT_OPTIONS)[number];

const LOOP_OPTIONS = [1, 2, 3, 0] as const;

function nextRepeat(current: number): number {
  const idx = REPEAT_OPTIONS.indexOf(current as RepeatOption);
  return REPEAT_OPTIONS[idx === -1 ? 0 : (idx + 1) % REPEAT_OPTIONS.length];
}

function repeatLabel(count: number): string {
  return count === 0 ? "∞" : `${count}×`;
}

// ── Preset generation ─────────────────────────────────────────────────────

function buildAyahPreset(repeatCount: number, chapters: ChapterMap): ReviewQueueItem[] {
  const ayahWordMap = new Map<string, string[]>();
  document
    .querySelectorAll<Element>("g[data-surah][data-aya][data-word-index-in-ayah]")
    .forEach((el) => {
      const s = el.getAttribute("data-surah");
      const a = el.getAttribute("data-aya");
      const w = el.getAttribute("data-word-index-in-ayah");
      if (!s || !a || !w) return;
      const surah = parseInt(s, 10);
      const ayah = parseInt(a, 10);
      const key = `${surah}:${ayah}`;
      const wordId = `${surah}:${ayah}:${w}`;
      if (!ayahWordMap.has(key)) ayahWordMap.set(key, []);
      ayahWordMap.get(key)!.push(wordId);
    });

  return Array.from(ayahWordMap.entries())
    .sort(([a], [b]) => {
      const [as, aa] = a.split(":").map(Number);
      const [bs, ba] = b.split(":").map(Number);
      return as !== bs ? as - bs : aa - ba;
    })
    .map(([, wordIds]) => ({
      id: genId(),
      selectedWordIds: wordIds,
      brushFineness: "ayah" as BrushFineness,
      label: computeQueueItemLabel(wordIds, "ayah", chapters),
      repeatCount,
    }));
}

function buildLinePreset(repeatCount: number): ReviewQueueItem[] {
  const lineWordMap = new Map<number, string[]>();
  document
    .querySelectorAll<Element>("g[data-line-number][data-surah][data-aya][data-word-index-in-ayah]")
    .forEach((el) => {
      const ln = el.getAttribute("data-line-number");
      const s = el.getAttribute("data-surah");
      const a = el.getAttribute("data-aya");
      const w = el.getAttribute("data-word-index-in-ayah");
      if (!ln || !s || !a || !w) return;
      const lineNum = parseInt(ln, 10);
      const surah = parseInt(s, 10);
      const ayah = parseInt(a, 10);
      const wordId = `${surah}:${ayah}:${w}`;
      if (!lineWordMap.has(lineNum)) lineWordMap.set(lineNum, []);
      lineWordMap.get(lineNum)!.push(wordId);
    });

  return Array.from(lineWordMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([lineNum, wordIds]) => ({
      id: genId(),
      selectedWordIds: wordIds,
      brushFineness: "line" as BrushFineness,
      label: computeQueueItemLabel(wordIds, "line", {}, {
        first: lineNum,
        last: lineNum,
      }),
      repeatCount,
    }));
}

// ── Repeat badge ──────────────────────────────────────────────────────────

function RepeatBadge({
  count,
  onCycle,
}: {
  count: number;
  onCycle: () => void;
}) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onCycle();
      }}
      className="flex-shrink-0 min-w-[26px] h-[18px] rounded-full border border-border text-[9px] font-bold tabular-nums text-muted-foreground hover:border-primary hover:text-primary transition-colors px-1.5 flex items-center justify-center"
      title="Tap to change repeat count"
    >
      {repeatLabel(count)}
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────

interface ReviewQueuePanelProps {
  chapters: ChapterMap;
  queuePlayback: QueuePlaybackState;
}

export default function ReviewQueuePanel({ chapters, queuePlayback }: ReviewQueuePanelProps) {
  const reviewQueue = useQuranStore((s) => s.reviewQueue);
  const activeQueueItemId = useQuranStore((s) => s.activeQueueItemId);
  const queuePanelOpen = useQuranStore((s) => s.queuePanelOpen);
  const isSharedQueue = useQuranStore((s) => s.isSharedQueue);
  const setQueuePanelOpen = useQuranStore((s) => s.setQueuePanelOpen);
  const removeFromQueue = useQuranStore((s) => s.removeFromQueue);
  const reorderQueue = useQuranStore((s) => s.reorderQueue);
  const clearReviewQueue = useQuranStore((s) => s.clearReviewQueue);
  const setActiveQueueItemId = useQuranStore((s) => s.setActiveQueueItemId);
  const setSelectedWordIds = useQuranStore((s) => s.setSelectedWordIds);
  const setBrushFineness = useQuranStore((s) => s.setBrushFineness);
  const queueRepeatAll = useQuranStore((s) => s.queueRepeatAll);
  const setQueueItemRepeat = useQuranStore((s) => s.setQueueItemRepeat);
  const setQueueRepeatAll = useQuranStore((s) => s.setQueueRepeatAll);
  const queueLoopCount = useQuranStore((s) => s.queueLoopCount);
  const setQueueLoopCount = useQuranStore((s) => s.setQueueLoopCount);
  const setReviewQueue = useQuranStore((s) => s.setReviewQueue);
  const setIsSharedQueue = useQuranStore((s) => s.setIsSharedQueue);

  const { queueIsPlaying, activeItemIndex, playQueue, pauseQueue, stopQueue } =
    queuePlayback;

  const dragFromRef = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [isSharing, setIsSharing] = useState(false);

  // Presets popover
  const [showPresets, setShowPresets] = useState(false);
  const [presetRepeat, setPresetRepeat] = useState<number>(3);
  const presetsButtonRef = useRef<HTMLButtonElement>(null);
  const presetsPopoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showPresets) return;
    const handler = (e: MouseEvent) => {
      if (
        presetsPopoverRef.current &&
        !presetsPopoverRef.current.contains(e.target as Node) &&
        !presetsButtonRef.current?.contains(e.target as Node)
      ) {
        setShowPresets(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showPresets]);

  // ── Drag-to-reorder ──────────────────────────────────────────────────────

  const handleDragStart = (index: number) => (e: React.DragEvent) => {
    dragFromRef.current = index;
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (index: number) => (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverIndex(index);
  };

  const handleDrop = (index: number) => (e: React.DragEvent) => {
    e.preventDefault();
    const from = dragFromRef.current;
    if (from !== null && from !== index) reorderQueue(from, index);
    dragFromRef.current = null;
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    dragFromRef.current = null;
    setDragOverIndex(null);
  };

  // ── Item click ───────────────────────────────────────────────────────────

  const handleItemClick = (item: ReviewQueueItem) => {
    if (queueIsPlaying) {
      const idx = reviewQueue.indexOf(item);
      if (idx !== -1) playQueue(idx);
    } else {
      setActiveQueueItemId(item.id);
      setSelectedWordIds(item.selectedWordIds);
      setBrushFineness(item.brushFineness);
    }
  };

  // ── Preset apply ─────────────────────────────────────────────────────────

  const applyPreset = (type: "ayah" | "line") => {
    const items =
      type === "ayah"
        ? buildAyahPreset(presetRepeat, chapters)
        : buildLinePreset(presetRepeat);

    if (items.length > 0) {
      setReviewQueue(items);
    }
    setShowPresets(false);
  };

  // ── Header play button logic ─────────────────────────────────────────────

  const handleHeaderPlay = () => {
    if (queueIsPlaying) {
      pauseQueue();
    } else if (activeItemIndex !== null) {
      playQueue(activeItemIndex);
    } else {
      playQueue(0);
    }
  };

  const handleHeaderStop = (e: React.MouseEvent) => {
    e.stopPropagation();
    stopQueue();
  };

  // ── Share ─────────────────────────────────────────────────────────────────

  const handleShare = async () => {
    if (reviewQueue.length === 0 || isSharing) return;
    setIsSharing(true);
    try {
      const res = await fetch("/api/queues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: reviewQueue }),
      });
      if (!res.ok) throw new Error("Failed to save queue");
      const { id } = await res.json() as { id: string };
      const url = `${window.location.origin}${window.location.pathname}?q=${id}`;
      await navigator.clipboard.writeText(url);
      toast({ title: "Link copied!", description: "Share this link to send your queue." });
    } catch {
      toast({ title: "Could not copy link", description: "Please try again." });
    } finally {
      setIsSharing(false);
    }
  };

  // ── Duplicate shared queue ────────────────────────────────────────────────

  const handleDuplicate = () => {
    setIsSharedQueue(false);
    toast({ title: "Queue duplicated", description: "You can now edit this queue freely." });
  };

  const hasQueue = reviewQueue.length > 0;

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <>
      {/* Mobile backdrop */}
      {queuePanelOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/20 sm:hidden"
          onClick={() => setQueuePanelOpen(false)}
        />
      )}

      {/* Panel */}
      <div
        className={`fixed top-0 left-0 h-full z-50 flex flex-col bg-card border-r border-border shadow-2xl transition-transform duration-300 ease-in-out w-72 ${
          queuePanelOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        aria-label="Review queue"
        role="complementary"
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-3 border-b border-border flex-shrink-0">
          <ListMusic className="w-4 h-4 text-primary flex-shrink-0" />
          <span className="text-sm font-semibold flex-1 min-w-0">Review Queue</span>
          {reviewQueue.length > 0 && (
            <span className="text-xs text-muted-foreground tabular-nums">
              ({reviewQueue.length})
            </span>
          )}

          {/* Play / Pause */}
          {hasQueue && (
            <button
              onClick={handleHeaderPlay}
              className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors border ${
                queueIsPlaying
                  ? "bg-primary/15 border-primary text-primary"
                  : "border-border text-muted-foreground hover:bg-muted"
              }`}
              aria-label={queueIsPlaying ? "Pause queue" : "Play queue"}
              title={queueIsPlaying ? "Pause queue" : "Play queue"}
            >
              {queueIsPlaying ? (
                <Pause className="w-3.5 h-3.5" />
              ) : (
                <Play className="w-3.5 h-3.5 ml-px" />
              )}
            </button>
          )}

          {/* Stop (visible when playing or paused with an active position) */}
          {hasQueue && (activeItemIndex !== null) && (
            <button
              onClick={handleHeaderStop}
              className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors border border-border text-muted-foreground hover:bg-muted"
              aria-label="Stop queue"
              title="Stop queue"
            >
              <Square className="w-3 h-3" />
            </button>
          )}

          {/* Presets — hidden for shared (read-only) queues */}
          {!isSharedQueue && (
            <div className="relative">
              <button
                ref={presetsButtonRef}
                onClick={() => setShowPresets((v) => !v)}
                className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors border ${
                  showPresets
                    ? "bg-primary/15 border-primary text-primary"
                    : "border-border text-muted-foreground hover:bg-muted"
                }`}
                aria-label="Queue presets"
                title="Generate queue from page"
              >
                <Sparkles className="w-3.5 h-3.5" />
              </button>

              {showPresets && (
                <div
                  ref={presetsPopoverRef}
                  className="absolute top-full right-0 mt-1.5 z-[60] bg-card border border-border rounded-xl shadow-xl p-3 w-52"
                >
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                    Repeats per segment
                  </p>
                  <div className="flex gap-1 mb-3">
                    {REPEAT_OPTIONS.map((v) => (
                      <button
                        key={v}
                        onClick={() => setPresetRepeat(v)}
                        className={`flex-1 py-1 rounded-lg text-xs font-semibold transition-colors border ${
                          presetRepeat === v
                            ? "bg-primary/15 border-primary text-primary"
                            : "border-border text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        {repeatLabel(v)}
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                    Generate from page
                  </p>
                  <button
                    onClick={() => applyPreset("ayah")}
                    className="w-full text-left text-xs px-2.5 py-2 rounded-lg hover:bg-muted transition-colors flex items-center gap-2"
                  >
                    <span className="text-base leading-none">🕌</span>
                    <div>
                      <div className="font-medium">Ayah-by-Ayah</div>
                      <div className="text-[10px] text-muted-foreground">
                        One segment per verse
                      </div>
                    </div>
                  </button>
                  <button
                    onClick={() => applyPreset("line")}
                    className="w-full text-left text-xs px-2.5 py-2 rounded-lg hover:bg-muted transition-colors flex items-center gap-2"
                  >
                    <span className="text-base leading-none">📄</span>
                    <div>
                      <div className="font-medium">Line-by-Line</div>
                      <div className="text-[10px] text-muted-foreground">
                        One segment per visual line
                      </div>
                    </div>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Close */}
          <button
            onClick={() => setQueuePanelOpen(false)}
            className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-muted text-muted-foreground transition-colors"
            aria-label="Close queue panel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Shared queue banner */}
        {isSharedQueue && hasQueue && (
          <div className="flex-shrink-0 bg-blue-500/10 border-b border-blue-500/20 px-3 py-2.5">
            <div className="flex items-start gap-2">
              <ExternalLink className="w-3.5 h-3.5 text-blue-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-medium text-blue-600 dark:text-blue-400 leading-snug">
                  Shared queue (read-only)
                </p>
                <button
                  onClick={handleDuplicate}
                  className="mt-1 flex items-center gap-1 text-[10px] text-blue-500 hover:text-blue-700 dark:hover:text-blue-300 transition-colors font-medium"
                >
                  <Copy className="w-2.5 h-2.5" />
                  Duplicate to edit
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Set all per-item repeats — hidden for shared (read-only) queues */}
        {hasQueue && !isSharedQueue && (
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border flex-shrink-0 bg-muted/30">
            <span className="text-[10px] text-muted-foreground font-medium flex-1">
              Set all
            </span>
            <div className="flex gap-1">
              {REPEAT_OPTIONS.map((v) => (
                <button
                  key={v}
                  onClick={() => setQueueRepeatAll(v)}
                  className={`min-w-[28px] h-[20px] rounded border text-[9px] font-bold transition-colors px-1.5 ${
                    queueRepeatAll === v
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:border-primary hover:text-primary"
                  }`}
                >
                  {repeatLabel(v)}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Queue-level loop count */}
        {hasQueue && (
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border flex-shrink-0 bg-muted/30">
            <span className="text-[10px] text-muted-foreground font-medium flex-1">
              Queue loops
            </span>
            <div className="flex gap-1">
              {LOOP_OPTIONS.map((v) => (
                <button
                  key={v}
                  onClick={() => setQueueLoopCount(v)}
                  className={`min-w-[28px] h-[20px] rounded border text-[9px] font-bold transition-colors px-1.5 ${
                    queueLoopCount === v
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:border-primary hover:text-primary"
                  }`}
                >
                  {repeatLabel(v)}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {!hasQueue && (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 text-center">
            <ListMusic className="w-10 h-10 text-muted-foreground/25" />
            <p className="text-sm text-muted-foreground leading-relaxed">
              Select words and press{" "}
              <span className="font-medium text-foreground">✓</span> to add
              segments, or use{" "}
              <span className="inline-flex items-center gap-0.5">
                <Sparkles className="w-3 h-3" />
                Presets
              </span>{" "}
              to generate from the current page.
            </p>
          </div>
        )}

        {/* Queue list */}
        {hasQueue && (
          <div className="flex-1 overflow-y-auto py-1">
            {reviewQueue.map((item, index) => {
              const isActive = activeQueueItemId === item.id;
              const isPlaying = queueIsPlaying && activeItemIndex === index;

              return (
                <div
                  key={item.id}
                  draggable={!isSharedQueue}
                  onDragStart={!isSharedQueue ? handleDragStart(index) : undefined}
                  onDragOver={!isSharedQueue ? handleDragOver(index) : undefined}
                  onDrop={!isSharedQueue ? handleDrop(index) : undefined}
                  onDragEnd={!isSharedQueue ? handleDragEnd : undefined}
                  onClick={() => handleItemClick(item)}
                  className={`flex items-center gap-1.5 px-2.5 py-2 cursor-pointer select-none transition-colors group ${
                    isActive
                      ? "bg-primary/10 border-l-2 border-primary"
                      : "hover:bg-muted/60 border-l-2 border-transparent"
                  } ${dragOverIndex === index ? "opacity-50" : ""}`}
                >
                  {/* Drag handle (hidden for shared queues) */}
                  {!isSharedQueue && (
                    <div
                      className="text-muted-foreground/30 cursor-grab group-hover:text-muted-foreground/60 flex-shrink-0 transition-colors"
                      onMouseDown={(e) => e.stopPropagation()}
                    >
                      <GripVertical className="w-3 h-3" />
                    </div>
                  )}

                  {/* Index or playing indicator */}
                  <div className="w-4 flex-shrink-0 flex items-center justify-center">
                    {isPlaying ? (
                      <Music2 className="w-3 h-3 text-primary animate-pulse" />
                    ) : (
                      <span className="text-[10px] tabular-nums text-muted-foreground/50 font-medium">
                        {index + 1}
                      </span>
                    )}
                  </div>

                  {/* Label */}
                  <span
                    className={`flex-1 text-xs leading-snug truncate min-w-0 ${
                      isActive ? "font-semibold text-primary" : "text-foreground"
                    }`}
                  >
                    {item.label}
                  </span>

                  {/* Repeat badge */}
                  <RepeatBadge
                    count={item.repeatCount}
                    onCycle={() => !isSharedQueue && setQueueItemRepeat(item.id, nextRepeat(item.repeatCount))}
                  />

                  {/* Delete (hidden for shared queues) */}
                  {!isSharedQueue && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFromQueue(item.id);
                      }}
                      className="p-0.5 rounded hover:bg-destructive/10 hover:text-destructive text-muted-foreground/30 group-hover:text-muted-foreground/60 flex-shrink-0 transition-colors opacity-0 group-hover:opacity-100"
                      aria-label={`Remove ${item.label} from queue`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Footer */}
        {hasQueue && (
          <div className="flex-shrink-0 border-t border-border px-4 py-2.5 flex items-center justify-between">
            <span className="text-xs text-muted-foreground tabular-nums">
              {reviewQueue.length} segment{reviewQueue.length !== 1 ? "s" : ""}
            </span>
            <div className="flex items-center gap-2">
              {/* Share button */}
              <button
                onClick={handleShare}
                disabled={isSharing}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors disabled:opacity-50"
                title="Copy shareable link"
              >
                <Share2 className="w-3 h-3" />
                {isSharing ? "Saving…" : "Share"}
              </button>
              {!isSharedQueue && (
                <button
                  onClick={clearReviewQueue}
                  className="text-xs text-muted-foreground hover:text-destructive transition-colors"
                >
                  Clear all
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
