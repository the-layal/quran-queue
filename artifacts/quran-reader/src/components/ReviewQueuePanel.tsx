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
  ChevronDown,
  ChevronRight,
  Layers,
  Ungroup,
  CheckSquare,
  ArrowRight,
  ArrowLeft,
  Plus,
} from "lucide-react";
import SpeedSelector from "./SpeedSelector";
import { useQuranStore } from "../store/quranStore";
import { isSubQueue } from "../store/quranStore";
import type { SubQueue, QueueEntry } from "../store/quranStore";
import type { QueuePlaybackState } from "../hooks/useQueuePlayback";
import { computeQueueItemLabel } from "../utils/queueLabel";
import { toast } from "../hooks/use-toast";
import type { ReviewQueueItem } from "../store/quranStore";
import type { ChapterMap, BrushFineness, AudioDataMap } from "../types/quran";
import { loadAudioData } from "../services/quranApi";
import { computePlaybackRegions } from "../utils/audioRegions";
import { REPEAT_OPTIONS, clampRepeat, nextRepeat, repeatLabel } from "../utils/repeatOptions";
import {
  getPageLineData,
  splitIntoNSections,
  splitIntoGroupsOfN,
  previewSplitIntoNSections,
  previewGroupsOfN,
  type GroupedGranularity,
  type SectionPreview,
} from "../utils/subqueuePresets";

// ── Helpers ────────────────────────────────────────────────────────────────

function genId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function formatDuration(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = Math.floor(totalSeconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function computeItemDurationSec(
  item: ReviewQueueItem,
  audioData: AudioDataMap,
  svgToJsonWordMap: Record<string, Record<number, number>>
): number {
  const regions = computePlaybackRegions(
    item.selectedWordIds,
    audioData,
    item.brushFineness,
    svgToJsonWordMap
  );
  return regions.reduce((sum, r) => sum + r.durationMs, 0) / 1000;
}

const LOOP_OPTIONS = [1, 2, 3, 0] as const;

// ── Preset generation ─────────────────────────────────────────────────────

function buildAyahPreset(repeatCount: number, chapters: ChapterMap): ReviewQueueItem[] {
  const ayahWordMap = new Map<string, string[]>();
  document
    .querySelectorAll<Element>('g[data-surah][data-aya][data-word-index-in-ayah][data-type="text"]')
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
    .querySelectorAll<Element>('g[data-line-number][data-surah][data-aya][data-word-index-in-ayah][data-type="text"]')
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
  title = "Tap to change repeat count",
}: {
  count: number;
  onCycle: () => void;
  title?: string;
}) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onCycle();
      }}
      className="flex-shrink-0 min-w-[26px] h-[18px] rounded-full border border-border text-[9px] font-bold tabular-nums text-muted-foreground hover:border-primary hover:text-primary transition-colors px-1.5 flex items-center justify-center"
      title={title}
    >
      {repeatLabel(count)}
    </button>
  );
}

// ── GroupedPresetSection ───────────────────────────────────────────────────

type GroupedMode = "split-n" | "groups-of-n";

