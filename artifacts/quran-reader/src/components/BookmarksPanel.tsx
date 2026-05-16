import { Bookmark, BookmarkX } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "./ui/sheet";
import SavedVersesPanel from "./SavedVersesPanel";
import { useBookmarks } from "../hooks/useBookmarks";

interface BookmarksPanelProps {
  open: boolean;
  onClose: () => void;
}

export default function BookmarksPanel({ open, onClose }: BookmarksPanelProps) {
  const { bookmarks, isLoading } = useBookmarks();
  const isEmpty = !isLoading && bookmarks.length === 0;

  return (
    <Sheet open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <SheetContent
        side="right"
        className="flex flex-col p-0 w-80 sm:max-w-[320px] bg-card"
      >
        {/* Header — pr-10 leaves room for the Sheet's built-in close button */}
        <div className="flex items-center gap-2 px-4 py-3 pr-10 border-b border-border flex-shrink-0">
          <Bookmark className="w-4 h-4 text-primary flex-shrink-0" />
          <SheetTitle className="text-sm font-semibold flex-1">
            Saved Verses
          </SheetTitle>
          {!isLoading && bookmarks.length > 0 && (
            <span className="text-xs text-muted-foreground tabular-nums">
              ({bookmarks.length})
            </span>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          {isEmpty ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 px-6 text-center">
              <BookmarkX className="w-10 h-10 text-muted-foreground/40" />
              <p className="text-sm font-medium text-muted-foreground">No saved verses yet</p>
              <p className="text-xs text-muted-foreground/70 leading-relaxed">
                Tap the bookmark icon next to any verse in reading mode to save it here.
              </p>
            </div>
          ) : (
            <SavedVersesPanel onNavigate={onClose} insidePanel />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
