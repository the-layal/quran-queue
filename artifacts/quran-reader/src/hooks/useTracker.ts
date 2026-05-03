import { useState, useEffect, useCallback } from "react";

export interface SrsItem {
  id: number;
  surah: number;
  ayahStart: number;
  ayahEnd: number;
  easeFactor: number;
  interval: number;
  repetitions: number;
  nextReview: string;
  lastReviewed: string | null;
}

export interface LogEntry {
  id: number;
  surah: number;
  ayahStart: number;
  ayahEnd: number;
  quality: number;
  notes: string | null;
  createdAt: string;
}

export interface TrackerStats {
  totalItems: number;
  dueToday: number;
  avgEaseFactor: number;
  todayReviews: number;
  qualityDistribution: Record<number, number>;
  recentLogs: LogEntry[];
}

export interface PlanItem {
  srsItemId: number;
  surah: number;
  ayahStart: number;
  ayahEnd: number;
  completed: boolean;
}

export interface DailyPlan {
  id: number;
  planDate: string;
  items: PlanItem[];
  completed: boolean;
}

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

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: "include", ...options });
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(data.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function useSrsItems() {
  const [items, setItems] = useState<SrsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    apiFetch<SrsItem[]>("/api/srs")
      .then(setItems)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  return { items, loading, error, reload: load };
}

export function useStats() {
  const [stats, setStats] = useState<TrackerStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    apiFetch<TrackerStats>("/api/stats")
      .then(setStats)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  return { stats, loading, error, reload: load };
}

export function useLogs() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    apiFetch<LogEntry[]>("/api/logs")
      .then(setLogs)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const deleteLog = useCallback(async (id: number) => {
    await apiFetch(`/api/logs/${id}`, { method: "DELETE" });
    setLogs((prev) => prev.filter((l) => l.id !== id));
  }, []);

  return { logs, loading, error, reload: load, deleteLog };
}

export function useTodayPlan() {
  const [plan, setPlan] = useState<DailyPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    apiFetch<DailyPlan>("/api/plans/today")
      .then(setPlan)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const patchPlan = useCallback(async (id: number, body: Partial<{ items: PlanItem[]; completed: boolean }>) => {
    const updated = await apiFetch<DailyPlan>(`/api/plans/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setPlan(updated);
    return updated;
  }, []);

  return { plan, loading, error, reload: load, patchPlan };
}

export async function postLog(body: {
  surah: number;
  ayahStart: number;
  ayahEnd: number;
  quality: number;
  notes?: string;
}): Promise<LogEntry> {
  return apiFetch<LogEntry>("/api/logs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
