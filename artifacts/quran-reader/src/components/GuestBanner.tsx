import { useState, useEffect } from "react";
import { Cloud, X, LogIn } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import {
  getActionCount,
  getFirstActionDate,
  getDayStreakCount,
  isNudgeDismissed,
  dismissNudge,
  HAFITH_ACTION_EVENT,
} from "../storage/localTrackerStorage";

const NUDGE_THRESHOLD_ACTIONS = 3;

export default function GuestBanner() {
  const { isAuthenticated, isLoading, login } = useAuth();
  const [showNudge, setShowNudge] = useState(false);
  const [dayStreak, setDayStreak] = useState(1);

  function evalNudge() {
    const actions = getActionCount();
    const firstDate = getFirstActionDate();
    const dismissed = isNudgeDismissed();
    const streak = getDayStreakCount();

    setDayStreak(streak);

    if (!dismissed && actions >= NUDGE_THRESHOLD_ACTIONS && firstDate) {
      setShowNudge(true);
    }
  }

  useEffect(() => {
    if (isAuthenticated || isLoading) return;

    // Evaluate on mount
    evalNudge();

    // Re-evaluate whenever a meaningful action is recorded
    const handler = () => evalNudge();
    window.addEventListener(HAFITH_ACTION_EVENT, handler);
    return () => window.removeEventListener(HAFITH_ACTION_EVENT, handler);
  }, [isAuthenticated, isLoading]);

  if (isAuthenticated || isLoading) return null;

  const handleDismiss = () => {
    dismissNudge();
    setShowNudge(false);
  };

  return (
    <>
      {/* Subtle persistent pill */}
      <div className="px-4 pt-3 pb-0 max-w-2xl mx-auto">
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 text-amber-700 dark:text-amber-400">
          <Cloud className="w-3.5 h-3.5 flex-shrink-0" />
          <p className="text-xs flex-1 min-w-0">
            Saved on this device only.{" "}
            <button
              onClick={login}
              className="underline underline-offset-2 font-medium hover:text-amber-800 dark:hover:text-amber-300 transition-colors"
            >
              Sign in to back up your progress
            </button>
          </p>
        </div>
      </div>

      {/* One-time prominent nudge */}
      {showNudge && (
        <div className="px-4 pt-2 max-w-2xl mx-auto">
          <div className="relative flex items-start gap-3 px-4 py-3.5 rounded-xl bg-primary/5 border border-primary/20">
            <button
              onClick={handleDismiss}
              className="absolute top-2 right-2 p-1 rounded-md hover:bg-muted text-muted-foreground transition-colors"
              aria-label="Dismiss"
            >
              <X className="w-3.5 h-3.5" />
            </button>
            <div className="flex-1 min-w-0 pr-5">
              <p className="text-sm font-medium">
                You've built up {dayStreak} day{dayStreak !== 1 ? "s" : ""} of progress
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Sign in to back it up and use Hafith from any device.
              </p>
              <button
                onClick={login}
                className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
              >
                <LogIn className="w-3 h-3" />
                Sign in
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