function GroupedPresetSection({
  onApply,
  chapters,
}: {
  onApply: (subQueues: SubQueue[]) => void;
  chapters: ChapterMap;
}) {
  const [mode, setMode] = useState<GroupedMode>("split-n");
  const [n, setN] = useState(3);
  const [granularity, setGranularity] = useState<GroupedGranularity>("line");
  const [itemRepeat, setItemRepeat] = useState(1);
  const [subQueueRepeat, setSubQueueRepeat] = useState(1);
  const [preview, setPreview] = useState<SectionPreview[]>([]);

  // Recompute preview whenever params change
  useEffect(() => {
    const lines = getPageLineData();
    if (lines.length === 0) { setPreview([]); return; }
    const p = mode === "split-n"
      ? previewSplitIntoNSections(lines, n)
      : previewGroupsOfN(lines, n);
    setPreview(p);
  }, [mode, n]);

  const handleApply = () => {
    const lines = getPageLineData();
    if (lines.length === 0) return;
    const subQueues = mode === "split-n"
      ? splitIntoNSections(lines, n, granularity, chapters, itemRepeat, subQueueRepeat)
      : splitIntoGroupsOfN(lines, n, granularity, chapters, itemRepeat, subQueueRepeat);
    if (subQueues.length > 0) onApply(subQueues);
  };

  const changeN = (delta: number) => {
    setN((v) => Math.max(1, Math.min(20, v + delta)));
  };

  return (
    <div className="mt-2 pt-2 border-t border-border">
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
        Grouped presets
      </p>

      {/* Mode toggle */}
      <div className="flex rounded-lg border border-border overflow-hidden mb-2 text-[10px] font-semibold">
        <button
          onClick={() => setMode("split-n")}
          className={`flex-1 py-1 transition-colors ${mode === "split-n" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-muted"}`}
        >
          Split into N
        </button>
        <button
          onClick={() => setMode("groups-of-n")}
          className={`flex-1 py-1 transition-colors ${mode === "groups-of-n" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-muted"}`}
        >
          Groups of N
        </button>
      </div>

      {/* N stepper */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[10px] text-muted-foreground flex-1">
          {mode === "split-n" ? "Sections" : "Lines per group"}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => changeN(-1)}
            disabled={n <= 1}
            className="w-5 h-5 rounded border border-border text-muted-foreground hover:bg-muted flex items-center justify-center text-xs disabled:opacity-40"
          >
            −
          </button>
          <span className="text-xs font-semibold tabular-nums w-4 text-center">{n}</span>
          <button
            onClick={() => changeN(1)}
            disabled={n >= 20}
            className="w-5 h-5 rounded border border-border text-muted-foreground hover:bg-muted flex items-center justify-center text-xs disabled:opacity-40"
          >
            +
          </button>
        </div>
      </div>

      {/* Item granularity */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[10px] text-muted-foreground flex-1">Items</span>
        <div className="flex rounded-lg border border-border overflow-hidden text-[10px] font-semibold">
          <button
            onClick={() => setGranularity("line")}
            className={`px-2 py-0.5 transition-colors ${granularity === "line" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-muted"}`}
          >
            Line
          </button>
          <button
            onClick={() => setGranularity("ayah")}
            className={`px-2 py-0.5 transition-colors ${granularity === "ayah" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-muted"}`}
          >
            Ayah
          </button>
        </div>
      </div>

      {/* Item repeat */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[10px] text-muted-foreground flex-1">Repeat per item</span>
        <div className="flex gap-1">
          {REPEAT_OPTIONS.map((v) => (
            <button
              key={v}
              onClick={() => setItemRepeat(v)}
              className={`min-w-[22px] h-[18px] rounded border text-[9px] font-bold transition-colors px-1 ${
                itemRepeat === v
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:border-primary hover:text-primary"
              }`}
            >
              {repeatLabel(v)}
            </button>
          ))}
        </div>
      </div>

      {/* Group repeat */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[10px] text-muted-foreground flex-1">Repeat per group</span>
        <div className="flex gap-1">
          {REPEAT_OPTIONS.map((v) => (
            <button
              key={v}
              onClick={() => setSubQueueRepeat(v)}
              className={`min-w-[22px] h-[18px] rounded border text-[9px] font-bold transition-colors px-1 ${
                subQueueRepeat === v
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:border-primary hover:text-primary"
              }`}
            >
              {repeatLabel(v)}
            </button>
          ))}
        </div>
      </div>

      {/* Live preview */}
      {preview.length > 0 && (
        <div className="mb-2 rounded-lg bg-muted/40 p-2">
          <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">
            Preview — {preview.length} group{preview.length !== 1 ? "s" : ""}
          </p>
          <div className="flex flex-col gap-0.5 max-h-20 overflow-y-auto">
            {preview.map((s, i) => (
              <span key={i} className="text-[10px] text-foreground tabular-nums">
                {i + 1}. {s.label}
              </span>
            ))}
          </div>
        </div>
      )}

      {preview.length === 0 && (
        <p className="text-[10px] text-muted-foreground italic mb-2">
          No Mushaf page visible
        </p>
      )}

      <button
        onClick={handleApply}
        disabled={preview.length === 0}
        className="w-full py-1.5 rounded-lg bg-primary/10 border border-primary/30 text-primary text-[11px] font-semibold hover:bg-primary/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
      >
        <Layers className="w-3 h-3" />
        Generate {preview.length > 0 ? `${preview.length} groups` : "groups"}
      </button>
    </div>
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
  const setSubQueueRepeatAll = useQuranStore((s) => s.setSubQueueRepeatAll);
  const queueLoopCount = useQuranStore((s) => s.queueLoopCount);
  const setQueueLoopCount = useQuranStore((s) => s.setQueueLoopCount);
  const setReviewQueue = useQuranStore((s) => s.setReviewQueue);
  const setQueueEntries = useQuranStore((s) => s.setQueueEntries);
  const setIsSharedQueue = useQuranStore((s) => s.setIsSharedQueue);
  const svgToJsonWordMap = useQuranStore((s) => s.svgToJsonWordMap);
  const addSubQueue = useQuranStore((s) => s.addSubQueue);
  const dissolveSubQueue = useQuranStore((s) => s.dissolveSubQueue);
  const setSubQueueRepeat = useQuranStore((s) => s.setSubQueueRepeat);
  const toggleSubQueueCollapsed = useQuranStore((s) => s.toggleSubQueueCollapsed);
  const reorderItemInSubQueue = useQuranStore((s) => s.reorderItemInSubQueue);
  const promoteToSubQueue = useQuranStore((s) => s.promoteToSubQueue);
  const moveQueueItem = useQuranStore((s) => s.moveQueueItem);
  const renameSubQueue = useQuranStore((s) => s.renameSubQueue);

  const { queueIsPlaying, activeItemIndex, activeSubItemIndex, playQueue, pauseQueue, stopQueue } =
    queuePlayback;

  // Drag state — encodes location as "top:<index>", "sub:<sqId>:<index>", or "sub-header:<sqId>"
  const dragFromRef = useRef<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null); // only for sub-header "append" highlight

  type DropIndicator =
    | { kind: "top"; insertBefore: number }
    | { kind: "sub"; subQueueId: string; insertBefore: number };
  const [dropIndicator, setDropIndicator] = useState<DropIndicator | null>(null);

  // Inline rename state for subqueue labels
  const [renamingSubQueueId, setRenamingSubQueueId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [isSharing, setIsSharing] = useState(false);

  // Multi-select mode for promoting flat items into a subqueue
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());

  const toggleSelectMode = () => {
    setSelectMode((v) => !v);
    setSelectedIndices(new Set());
  };

  const toggleSelectIndex = (i: number) => {
    setSelectedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const handleGroupSelected = () => {
    if (selectedIndices.size < 2) return;
    promoteToSubQueue(Array.from(selectedIndices).sort((a, b) => a - b), "Group");
    setSelectMode(false);
    setSelectedIndices(new Set());
  };

  // Duration map: item.id → duration in seconds
  const [durationMap, setDurationMap] = useState<Record<string, number>>({});
  const audioDataRef = useRef<AudioDataMap | null>(null);
  const audioDataReciterIdRef = useRef<string | null>(null);
  const selectedReciterId = useQuranStore((s) => s.selectedReciterId);

  // Flat list of all ReviewQueueItems for duration computation
  const allItems: ReviewQueueItem[] = reviewQueue.flatMap((entry) =>
    isSubQueue(entry) ? entry.items : [entry as ReviewQueueItem]
  );

  useEffect(() => {
    let cancelled = false;
    async function computeDurations() {
      if (
        !audioDataRef.current ||
        audioDataReciterIdRef.current !== selectedReciterId
      ) {
        try {
          audioDataRef.current = await loadAudioData(selectedReciterId);
          audioDataReciterIdRef.current = selectedReciterId;
        } catch {
          return;
        }
      }
      if (cancelled) return;
      const aData = audioDataRef.current;
      const map: Record<string, number> = {};
      for (const item of allItems) {
        map[item.id] = computeItemDurationSec(item, aData, svgToJsonWordMap);
      }
      setDurationMap(map);
    }
    computeDurations();
    return () => { cancelled = true; };
  }, [reviewQueue, svgToJsonWordMap, selectedReciterId]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // ── Drag helpers ──────────────────────────────────────────────────────────

  // Parse drag-from string into a typed source descriptor.
  const parseDragFrom = (key: string) => {
    if (key.startsWith("top:")) {
      return { type: "top" as const, index: parseInt(key.split(":")[1], 10) };
    }
    if (key.startsWith("sub:")) {
      const parts = key.split(":");
      return { type: "sub" as const, subQueueId: parts[1], index: parseInt(parts[2], 10) };
    }
    return null;
  };

  // ── Drag-to-reorder (top-level) ───────────────────────────────────────────

  const handleTopDragStart = (index: number) => (e: React.DragEvent) => {
    dragFromRef.current = `top:${index}`;
    e.dataTransfer.effectAllowed = "move";
  };

  const handleTopDragOver = (index: number) => (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const insertBefore = e.clientY < rect.top + rect.height / 2 ? index : index + 1;
    setDropIndicator({ kind: "top", insertBefore });
    setDragOverKey(null);
  };

  const handleTopDrop = (index: number) => (e: React.DragEvent) => {
    e.preventDefault();
    const fromKey = dragFromRef.current;
    if (fromKey) {
      const from = parseDragFrom(fromKey);
      if (from) {
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const insertBefore = e.clientY < rect.top + rect.height / 2 ? index : index + 1;
        if (from.type === "top") {
          // Convert insertBefore (original-array position) to post-removal splice index
          const toIndex = from.index < insertBefore ? insertBefore - 1 : insertBefore;
          if (from.index !== toIndex) reorderQueue(from.index, toIndex);
        } else {
          moveQueueItem(from, { type: "top", index: insertBefore });
        }
      }
    }
    dragFromRef.current = null;
    setDropIndicator(null);
    setDragOverKey(null);
  };

  const handleDragEnd = () => {
    dragFromRef.current = null;
    setDropIndicator(null);
    setDragOverKey(null);
  };

  // ── Drag-to-reorder / move (within or across subqueues) ──────────────────

  const handleSubDragStart = (subQueueId: string, index: number) => (e: React.DragEvent) => {
    e.stopPropagation();
    dragFromRef.current = `sub:${subQueueId}:${index}`;
    e.dataTransfer.effectAllowed = "move";
  };

  const handleSubDragOver = (subQueueId: string, index: number) => (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const insertBefore = e.clientY < rect.top + rect.height / 2 ? index : index + 1;
    setDropIndicator({ kind: "sub", subQueueId, insertBefore });
    setDragOverKey(null);
  };

  const handleSubDrop = (subQueueId: string, index: number) => (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const fromKey = dragFromRef.current;
    if (fromKey) {
      const from = parseDragFrom(fromKey);
      if (from) {
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const insertBefore = e.clientY < rect.top + rect.height / 2 ? index : index + 1;
        const sameSubqueue = from.type === "sub" && from.subQueueId === subQueueId;
        if (sameSubqueue) {
          const toIndex = from.index < insertBefore ? insertBefore - 1 : insertBefore;
          if (from.index !== toIndex) reorderItemInSubQueue(subQueueId, from.index, toIndex);
        } else {
          moveQueueItem(from, { type: "sub", subQueueId, index: insertBefore });
        }
      }
    }
    dragFromRef.current = null;
    setDropIndicator(null);
    setDragOverKey(null);
  };

  // Drop onto a subqueue header → append item to that subqueue
  const handleSubHeaderDragOver = (subQueueId: string) => (e: React.DragEvent) => {
    const fromKey = dragFromRef.current;
    // Only allow individual items (not whole subqueues) to be dropped on headers
    if (!fromKey || fromKey.startsWith("top:")) {
      const from = fromKey ? parseDragFrom(fromKey) : null;
      if (from?.type === "top") {
        const entry = reviewQueue[from.index];
        if (isSubQueue(entry)) return; // don't allow dropping subqueues onto headers
      }
    }
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    setDragOverKey(`sub-header:${subQueueId}`);
  };

  const handleSubHeaderDrop = (subQueueId: string) => (e: React.DragEvent) => {
    const fromKey = dragFromRef.current;
    if (fromKey) {
      const from = parseDragFrom(fromKey);
      // If source is a whole subqueue, let the event bubble to the outer wrapper's drop handler
      if (from?.type === "top" && isSubQueue(reviewQueue[from.index])) return;
      e.preventDefault();
      e.stopPropagation();
      if (from) {
        if (from.type === "top") {
          moveQueueItem(from, { type: "sub", subQueueId, index: 0, append: true });
        } else if (from.type === "sub" && from.subQueueId !== subQueueId) {
          moveQueueItem(from, { type: "sub", subQueueId, index: 0, append: true });
        }
      }
    }
    dragFromRef.current = null;
    setDropIndicator(null);
    setDragOverKey(null);
  };

  // ── Inline rename helpers ─────────────────────────────────────────────────

  const startRename = (sq: SubQueue) => {
    setRenamingSubQueueId(sq.id);
    setRenameValue(sq.label);
  };

  const commitRename = () => {
    if (renamingSubQueueId && renameValue.trim()) {
      renameSubQueue(renamingSubQueueId, renameValue.trim());
    }
    setRenamingSubQueueId(null);
  };

  // ── Indent / unindent helpers ─────────────────────────────────────────────

  // Move a flat item into the nearest subqueue (preceding, or following if none).
  const indentItem = (topIndex: number) => {
    // Look for a subqueue above first, then below
    for (let i = topIndex - 1; i >= 0; i--) {
      if (isSubQueue(reviewQueue[i])) {
        const sq = reviewQueue[i] as SubQueue;
        moveQueueItem({ type: "top", index: topIndex }, { type: "sub", subQueueId: sq.id, index: 0, append: true });
        return;
      }
    }
    for (let i = topIndex + 1; i < reviewQueue.length; i++) {
      if (isSubQueue(reviewQueue[i])) {
        const sq = reviewQueue[i] as SubQueue;
        moveQueueItem({ type: "top", index: topIndex }, { type: "sub", subQueueId: sq.id, index: 0 });
        return;
      }
    }
  };

  // Move a sub-item out to the top level, right after its parent subqueue.
  const unindentItem = (sqId: string, subIndex: number, topIndex: number) => {
    moveQueueItem(
      { type: "sub", subQueueId: sqId, index: subIndex },
      { type: "top", index: topIndex + 1 }
    );
  };

  // ── Add group ─────────────────────────────────────────────────────────────

  const pendingRenameRef = useRef(false);

  useEffect(() => {
    if (!pendingRenameRef.current) return;
    // Find the last SubQueue in the queue (the one just added) and start renaming it
    for (let i = reviewQueue.length - 1; i >= 0; i--) {
      if (isSubQueue(reviewQueue[i])) {
        pendingRenameRef.current = false;
        startRename(reviewQueue[i] as SubQueue);
        break;
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviewQueue.length]);

  const handleAddGroup = () => {
    pendingRenameRef.current = true;
    addSubQueue({ label: "New Group", repeatCount: 1, items: [], collapsed: false });
  };

  // ── Item click ───────────────────────────────────────────────────────────

  const handleItemClick = (entry: QueueEntry, topIndex: number) => {
    if (isSubQueue(entry)) {
      if (queueIsPlaying) {
        playQueue(topIndex, 0);
      } else {
        // Just collapse/expand on click when not playing
        toggleSubQueueCollapsed(entry.id);
      }
    } else {
      const item = entry as ReviewQueueItem;
      if (queueIsPlaying) {
        playQueue(topIndex, 0);
      } else {
        setActiveQueueItemId(item.id);
        setSelectedWordIds(item.selectedWordIds);
        setBrushFineness(item.brushFineness);
      }
    }
  };

  const handleSubItemClick = (item: ReviewQueueItem, topIndex: number, subIndex: number) => {
    if (queueIsPlaying) {
      playQueue(topIndex, subIndex);
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
    if (items.length > 0) setReviewQueue(items);
    setShowPresets(false);
  };

  const applyGroupedPreset = (subQueues: SubQueue[]) => {
    // Replace the entire queue with the generated subqueues
    setQueueEntries(subQueues);
    setShowPresets(false);
  };

  // ── Header play button logic ─────────────────────────────────────────────

  const handleHeaderPlay = () => {
    if (queueIsPlaying) {
      pauseQueue();
    } else if (activeItemIndex !== null) {
      playQueue(activeItemIndex, activeSubItemIndex ?? 0);
    } else {
      playQueue(0, 0);
    }
  };

  const handleHeaderStop = (e: React.MouseEvent) => {
    e.stopPropagation();
    stopQueue();
  };

  // ── Share ─────────────────────────────────────────────────────────────────

  const handleShare = async () => {
    const flatItems = reviewQueue.flatMap((entry) =>
      isSubQueue(entry) ? entry.items : [entry as ReviewQueueItem]
    );
    if (flatItems.length === 0 || isSharing) return;
    setIsSharing(true);
    try {
      const res = await fetch("/api/queues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: flatItems }),
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

  // Count of top-level entries + leaf items for display
  const totalLeafItems = allItems.length;
  const hasSubQueues = reviewQueue.some((e) => isSubQueue(e));

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
              ({totalLeafItems})
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

          {/* Stop */}
          {hasQueue && activeItemIndex !== null && (
            <button
              onClick={handleHeaderStop}
              className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors border border-border text-muted-foreground hover:bg-muted"
              aria-label="Stop queue"
              title="Stop queue"
            >
              <Square className="w-3 h-3" />
            </button>
          )}

          {/* Select mode toggle — only for non-shared queues with flat items */}
          {!isSharedQueue && hasQueue && reviewQueue.some((e) => !isSubQueue(e)) && (
            <button
              onClick={toggleSelectMode}
              className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors border ${
                selectMode
                  ? "bg-primary/15 border-primary text-primary"
                  : "border-border text-muted-foreground hover:bg-muted"
              }`}
              aria-label={selectMode ? "Exit select mode" : "Select items to group"}
              title={selectMode ? "Exit select mode" : "Select items to group"}
            >
              <CheckSquare className="w-3.5 h-3.5" />
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
                  className="absolute top-full right-0 mt-1.5 z-[60] bg-card border border-border rounded-xl shadow-xl p-3 w-56 max-h-[80vh] overflow-y-auto"
                >
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

                  {/* Flat preset options */}
                  <div className="mt-2 pt-2 border-t border-border/60 flex flex-col gap-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground flex-1">Repeat per item</span>
                      <div className="flex gap-1">
                        {REPEAT_OPTIONS.map((v) => (
                          <button
                            key={v}
                            onClick={() => setPresetRepeat(v)}
                            className={`min-w-[22px] h-[18px] rounded border text-[9px] font-bold transition-colors px-1 ${
                              clampRepeat(presetRepeat) === v
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-border text-muted-foreground hover:border-primary hover:text-primary"
                            }`}
                          >
                            {repeatLabel(v)}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground flex-1">Repeat per page</span>
                      <div className="flex gap-1">
                        {LOOP_OPTIONS.map((v) => (
                          <button
                            key={v}
                            onClick={() => setQueueLoopCount(v)}
                            className={`min-w-[22px] h-[18px] rounded border text-[9px] font-bold transition-colors px-1 ${
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
                  </div>

                  <GroupedPresetSection
                    onApply={applyGroupedPreset}
                    chapters={chapters}
                  />
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

        {/* Set all (items) — hidden for shared (read-only) queues */}
        {hasQueue && !isSharedQueue && (
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border flex-shrink-0 bg-muted/30">
            <span className="text-[10px] text-muted-foreground font-medium flex-1">
              Set all (items)
            </span>
            <div className="flex gap-1">
              {REPEAT_OPTIONS.map((v) => (
                <button
                  key={v}
                  onClick={() => setQueueRepeatAll(v)}
                  className={`min-w-[28px] h-[20px] rounded border text-[9px] font-bold transition-colors px-1.5 ${
                    clampRepeat(queueRepeatAll) === v
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

        {/* Set all (subqueues) — only when subqueues exist */}
        {hasQueue && !isSharedQueue && hasSubQueues && (
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border flex-shrink-0 bg-muted/30">
            <span className="text-[10px] text-muted-foreground font-medium flex-1">
              Set all (groups)
            </span>
            <div className="flex gap-1">
              {REPEAT_OPTIONS.map((v) => (
                <button
                  key={v}
                  onClick={() => setSubQueueRepeatAll(v)}
                  className={`min-w-[28px] h-[20px] rounded border text-[9px] font-bold transition-colors px-1.5 ${
                    reviewQueue
                      .filter(isSubQueue)
                      .every((e) => clampRepeat((e as SubQueue).repeatCount) === v)
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

        {/* Full Queue Loops */}
        {hasQueue && (
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border flex-shrink-0 bg-muted/30">
            <span className="text-[10px] text-muted-foreground font-medium flex-1">
              Full queue loops
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

        {/* Playback speed — last */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border flex-shrink-0 bg-muted/30">
          <span className="text-[10px] text-muted-foreground font-medium flex-1">
            Speed
          </span>
          <SpeedSelector />
        </div>

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

        {/* Select mode action bar */}
        {selectMode && (
          <div className="flex-shrink-0 flex items-center gap-2 px-3 py-2 border-b border-border bg-primary/5">
            <span className="text-[10px] text-muted-foreground flex-1">
              {selectedIndices.size === 0
                ? "Tap flat items to select"
                : `${selectedIndices.size} selected`}
            </span>
            <button
              onClick={handleGroupSelected}
              disabled={selectedIndices.size < 2}
              className="flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-lg bg-primary/15 border border-primary/40 text-primary hover:bg-primary/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Layers className="w-3 h-3" />
              Group {selectedIndices.size >= 2 ? selectedIndices.size : ""}
            </button>
            <button
              onClick={toggleSelectMode}
              className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
          </div>
        )}

        {/* Queue list */}
        {hasQueue && (
          <div className="flex-1 overflow-y-auto py-1">
            {reviewQueue.map((entry, topIndex) => {
              if (isSubQueue(entry)) {
                const sq = entry as SubQueue;
                const isGroupActive = activeItemIndex === topIndex;
                const isGroupPlaying = queueIsPlaying && isGroupActive;
                const groupRepeatCount = clampRepeat(sq.repeatCount);

                return (
                  <div
                    key={sq.id}
                    draggable={!isSharedQueue}
                    onDragStart={!isSharedQueue ? handleTopDragStart(topIndex) : undefined}
                    onDragOver={!isSharedQueue ? handleTopDragOver(topIndex) : undefined}
                    onDrop={!isSharedQueue ? handleTopDrop(topIndex) : undefined}
                    onDragEnd={!isSharedQueue ? handleDragEnd : undefined}
                    className="relative"
                  >
                    {/* Drop-line indicator above this group */}
                    {dropIndicator?.kind === "top" && dropIndicator.insertBefore === topIndex && (
                      <div className="absolute top-0 left-3 right-3 h-0.5 -translate-y-px bg-primary rounded-full z-20 pointer-events-none" />
                    )}
                    {/* SubQueue header */}
                    <div
                      onClick={() => renamingSubQueueId !== sq.id && handleItemClick(sq, topIndex)}
                      onDragOver={!isSharedQueue ? handleSubHeaderDragOver(sq.id) : undefined}
                      onDrop={!isSharedQueue ? handleSubHeaderDrop(sq.id) : undefined}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 cursor-pointer select-none transition-colors group ${
                        dragOverKey === `sub-header:${sq.id}`
                          ? "bg-primary/15 border-l-2 border-primary ring-1 ring-primary/30"
                          : isGroupActive
                            ? "bg-primary/8 border-l-2 border-primary"
                            : "hover:bg-muted/40 border-l-2 border-transparent"
                      }`}
                    >
                      {/* Drag handle */}
                      {!isSharedQueue && (
                        <div className="text-muted-foreground/30 cursor-grab group-hover:text-muted-foreground/60 flex-shrink-0 transition-colors">
                          <GripVertical className="w-3 h-3" />
                        </div>
                      )}

                      {/* Collapse chevron */}
                      <div className="flex-shrink-0 text-muted-foreground/60">
                        {sq.collapsed ? (
                          <ChevronRight className="w-3 h-3" />
                        ) : (
                          <ChevronDown className="w-3 h-3" />
                        )}
                      </div>

                      {/* Playing indicator */}
                      <div className="w-4 flex-shrink-0 flex items-center justify-center">
                        {isGroupPlaying ? (
                          <Music2 className="w-3 h-3 text-primary animate-pulse" />
                        ) : (
                          <Layers className="w-3 h-3 text-muted-foreground/50" />
                        )}
                      </div>

                      {/* Label — double-click to rename */}
                      {renamingSubQueueId === sq.id ? (
                        <input
                          autoFocus
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onBlur={commitRename}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") commitRename();
                            if (e.key === "Escape") setRenamingSubQueueId(null);
                            e.stopPropagation();
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="flex-1 text-xs font-semibold bg-transparent border-b border-primary outline-none min-w-0 text-primary"
                        />
                      ) : (
                        <span
                          onDoubleClick={(e) => {
                            if (!isSharedQueue) { e.stopPropagation(); startRename(sq); }
                          }}
                          title={!isSharedQueue ? "Double-click to rename" : undefined}
                          className={`flex-1 text-xs font-semibold leading-snug truncate min-w-0 ${
                            isGroupActive ? "text-primary" : "text-foreground"
                          }`}
                        >
                          {sq.label}
                        </span>
                      )}

                      {/* Group repeat badge */}
                      {!isSharedQueue && (
                        <RepeatBadge
                          count={groupRepeatCount}
                          onCycle={() => setSubQueueRepeat(sq.id, nextRepeat(groupRepeatCount))}
                          title="Group repeat count"
                        />
                      )}

                      {/* Dissolve button */}
                      {!isSharedQueue && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            dissolveSubQueue(sq.id);
                          }}
                          className="p-0.5 rounded hover:bg-muted text-muted-foreground/30 group-hover:text-muted-foreground/60 flex-shrink-0 transition-colors opacity-0 group-hover:opacity-100"
                          aria-label={`Dissolve group ${sq.label}`}
                          title="Dissolve group"
                        >
                          <Ungroup className="w-3 h-3" />
                        </button>
                      )}

                      {/* Remove subqueue */}
                      {!isSharedQueue && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeFromQueue(sq.id);
                          }}
                          className="p-0.5 rounded hover:bg-destructive/10 hover:text-destructive text-muted-foreground/30 group-hover:text-muted-foreground/60 flex-shrink-0 transition-colors opacity-0 group-hover:opacity-100"
                          aria-label={`Remove group ${sq.label}`}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>

                    {/* SubQueue items (collapsed hides them) */}
                    {!sq.collapsed && sq.items.map((item, subIndex) => {
                      const isActive = activeQueueItemId === item.id;
                      const isItemPlaying = queueIsPlaying && isGroupActive && activeSubItemIndex === subIndex;

                      return (
                        <div
                          key={item.id}
                          draggable={!isSharedQueue}
                          onDragStart={!isSharedQueue ? handleSubDragStart(sq.id, subIndex) : undefined}
                          onDragOver={!isSharedQueue ? handleSubDragOver(sq.id, subIndex) : undefined}
                          onDrop={!isSharedQueue ? handleSubDrop(sq.id, subIndex) : undefined}
                          onDragEnd={!isSharedQueue ? handleDragEnd : undefined}
                          onClick={() => handleSubItemClick(item, topIndex, subIndex)}
                          className={`relative flex items-center gap-1.5 pl-8 pr-2.5 py-1.5 cursor-pointer select-none transition-colors group ${
                            isActive
                              ? "bg-primary/10 border-l-2 border-primary"
                              : "hover:bg-muted/60 border-l-2 border-transparent"
                          }`}
                        >
                          {/* Drop-line indicator */}
                          {dropIndicator?.kind === "sub" && dropIndicator.subQueueId === sq.id && dropIndicator.insertBefore === subIndex && (
                            <div className="absolute top-0 left-6 right-2 h-0.5 -translate-y-px bg-primary rounded-full z-20 pointer-events-none" />
                          )}
                          {!isSharedQueue && (
                            <div className="text-muted-foreground/30 cursor-grab group-hover:text-muted-foreground/60 flex-shrink-0 transition-colors">
                              <GripVertical className="w-3 h-3" />
                            </div>
                          )}

                          <div className="w-4 flex-shrink-0 flex items-center justify-center">
                            {isItemPlaying ? (
                              <Music2 className="w-3 h-3 text-primary animate-pulse" />
                            ) : (
                              <span className="text-[10px] tabular-nums text-muted-foreground/40 font-medium">
                                {subIndex + 1}
                              </span>
                            )}
                          </div>

                          <span
                            className={`flex-1 text-xs leading-snug truncate min-w-0 ${
                              isActive ? "font-semibold text-primary" : "text-foreground"
                            }`}
                          >
                            {item.label}
                          </span>

                          {durationMap[item.id] !== undefined && durationMap[item.id] > 0 && (
                            <span className="flex-shrink-0 text-[10px] tabular-nums text-muted-foreground/70">
                              {formatDuration(durationMap[item.id])}
                            </span>
                          )}

                          <RepeatBadge
                            count={clampRepeat(item.repeatCount)}
                            onCycle={() => !isSharedQueue && setQueueItemRepeat(item.id, nextRepeat(clampRepeat(item.repeatCount)))}
                          />

                          {!isSharedQueue && (
                            <button
                              onClick={(e) => { e.stopPropagation(); unindentItem(sq.id, subIndex, topIndex); }}
                              className="p-0.5 rounded hover:bg-muted text-muted-foreground/30 group-hover:text-muted-foreground/60 flex-shrink-0 transition-colors opacity-0 group-hover:opacity-100"
                              aria-label="Move out of group"
                              title="Move out of group"
                            >
                              <ArrowLeft className="w-3 h-3" />
                            </button>
                          )}

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

                    {/* Drop-line at end of subqueue items */}
                    {dropIndicator?.kind === "sub" && dropIndicator.subQueueId === sq.id && dropIndicator.insertBefore === sq.items.length && (
                      <div className="h-1 relative mx-6 pointer-events-none">
                        <div className="absolute inset-x-0 top-0.5 h-0.5 bg-primary rounded-full" />
                      </div>
                    )}
                  </div>
                );
              }

              // Flat ReviewQueueItem
              const item = entry as ReviewQueueItem;
              const isActive = activeQueueItemId === item.id;
              const isItemPlaying = queueIsPlaying && activeItemIndex === topIndex && activeSubItemIndex === null;
              const isChecked = selectedIndices.has(topIndex);

              return (
                <div
                  key={item.id}
                  draggable={!isSharedQueue && !selectMode}
                  onDragStart={!isSharedQueue && !selectMode ? handleTopDragStart(topIndex) : undefined}
                  onDragOver={!isSharedQueue && !selectMode ? handleTopDragOver(topIndex) : undefined}
                  onDrop={!isSharedQueue && !selectMode ? handleTopDrop(topIndex) : undefined}
                  onDragEnd={!isSharedQueue && !selectMode ? handleDragEnd : undefined}
                  onClick={() => selectMode ? toggleSelectIndex(topIndex) : handleItemClick(item, topIndex)}
                  className={`relative flex items-center gap-1.5 px-2.5 py-2 cursor-pointer select-none transition-colors group ${
                    selectMode
                      ? isChecked
                        ? "bg-primary/10 border-l-2 border-primary"
                        : "hover:bg-muted/40 border-l-2 border-transparent"
                      : isActive
                        ? "bg-primary/10 border-l-2 border-primary"
                        : "hover:bg-muted/60 border-l-2 border-transparent"
                  }`}
                >
                  {/* Drop-line indicator */}
                  {dropIndicator?.kind === "top" && dropIndicator.insertBefore === topIndex && (
                    <div className="absolute top-0 left-3 right-3 h-0.5 -translate-y-px bg-primary rounded-full z-20 pointer-events-none" />
                  )}
                  {/* In select mode show a checkbox; otherwise show the drag handle */}
                  {selectMode ? (
                    <div className="flex-shrink-0 w-4 h-4 flex items-center justify-center">
                      <div className={`w-3.5 h-3.5 rounded border-2 flex items-center justify-center transition-colors ${
                        isChecked ? "bg-primary border-primary" : "border-muted-foreground/40"
                      }`}>
                        {isChecked && (
                          <svg viewBox="0 0 10 10" className="w-2 h-2 text-white fill-none stroke-current stroke-[2]">
                            <polyline points="1.5,5 4,7.5 8.5,2.5" />
                          </svg>
                        )}
                      </div>
                    </div>
                  ) : (
                    !isSharedQueue && (
                      <div
                        className="text-muted-foreground/30 cursor-grab group-hover:text-muted-foreground/60 flex-shrink-0 transition-colors"
                        onMouseDown={(e) => e.stopPropagation()}
                      >
                        <GripVertical className="w-3 h-3" />
                      </div>
                    )
                  )}

                  <div className="w-4 flex-shrink-0 flex items-center justify-center">
                    {isItemPlaying ? (
                      <Music2 className="w-3 h-3 text-primary animate-pulse" />
                    ) : (
                      <span className="text-[10px] tabular-nums text-muted-foreground/50 font-medium">
                        {topIndex + 1}
                      </span>
                    )}
                  </div>

                  <span
                    className={`flex-1 text-xs leading-snug truncate min-w-0 ${
                      (selectMode ? isChecked : isActive) ? "font-semibold text-primary" : "text-foreground"
                    }`}
                  >
                    {item.label}
                  </span>

                  {durationMap[item.id] !== undefined && durationMap[item.id] > 0 && (
                    <span className="flex-shrink-0 text-[10px] tabular-nums text-muted-foreground/70">
                      {formatDuration(durationMap[item.id])}
                    </span>
                  )}

                  <RepeatBadge
                    count={clampRepeat(item.repeatCount)}
                    onCycle={() => !isSharedQueue && setQueueItemRepeat(item.id, nextRepeat(clampRepeat(item.repeatCount)))}
                  />

                  {!isSharedQueue && hasSubQueues && !selectMode && (
                    <button
                      onClick={(e) => { e.stopPropagation(); indentItem(topIndex); }}
                      className="p-0.5 rounded hover:bg-muted text-muted-foreground/30 group-hover:text-muted-foreground/60 flex-shrink-0 transition-colors opacity-0 group-hover:opacity-100"
                      aria-label="Move into group"
                      title="Move into nearest group"
                    >
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  )}

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

            {/* Drop-line at end of top-level list */}
            {dropIndicator?.kind === "top" && dropIndicator.insertBefore === reviewQueue.length && (
              <div className="h-1 relative mx-3 pointer-events-none">
                <div className="absolute inset-x-0 top-0.5 h-0.5 bg-primary rounded-full" />
              </div>
            )}

            {/* Add group button */}
            {!isSharedQueue && (
              <button
                onClick={handleAddGroup}
                className="w-full flex items-center gap-1.5 px-3 py-2 text-[10px] text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/40 transition-colors"
              >
                <Plus className="w-3 h-3" />
                Add group
              </button>
            )}
          </div>
        )}

        {/* Footer */}
        {hasQueue && (
          <div className="flex-shrink-0 border-t border-border px-4 py-2.5 flex flex-col gap-1.5">
            {(() => {
              const hasDurations = Object.keys(durationMap).length > 0;
              if (!hasDurations) return null;

              const anyItemInfinite = allItems.some((item) => clampRepeat(item.repeatCount) === 0);
              const anyGroupInfinite = reviewQueue.some((e) => isSubQueue(e) && clampRepeat((e as SubQueue).repeatCount) === 0);
              const queueInfinite = queueLoopCount === 0;

              if (anyItemInfinite || anyGroupInfinite || queueInfinite) {
                return (
                  <div className="text-[10px] text-muted-foreground leading-snug">
                    Total: <span className="font-semibold text-foreground">∞</span>
                  </div>
                );
              }

              // Compute total duration accounting for subqueue group repeats
              let perPassSec = 0;
              for (const entry of reviewQueue) {
                if (isSubQueue(entry)) {
                  const sq = entry as SubQueue;
                  const sqDur = sq.items.reduce(
                    (sum, item) => sum + (durationMap[item.id] ?? 0) * clampRepeat(item.repeatCount),
                    0
                  );
                  perPassSec += sqDur * clampRepeat(sq.repeatCount);
                } else {
                  const item = entry as ReviewQueueItem;
                  perPassSec += (durationMap[item.id] ?? 0) * clampRepeat(item.repeatCount);
                }
              }
              if (perPassSec === 0) return null;

              const totalSec = perPassSec * queueLoopCount;
              const showLoopLine = queueLoopCount > 1;
              return (
                <div className="text-[10px] text-muted-foreground tabular-nums leading-snug">
                  {showLoopLine ? (
                    <span>
                      Total: {formatDuration(perPassSec)} × {queueLoopCount} loops ={" "}
                      <span className="font-semibold text-foreground">{formatDuration(totalSec)}</span>
                    </span>
                  ) : (
                    <span>
                      Total: <span className="font-semibold text-foreground">{formatDuration(totalSec)}</span>
                    </span>
                  )}
                </div>
              );
            })()}

            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground tabular-nums">
                {totalLeafItems} segment{totalLeafItems !== 1 ? "s" : ""}
                {hasSubQueues && (
                  <span className="ml-1 text-muted-foreground/60">
                    in {reviewQueue.filter((e) => isSubQueue(e)).length} group{reviewQueue.filter((e) => isSubQueue(e)).length !== 1 ? "s" : ""}
                  </span>
                )}
              </span>
              <div className="flex items-center gap-2">
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
          </div>
        )}
      </div>
    </>
  );
}
