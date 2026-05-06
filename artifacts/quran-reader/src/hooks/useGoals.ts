import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "./useAuth";
import { getAyahsForReference } from "@/lib/page-utils";

export interface Goal {
  id: number;
  surahNumber: number;
  ayahStart: number;
  ayahEnd: number;
  targetDate: string;
  dailyTarget: number;
  completedAyahsList: number[];
  status: "active" | "complete";
  qfGoalId?: string | null;
  createdAt: string;
}

export interface CreateGoalInput {
  surahNumber: number;
  ayahStart: number;
  ayahEnd: number;
  targetDate: string;
  dailyTarget: number;
}

// ── localStorage keys ─────────────────────────────────────────────────────────

const GUEST_GOALS_KEY = "hafith_goals";
const GUEST_GOAL_NEXT_ID_KEY = "hafith_goals_next_id";
const GUEST_LOGS_KEY = "hafith_logs"; // written by localTrackerStorage

interface LocalLog {
  id: number;
  reference: string;
  type?: string;
  vibeScale?: number;
}

function readGuestGoals(): Goal[] {
  try {
    const raw = localStorage.getItem(GUEST_GOALS_KEY);
    return raw ? (JSON.parse(raw) as Goal[]) : [];
  } catch {
    return [];
  }
}

function writeGuestGoals(goals: Goal[]): void {
  localStorage.setItem(GUEST_GOALS_KEY, JSON.stringify(goals));
}

function nextGuestId(): number {
  const current = parseInt(localStorage.getItem(GUEST_GOAL_NEXT_ID_KEY) ?? "0", 10);
  const next = current + 1;
  localStorage.setItem(GUEST_GOAL_NEXT_ID_KEY, String(next));
  return next;
}

function readGuestLogs(): LocalLog[] {
  try {
    const raw = localStorage.getItem(GUEST_LOGS_KEY);
    return raw ? (JSON.parse(raw) as LocalLog[]) : [];
  } catch {
    return [];
  }
}

/**
 * Reconcile guest goals' completedAyahsList against all local logs.
 * Uses getAyahsForReference to expand page, surah, ayah-range, and single-ayah
 * references so any review type advances goal progress.
 * Returns updated goals (and persists them to localStorage if anything changed).
 */
