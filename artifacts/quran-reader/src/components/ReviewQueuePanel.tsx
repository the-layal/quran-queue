import { useRef, useState } from "react";
import { X, GripVertical, ListMusic } from "lucide-react";
import { useQuranStore } from "../store/quranStore";
import type { ReviewQueueItem } from "../store/quranStore";

export default function ReviewQueuePanel() {
  const reviewQueue = useQuranStore((s) => s.reviewQueue);
  const activeQueueItemId = useQuranStore((s) => s.activeQueueItemId);
  const queuePanelOpen = useQuranStore((s) => s.queuePanelOpen);
  const setQueuePanelOpen = useQuranStore((s) => s.setQueuePanelOpen);
  const removeFromQueue = useQuranStore((s) => s.removeFromQueue);
  const reorderQueue = useQuranStore((s) => s.reorderQueue);
  const clearReviewQueue = useQuranStore((s) => s.clearReviewQueue);
  const setActiveQueueItemId = useQuranStore((s) => s.setActiveQueueItemId);
  const setSelectedWordIds = useQuranStore((s) => s.setSelectedWordIds);
  const setBrushFineness = useQuranStore((s) => s.setBrushFineness);

  const dragFromRef = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

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
    if (from !== null && from !== index) {
      reorderQueue(from, index);
    }
    dragFromRef.current = null;
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    dragFromRef.current = null;
    setDragOverIndex(null);
  };

  const handleItemClick = (item: ReviewQueueItem) => {
    setActiveQueueItemId(item.id);
    setSelectedWordIds(item.selectedWordIds);
    setBrushFineness(item.brushFineness);
  };

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
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2">
            <ListMusic className="w-4 h-4 text-primary flex-shrink-0" />
            <span className="text-sm font-semibold">Review Queue</span>
            {reviewQueue.length > 0 && (
              <span className="text-xs text-muted-foreground tabular-nums">
                ({reviewQueue.length})
              </span>
            )}
          </div>
          <button
            onClick={() => setQueuePanelOpen(false)}
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-colors"
            aria-label="Close queue panel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Empty state */}
        {reviewQueue.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 text-center">
            <ListMusic className="w-10 h-10 text-muted-foreground/25" />
            <p className="text-sm text-muted-foreground leading-relaxed">
              Select words and press{" "}
              <span className="font-medium text-foreground">✓</span> to add
              segments here.
            </p>
          </div>
        )}

        {/* Queue list */}
        {reviewQueue.length > 0 && (
          <div className="flex-1 overflow-y-auto py-2">
            {reviewQueue.map((item, index) => (
              <div
                key={item.id}
                draggable
                onDragStart={handleDragStart(index)}
                onDragOver={handleDragOver(index)}
                onDrop={handleDrop(index)}
                onDragEnd={handleDragEnd}
                onClick={() => handleItemClick(item)}
                className={`flex items-center gap-2 px-3 py-2.5 cursor-pointer select-none transition-colors group ${
                  activeQueueItemId === item.id
                    ? "bg-primary/10 border-l-2 border-primary pl-[10px]"
                    : "hover:bg-muted/60 border-l-2 border-transparent"
                } ${dragOverIndex === index ? "opacity-50" : ""}`}
              >
                {/* Drag handle */}
                <div
                  className="text-muted-foreground/40 cursor-grab group-hover:text-muted-foreground/70 flex-shrink-0 transition-colors"
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <GripVertical className="w-3.5 h-3.5" />
                </div>

                {/* Index */}
                <span className="text-[10px] tabular-nums text-muted-foreground/50 w-4 text-right flex-shrink-0 font-medium">
                  {index + 1}
                </span>

                {/* Label */}
                <span
                  className={`flex-1 text-xs leading-snug truncate ${
                    activeQueueItemId === item.id
                      ? "font-semibold text-primary"
                      : "text-foreground"
                  }`}
                >
                  {item.label}
                </span>

                {/* Delete */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFromQueue(item.id);
                  }}
                  className="p-1 rounded hover:bg-destructive/10 hover:text-destructive text-muted-foreground/30 group-hover:text-muted-foreground/60 flex-shrink-0 transition-colors opacity-0 group-hover:opacity-100"
                  aria-label={`Remove ${item.label} from queue`}
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        {reviewQueue.length > 0 && (
          <div className="flex-shrink-0 border-t border-border px-4 py-3 flex items-center justify-between">
            <span className="text-xs text-muted-foreground tabular-nums">
              {reviewQueue.length} segment{reviewQueue.length !== 1 ? "s" : ""}
            </span>
            <button
              onClick={clearReviewQueue}
              className="text-xs text-muted-foreground hover:text-destructive transition-colors"
            >
              Clear all
            </button>
          </div>
        )}
      </div>
    </>
  );
}
