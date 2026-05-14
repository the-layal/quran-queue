import { X, Bookmark, BookmarkX } from "lucide-react";
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
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
          onClick={onClose}
        />
      )}

      <div
        className={`fixed z-50 flex flex-col bg-card shadow-2xl transition-transform duration-300 ease-in-out
          bottom-0 left-0 right-0 rounded-t-2xl border-t border-border max-h-[85vh]
          sm:inset-y-0 sm:bottom-auto sm:top-0 sm:left-auto sm:right-0 sm:h-full sm:w-80 sm:max-h-none sm:rounded-none sm:border-l sm:border-t-0
          ${open ? "" : "translate-y-full sm:translate-y-0 sm:translate-x-full"}`}
        aria-label="Saved verses"
        role="complementary"
      >
        <div className="relative flex items-center gap-2 px-4 pt-5 pb-3 sm:pt-3 border-b border-border flex-shrink-0">
          <div className="absolute left-1/2 -translate-x-1/2 top-2 w-10 h-1 bg-muted-foreground/25 rounded-full sm:hidden" />
          <Bookmark className="w-4 h-4 text-primary flex-shrink-0" />
          <span className="text-sm font-semibold flex-1 min-w-0">Saved Verses</span>
          {!isLoading && bookmarks.length > 0 && (
            <span className="text-xs text-muted-foreground tabular-nums">
              ({bookmarks.length})
            </span>
          )}
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-muted text-muted-foreground transition-colors"
            aria-label="Close bookmarks panel"
          >
            <X className="w-4 h-4" />
          </button>
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
      </div>
    </>
  );
}