function reconcileGuestGoals(goals: Goal[]): Goal[] {
  if (goals.length === 0) return goals;

  const logs = readGuestLogs();
  // Build a map of surahNumber -> Set<ayahNumber> by expanding every log reference
  const ayahMap = new Map<number, Set<number>>();
  for (const log of logs) {
    if (!log.reference) continue;
    try {
      const groups = getAyahsForReference(log.reference);
      for (const group of groups) {
        if (!ayahMap.has(group.surah)) ayahMap.set(group.surah, new Set());
        for (const a of group.ayahs) ayahMap.get(group.surah)!.add(a);
      }
    } catch {
      // fallback: try direct single-ayah parse
      const m = log.reference.match(/^ayah:(\d+):(\d+)$/);
      if (m) {
        const s = parseInt(m[1], 10);
        const a = parseInt(m[2], 10);
        if (!ayahMap.has(s)) ayahMap.set(s, new Set());
        ayahMap.get(s)!.add(a);
      }
    }
  }

  let changed = false;
  const updated = goals.map((goal) => {
    if (goal.status === "complete") return goal;
    const loggedForSurah = ayahMap.get(goal.surahNumber) ?? new Set<number>();
    const newCompleted = new Set<number>(goal.completedAyahsList || []);
    for (const a of loggedForSurah) {
      if (a >= goal.ayahStart && a <= goal.ayahEnd && !newCompleted.has(a)) {
        newCompleted.add(a);
        changed = true;
      }
    }
    if (!changed) return goal;
    const newList = Array.from(newCompleted);
    const total = goal.ayahEnd - goal.ayahStart + 1;
    return { ...goal, completedAyahsList: newList, status: (newList.length >= total ? "complete" : "active") as "active" | "complete" };
  });

  if (changed) writeGuestGoals(updated);
  return updated;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useGoals() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Track whether we've already migrated guest goals for this session
  const migrationDoneRef = useRef(false);

  const reload = useCallback(async () => {
    if (authLoading) return;
    setLoading(true);
    setError(null);
    try {
      if (isAuthenticated) {
        const res = await fetch("/api/goals", { credentials: "include" });
        if (!res.ok) throw new Error("Failed to load goals");
        setGoals(await res.json());
        // Background QF sync — re-fetch goals if new ones were imported
        fetch("/api/goals/qf/sync", { credentials: "include" })
          .then((r) => r.json())
          .then((data: unknown) => {
            if ((data as { synced?: number }).synced && (data as { synced: number }).synced > 0) {
              fetch("/api/goals", { credentials: "include" })
                .then((r) => r.json())
                .then((g: unknown) => setGoals(g as Goal[]))
                .catch(() => {});
            }
          })
          .catch(() => {});
      } else {
        const raw = readGuestGoals();
        setGoals(reconcileGuestGoals(raw));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load goals");
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, authLoading]);

  useEffect(() => {
    reload();
  }, [reload]);

  // Listen for a cross-component goals refresh signal (e.g. from Settings after QF sync)
  useEffect(() => {
    const handler = () => { void reload(); };
    window.addEventListener("hafith:goals:refresh", handler);
    return () => window.removeEventListener("hafith:goals:refresh", handler);
  }, [reload]);

  // ── Guest → server migration when user signs in ───────────────────────────
  useEffect(() => {
    if (authLoading || !isAuthenticated || migrationDoneRef.current) return;
    migrationDoneRef.current = true;

    const guestGoals = readGuestGoals();
    if (guestGoals.length === 0) return;

    // Migrate each guest goal to the server — preserve completedAyahsList + status
    Promise.all(
      guestGoals.map((g) =>
        fetch("/api/goals", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            surahNumber: g.surahNumber,
            ayahStart: g.ayahStart,
            ayahEnd: g.ayahEnd,
            targetDate: g.targetDate,
            dailyTarget: g.dailyTarget,
            completedAyahsList: g.completedAyahsList || [],
            status: g.status || "active",
          }),
        }).catch(() => null),
      ),
    )
      .then(() => {
        // Clear guest goals after successful migration
        localStorage.removeItem(GUEST_GOALS_KEY);
        localStorage.removeItem(GUEST_GOAL_NEXT_ID_KEY);
        // Reload from server to get the migrated goals with IDs
        reload();
      })
      .catch(() => {});
  }, [isAuthenticated, authLoading, reload]);

  // ── Mutations ─────────────────────────────────────────────────────────────

  const createGoal = useCallback(
    async (input: CreateGoalInput): Promise<Goal> => {
      if (isAuthenticated) {
        const res = await fetch("/api/goals", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { message?: string };
          throw new Error(data.message ?? "Failed to create goal");
        }
        const goal = (await res.json()) as Goal;
        setGoals((prev) => [goal, ...prev]);
        return goal;
      } else {
        const goal: Goal = {
          id: nextGuestId(),
          ...input,
          completedAyahsList: [],
          status: "active",
          qfGoalId: null,
          createdAt: new Date().toISOString(),
        };
        const updated = [goal, ...readGuestGoals()];
        writeGuestGoals(updated);
        setGoals(updated);
        return goal;
      }
    },
    [isAuthenticated],
  );

  const deleteGoal = useCallback(
    async (id: number): Promise<void> => {
      if (isAuthenticated) {
        await fetch(`/api/goals/${id}`, { method: "DELETE", credentials: "include" });
      } else {
        const updated = readGuestGoals().filter((g) => g.id !== id);
        writeGuestGoals(updated);
      }
      setGoals((prev) => prev.filter((g) => g.id !== id));
    },
    [isAuthenticated],
  );

  const updateGoal = useCallback(
    async (id: number, data: Partial<Pick<Goal, "status" | "targetDate" | "dailyTarget">>): Promise<void> => {
      if (isAuthenticated) {
        const res = await fetch(`/api/goals/${id}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        if (res.ok) {
          const updated = (await res.json()) as Goal;
          setGoals((prev) => prev.map((g) => (g.id === id ? updated : g)));
        }
      } else {
        const current = readGuestGoals();
        const updated = current.map((g) => (g.id === id ? { ...g, ...data } : g));
        writeGuestGoals(updated);
        setGoals(updated);
      }
    },
    [isAuthenticated],
  );

  return { goals, loading, error, reload, createGoal, deleteGoal, updateGoal };
}
