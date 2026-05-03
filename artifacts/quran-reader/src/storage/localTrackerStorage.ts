import type { ITrackerStorage, SrsItem, LogEntry, TrackerStats, DailyPlan, PlanItem, BackupData } from "./trackerStorage";

const KEYS = {
  logs: "hafith_logs",
  srs: "hafith_srs",
  plans: "hafith_plans",
  nextId: "hafith_next_id",
  actions: "hafith_actions",
  firstActionDate: "hafith_first_action_date",
  nudgeDismissed: "hafith_nudge_dismissed",
};

export const HAFITH_ACTION_EVENT = "hafith:action";

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJSON(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value));
}

function nextId(): number {
  const current = readJSON<number>(KEYS.nextId, 0);
  const next = current + 1;
  writeJSON(KEYS.nextId, next);
  return next;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// SM-2 algorithm (mirrors the server's implementation)
function sm2(quality: number, easeFactor: number, interval: number, repetitions: number) {
  let newEF = easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  if (newEF < 1.3) newEF = 1.3;

  let newInterval: number;
  let newRepetitions: number;

  if (quality < 3) {
    newRepetitions = 0;
    newInterval = 1;
  } else {
    newRepetitions = repetitions + 1;
    if (repetitions === 0) {
      newInterval = 1;
    } else if (repetitions === 1) {
      newInterval = 6;
    } else {
      newInterval = Math.round(interval * newEF);
    }
  }

  const nextReview = new Date();
  nextReview.setDate(nextReview.getDate() + newInterval);

  return {
    easeFactor: newEF,
    interval: newInterval,
    repetitions: newRepetitions,
    nextReview: nextReview.toISOString().slice(0, 10),
    lastReviewed: today(),
  };
}

export function recordAction(): void {
  const count = readJSON<number>(KEYS.actions, 0);
  writeJSON(KEYS.actions, count + 1);
  if (!localStorage.getItem(KEYS.firstActionDate)) {
    writeJSON(KEYS.firstActionDate, today());
  }
  // Dispatch a custom event so GuestBanner can reactively update
  window.dispatchEvent(new CustomEvent(HAFITH_ACTION_EVENT, { detail: { count: count + 1 } }));
}

export function getActionCount(): number {
  return readJSON<number>(KEYS.actions, 0);
}

export function getFirstActionDate(): string | null {
  return readJSON<string | null>(KEYS.firstActionDate, null);
}

export function isNudgeDismissed(): boolean {
  return readJSON<boolean>(KEYS.nudgeDismissed, false);
}

export function dismissNudge(): void {
  writeJSON(KEYS.nudgeDismissed, true);
}

export function getDayStreakCount(): number {
  const firstDate = getFirstActionDate();
  if (!firstDate) return 0;
  const first = new Date(firstDate + "T00:00:00");
  const now = new Date();
  const diffMs = now.getTime() - first.getTime();
  return Math.max(1, Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1);
}

export class LocalTrackerStorage implements ITrackerStorage {
  async getLogs(): Promise<LogEntry[]> {
    return readJSON<LogEntry[]>(KEYS.logs, []);
  }

  async createLog(body: { surah: number; ayahStart: number; ayahEnd: number; quality: number; notes?: string }): Promise<LogEntry> {
    const logs = readJSON<LogEntry[]>(KEYS.logs, []);
    const log: LogEntry = {
      id: nextId(),
      surah: body.surah,
      ayahStart: body.ayahStart,
      ayahEnd: body.ayahEnd,
      quality: body.quality,
      notes: body.notes ?? null,
      createdAt: new Date().toISOString(),
    };
    logs.unshift(log);
    writeJSON(KEYS.logs, logs);

    // Update SRS item
    const srsItems = readJSON<SrsItem[]>(KEYS.srs, []);
    const existing = srsItems.find(
      (i) => i.surah === body.surah && i.ayahStart === body.ayahStart && i.ayahEnd === body.ayahEnd
    );
    const current = existing ?? { easeFactor: 2.5, interval: 1, repetitions: 0 };
    const updated = sm2(body.quality, current.easeFactor, current.interval, current.repetitions);

    if (existing) {
      const idx = srsItems.indexOf(existing);
      srsItems[idx] = { ...existing, ...updated };
    } else {
      srsItems.push({
        id: nextId(),
        surah: body.surah,
        ayahStart: body.ayahStart,
        ayahEnd: body.ayahEnd,
        ...updated,
      });
    }
    writeJSON(KEYS.srs, srsItems);

    recordAction();
    return log;
  }

  async deleteLog(id: number): Promise<void> {
    const logs = readJSON<LogEntry[]>(KEYS.logs, []);
    writeJSON(KEYS.logs, logs.filter((l) => l.id !== id));
  }

  async getSrsItems(): Promise<SrsItem[]> {
    return readJSON<SrsItem[]>(KEYS.srs, []);
  }

  async getStats(): Promise<TrackerStats> {
    const t = today();
    const allItems = readJSON<SrsItem[]>(KEYS.srs, []);
    const totalItems = allItems.length;
    const dueToday = allItems.filter((i) => i.nextReview <= t).length;
    const avgEaseFactor = totalItems > 0
      ? Math.round((allItems.reduce((s, i) => s + i.easeFactor, 0) / totalItems) * 100) / 100
      : 0;

    const allLogs = readJSON<LogEntry[]>(KEYS.logs, []);
    const totalLogs = allLogs.length;
    const todayReviews = allLogs.filter((l) => l.createdAt.slice(0, 10) === t).length;

    // Compute consecutive day streak ending today
    const logDays = new Set(allLogs.map((l) => l.createdAt.slice(0, 10)));
    let dayStreak = 0;
    const cur = new Date();
    while (logDays.has(cur.toISOString().slice(0, 10))) {
      dayStreak++;
      cur.setDate(cur.getDate() - 1);
    }

    const qualityDistribution: Record<number, number> = {};
    for (const log of allLogs.slice(0, 100)) {
      qualityDistribution[log.quality] = (qualityDistribution[log.quality] ?? 0) + 1;
    }

    return {
      totalItems,
      totalLogs,
      dueToday,
      avgEaseFactor,
      todayReviews,
      dayStreak,
      qualityDistribution,
      recentLogs: allLogs.slice(0, 10),
    };
  }

  async getTodayPlan(): Promise<DailyPlan> {
    const t = today();
    const plans = readJSON<DailyPlan[]>(KEYS.plans, []);
    const existing = plans.find((p) => p.planDate === t);
    if (existing) return existing;

    const srsItems = readJSON<SrsItem[]>(KEYS.srs, []);
    const dueItems = srsItems.filter((i) => i.nextReview <= t).sort((a, b) => a.nextReview.localeCompare(b.nextReview));
    const items: PlanItem[] = dueItems.map((item) => ({
      srsItemId: item.id,
      surah: item.surah,
      ayahStart: item.ayahStart,
      ayahEnd: item.ayahEnd,
      completed: false,
    }));

    const plan: DailyPlan = {
      id: nextId(),
      planDate: t,
      items,
      completed: false,
    };
    plans.push(plan);
    writeJSON(KEYS.plans, plans);
    return plan;
  }

  async getPlans(): Promise<DailyPlan[]> {
    return readJSON<DailyPlan[]>(KEYS.plans, []);
  }

  async patchPlan(id: number, updates: Partial<{ items: PlanItem[]; completed: boolean }>): Promise<DailyPlan> {
    const plans = readJSON<DailyPlan[]>(KEYS.plans, []);
    const idx = plans.findIndex((p) => p.id === id);
    if (idx === -1) throw new Error("Plan not found");
    const updated = { ...plans[idx], ...updates };
    plans[idx] = updated;
    writeJSON(KEYS.plans, plans);

    if (updates.completed) recordAction();
    return updated;
  }

  async backup(): Promise<BackupData> {
    const logs = readJSON<LogEntry[]>(KEYS.logs, []);
    const srsItems = readJSON<SrsItem[]>(KEYS.srs, []);
    const dailyPlans = readJSON<DailyPlan[]>(KEYS.plans, []);
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      logs,
      srsItems,
      dailyPlans,
    };
  }

  async restore(data: BackupData): Promise<void> {
    const logs = (data.logs ?? []).map((l) => ({
      id: nextId(),
      surah: Number(l.surah),
      ayahStart: Number(l.ayahStart),
      ayahEnd: Number(l.ayahEnd),
      quality: Number(l.quality),
      notes: l.notes ?? null,
      createdAt: String(l.createdAt),
    }));
    const srsItems = (data.srsItems ?? []).map((s) => ({
      id: nextId(),
      surah: Number(s.surah),
      ayahStart: Number(s.ayahStart),
      ayahEnd: Number(s.ayahEnd),
      easeFactor: Number(s.easeFactor) || 2.5,
      interval: Number(s.interval) || 1,
      repetitions: Number(s.repetitions) || 0,
      nextReview: String(s.nextReview ?? "").slice(0, 10),
      lastReviewed: s.lastReviewed ? String(s.lastReviewed).slice(0, 10) : null,
    }));
    const plans = (data.dailyPlans ?? []).map((p) => ({
      id: nextId(),
      planDate: String(p.planDate ?? "").slice(0, 10),
      items: Array.isArray(p.items) ? p.items : [],
      completed: Boolean(p.completed),
    }));

    writeJSON(KEYS.logs, logs);
    writeJSON(KEYS.srs, srsItems);
    writeJSON(KEYS.plans, plans);
    if (logs.length > 0 && !localStorage.getItem(KEYS.firstActionDate)) {
      writeJSON(KEYS.firstActionDate, today());
    }
  }

  async isEmpty(): Promise<boolean> {
    const logs = readJSON<LogEntry[]>(KEYS.logs, []);
    const srsItems = readJSON<SrsItem[]>(KEYS.srs, []);
    const plans = readJSON<DailyPlan[]>(KEYS.plans, []);
    // Ignore auto-created empty plans (created by getTodayPlan with no due items)
    // so a new user's auto-initialized plan doesn't block migration.
    const meaningfulPlans = plans.filter((p) => (p.items as PlanItem[]).length > 0 || p.completed);
    return logs.length === 0 && srsItems.length === 0 && meaningfulPlans.length === 0;
  }

  async clear(): Promise<void> {
    Object.values(KEYS).forEach((key) => localStorage.removeItem(key));
  }
}

export const localTrackerStorage = new LocalTrackerStorage();
