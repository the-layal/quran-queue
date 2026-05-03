import type {
  ITrackerStorage,
  Log,
  SrsItem,
  DailyPlan,
  TrackerStats,
  BackupData,
  LogInput,
  CompleteAdvancedInput,
} from "./trackerStorage";

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: "include", ...options });
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { error?: string; message?: string };
    throw new Error(data.error ?? data.message ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

function jsonPost<T>(path: string, body: unknown): Promise<T> {
  return apiFetch<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export class ApiTrackerStorage implements ITrackerStorage {
  getLogs(): Promise<Log[]> {
    return apiFetch<Log[]>("/api/logs");
  }

  createLog(input: LogInput): Promise<Log> {
    return jsonPost<Log>("/api/logs", input);
  }

  deleteLog(id: number): Promise<{ deleted: boolean; srsRemoved: boolean }> {
    return apiFetch<{ deleted: boolean; srsRemoved: boolean }>(`/api/logs/${id}`, { method: "DELETE" });
  }

  getSrsItems(): Promise<SrsItem[]> {
    return apiFetch<SrsItem[]>("/api/srs");
  }

  getDueSrsItems(): Promise<SrsItem[]> {
    return apiFetch<SrsItem[]>("/api/srs/due");
  }

  getTodayPlan(): Promise<DailyPlan | null> {
    return apiFetch<DailyPlan | null>("/api/plans/today");
  }

  getAllPlans(): Promise<DailyPlan[]> {
    return apiFetch<DailyPlan[]>("/api/plans");
  }

  createOrUpdatePlan({ bandwidth }: { bandwidth: number }): Promise<DailyPlan> {
    return jsonPost<DailyPlan>("/api/plans/today", { bandwidth });
  }

  addMoreItems({ count }: { count: number }): Promise<DailyPlan> {
    return jsonPost<DailyPlan>("/api/plans/today/add-more", { count });
  }

  markPlanCompleted({ reference, vibeScale }: { reference: string; vibeScale: number }): Promise<DailyPlan> {
    return jsonPost<DailyPlan>("/api/plans/today/complete", { reference, vibeScale });
  }

  markPlanCompletedAdvanced(input: CompleteAdvancedInput): Promise<DailyPlan> {
    return jsonPost<DailyPlan>("/api/plans/today/complete-advanced", input);
  }

  removePlanItem({ reference }: { reference: string }): Promise<DailyPlan> {
    return jsonPost<DailyPlan>("/api/plans/today/remove-item", { reference });
  }

  clearPlan(): Promise<DailyPlan> {
    return jsonPost<DailyPlan>("/api/plans/today/clear", {});
  }

  logExtraRevision(input: LogInput): Promise<DailyPlan> {
    return jsonPost<DailyPlan>("/api/plans/today/extra", input);
  }

  togglePlanItem({ date, reference }: { date: string; reference: string }): Promise<DailyPlan> {
    return jsonPost<DailyPlan>(`/api/plans/${encodeURIComponent(date)}/toggle-item`, { reference });
  }

  getStats(): Promise<TrackerStats> {
    return apiFetch<TrackerStats>("/api/stats");
  }

  backup(): Promise<BackupData> {
    return apiFetch<BackupData>("/api/backup");
  }

  async restore(data: BackupData): Promise<void> {
    await jsonPost<unknown>("/api/backup/restore", data);
  }

  async isEmpty(): Promise<boolean> {
    const [logs, srs, plans] = await Promise.all([
      this.getLogs(),
      this.getSrsItems(),
      this.getAllPlans(),
    ]);
    const meaningfulPlans = plans.filter((p) =>
      (p.plannedItems?.length ?? 0) > 0 ||
      (p.completedItems?.length ?? 0) > 0 ||
      (p.extraRevisions?.length ?? 0) > 0
    );
    return logs.length === 0 && srs.length === 0 && meaningfulPlans.length === 0;
  }

  async clear(): Promise<void> {
    await this.restore({ version: 1, exportedAt: new Date().toISOString(), logs: [], srsItems: [], dailyPlans: [] });
  }
}

export const apiTrackerStorage = new ApiTrackerStorage();
