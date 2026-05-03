import { useState, useEffect, useCallback } from "react";
import { useTrackerStorage } from "../context/useTrackerStorage";
import type { SrsItem, LogEntry, TrackerStats, DailyPlan, PlanItem } from "../storage/trackerStorage";

export type { SrsItem, LogEntry, TrackerStats, DailyPlan, PlanItem };

export function masteryLevel(ef: number, reps: number): "new" | "struggling" | "reviewing" | "learning" | "mastered" {
  if (reps === 0) return "new";
  if (ef < 1.5) return "struggling";
  if (ef < 2.0) return "reviewing";
  if (ef < 2.5 || reps < 5) return "learning";
  return "mastered";
}

export function masteryLabel(ef: number, reps: number): string {
  const level = masteryLevel(ef, reps);
  return { new: "New", struggling: "Struggling", reviewing: "Reviewing", learning: "Learning", mastered: "Mastered" }[level];
}

export function masteryColorClass(ef: number, reps: number): string {
  const level = masteryLevel(ef, reps);
  return {
    new: "bg-muted",
    struggling: "bg-orange-500",
    reviewing: "bg-yellow-500",
    learning: "bg-blue-500",
    mastered: "bg-emerald-500",
  }[level];
}

export function masteryBadgeClass(ef: number, reps: number): string {
  const level = masteryLevel(ef, reps);
  return {
    new: "bg-muted text-muted-foreground",
    struggling: "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400",
    reviewing: "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400",
    learning: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400",
    mastered: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400",
  }[level];
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

export function useLogs() {
  const { storage } = useTrackerStorage();
  const [logs, setLogs] = useState<LogEntry[]>([]);
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

  const deleteLog = useCallback(async (id: number) => {
    await storage.deleteLog(id);
    setLogs((prev) => prev.filter((l) => l.id !== id));
  }, [storage]);

  return { logs, loading, error, reload: load, deleteLog };
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

  const patchPlan = useCallback(async (id: number, body: Partial<{ items: PlanItem[]; completed: boolean }>) => {
    const updated = await storage.patchPlan(id, body);
    setPlan(updated);
    return updated;
  }, [storage]);

  return { plan, loading, error, reload: load, patchPlan };
}

export function usePostLog() {
  const { storage } = useTrackerStorage();
  return useCallback(
    (body: { surah: number; ayahStart: number; ayahEnd: number; quality: number; notes?: string }) =>
      storage.createLog(body),
    [storage]
  );
}

