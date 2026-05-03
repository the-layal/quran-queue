import type { ITrackerStorage, SrsItem, LogEntry, TrackerStats, DailyPlan, PlanItem, BackupData } from "./trackerStorage";

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: "include", ...options });
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(data.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export class ApiTrackerStorage implements ITrackerStorage {
  async getLogs(): Promise<LogEntry[]> {
    return apiFetch<LogEntry[]>("/api/logs");
  }

  async createLog(body: { surah: number; ayahStart: number; ayahEnd: number; quality: number; notes?: string }): Promise<LogEntry> {
    return apiFetch<LogEntry>("/api/logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  async deleteLog(id: number): Promise<void> {
    await apiFetch(`/api/logs/${id}`, { method: "DELETE" });
  }

  async getSrsItems(): Promise<SrsItem[]> {
    return apiFetch<SrsItem[]>("/api/srs");
  }

  async getStats(): Promise<TrackerStats> {
    return apiFetch<TrackerStats>("/api/stats");
  }

  async getTodayPlan(): Promise<DailyPlan> {
    return apiFetch<DailyPlan>("/api/plans/today");
  }

  async getPlans(): Promise<DailyPlan[]> {
    return apiFetch<DailyPlan[]>("/api/plans");
  }

  async patchPlan(id: number, updates: Partial<{ items: PlanItem[]; completed: boolean }>): Promise<DailyPlan> {
    return apiFetch<DailyPlan>(`/api/plans/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
  }

  async backup(): Promise<BackupData> {
    const res = await fetch("/api/backup", { credentials: "include" });
    if (!res.ok) throw new Error("Backup failed");
    return res.json() as Promise<BackupData>;
  }

  async restore(data: BackupData): Promise<void> {
    const res = await fetch("/api/restore", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({})) as { error?: string };
      throw new Error(d.error ?? "Restore failed");
    }
  }

  async isEmpty(): Promise<boolean> {
    // Fail closed: let errors propagate so the migration flow aborts safely
    // rather than incorrectly treating a reachable-but-populated account as empty.
    const [stats, plans] = await Promise.all([this.getStats(), this.getPlans()]);
    // Ignore auto-created empty plans (created by getTodayPlan with no due items).
    const meaningfulPlans = plans.filter(
      (p) => (p.items as PlanItem[]).length > 0 || p.completed
    );
    return stats.totalItems === 0 && stats.totalLogs === 0 && meaningfulPlans.length === 0;
  }

  async clear(): Promise<void> {
    // No-op for API storage — clearing is handled by restoring an empty backup
  }
}

export const apiTrackerStorage = new ApiTrackerStorage();
