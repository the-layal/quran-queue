import { useState, useEffect, useCallback } from "react";
import { useAuth } from "./useAuth";

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

const GUEST_GOALS_KEY = "hafith_goals";
const GUEST_GOAL_NEXT_ID_KEY = "hafith_goals_next_id";

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

export function useGoals() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (authLoading) return;
    setLoading(true);
    setError(null);
    try {
      if (isAuthenticated) {
        const res = await fetch("/api/goals", { credentials: "include" });
        if (!res.ok) throw new Error("Failed to load goals");
        setGoals(await res.json());
      } else {
        setGoals(readGuestGoals());
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

  const createGoal = useCallback(async (input: CreateGoalInput): Promise<Goal> => {
    if (isAuthenticated) {
      const res = await fetch("/api/goals", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { message?: string };
        throw new Error(data.message ?? "Failed to create goal");
      }
      const goal = await res.json() as Goal;
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
  }, [isAuthenticated]);

  const deleteGoal = useCallback(async (id: number): Promise<void> => {
    if (isAuthenticated) {
      await fetch(`/api/goals/${id}`, { method: "DELETE", credentials: "include" });
    } else {
      const updated = readGuestGoals().filter((g) => g.id !== id);
      writeGuestGoals(updated);
    }
    setGoals((prev) => prev.filter((g) => g.id !== id));
  }, [isAuthenticated]);

  return { goals, loading, error, reload, createGoal, deleteGoal };
}
