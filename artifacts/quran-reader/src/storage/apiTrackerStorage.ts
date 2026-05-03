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

  createOrUpdateTodayPlan(bandwidth: number): Promise<DailyPlan> {
    return jsonPost<DailyPlan>("/api/plans/today", { bandwidth });
  }

  addMore(count: number): Promise<DailyPlan> {
    return jsonPost<DailyPlan>("/api/plans/today/add-more", { count });
  }

  completeItem(reference: string, vibeScale: number): Promise<DailyPlan> {
    return jsonPost<DailyPlan>("/api/plans/today/complete", { reference, vibeScale });
  }

  completeItemAdvanced(input: CompleteAdvancedInput): Promise<DailyPlan> {
    return jsonPost<DailyPlan>("/api/plans/today/complete-advanced", input);
  }

  removeItem(reference: string): Promise<DailyPlan> {
    return jsonPost<DailyPlan>("/api/plans/today/remove-item", { reference });
  }

  clearPlan(): Promise<DailyPlan> {
    return jsonPost<DailyPlan>("/api/plans/today/clear", {});
  }

  logExtra(input: LogInput): Promise<DailyPlan> {
    return jsonPost<DailyPlan>("/api/plans/today/extra", input);
  }

  toggleHistoryItem(date: string, reference: string): Promise<DailyPlan> {
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
    // No-op for API: clearing is handled server-side via restore({version:1, ...empty}).
  }
}

export const apiTrackerStorage = new ApiTrackerStorage();
