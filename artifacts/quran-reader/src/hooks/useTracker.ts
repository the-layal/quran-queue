import { useCallback, useEffect, useState } from "react";
import { useTrackerStorage } from "../context/useTrackerStorage";
import type {
  Log,
  SrsItem,
  DailyPlan,
  TrackerStats,
  LogInput,
  CompleteAdvancedInput,
} from "../storage/trackerStorage";

export type { Log, SrsItem, DailyPlan, TrackerStats, LogInput, CompleteAdvancedInput };

// Mastery helpers based on vibeScale of the latest log for a reference.
// Until the LogModal/paintbrush rewrite (task #151+) lands, components can
// derive mastery directly from a vibe value (1–5).
export function masteryLevelFromVibe(vibe: number | undefined): "new" | "struggling" | "reviewing" | "learning" | "mastered" {
  if (vibe === undefined) return "new";
  if (vibe <= 1) return "struggling";
  if (vibe === 2) return "reviewing";
  if (vibe === 3) return "learning";
  return "mastered";
}

export function masteryLabelFromVibe(vibe: number | undefined): string {
  return ({
    new: "New",
    struggling: "Struggling",
    reviewing: "Reviewing",
    learning: "Learning",
    mastered: "Mastered",
  } as const)[masteryLevelFromVibe(vibe)];
}

export function useLogs() {
  const { storage } = useTrackerStorage();
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    storage.getLogs()
      .then(setLogs)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [storage]);

  useEffect(() => { load(); }, [load]);

  return { logs, loading, error, reload: load };
}

export function useSrsItems() {
  const { storage } = useTrackerStorage();
  const [items, setItems] = useState<SrsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    storage.getSrsItems()
      .then(setItems)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [storage]);

  useEffect(() => { load(); }, [load]);

  return { items, loading, error, reload: load };
}

export function useStats() {
  const { storage } = useTrackerStorage();
  const [stats, setStats] = useState<TrackerStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    storage.getStats()
      .then(setStats)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [storage]);

  useEffect(() => { load(); }, [load]);

  return { stats, loading, error, reload: load };
}

export function useTodayPlan() {
  const { storage } = useTrackerStorage();
  const [plan, setPlan] = useState<DailyPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    storage.getTodayPlan()
      .then(setPlan)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [storage]);

  useEffect(() => { load(); }, [load]);

  return { plan, loading, error, reload: load };
}

export function usePostLog() {
  const { storage } = useTrackerStorage();
  return useCallback((input: LogInput) => storage.createLog(input), [storage]);
}
