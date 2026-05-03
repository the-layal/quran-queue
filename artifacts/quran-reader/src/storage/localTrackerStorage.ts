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
import { getAyahsForReference } from "./referenceFanOut";
import { getPageEquivalent } from "../lib/page-utils";

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

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function yesterdayStr(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

// SM-2 mirroring server (easeFactor int * 100)
function calculateNextReview(easeFactor: number, interval: number, repetitions: number, vibeScale: number) {
  let newInterval = interval;
  let newReps = repetitions;
  if (vibeScale >= 3) {
    if (repetitions === 0) newInterval = 1;
    else if (repetitions === 1) newInterval = 6;
    else newInterval = Math.round(interval * (easeFactor / 100));
    newReps += 1;
  } else {
    newReps = 0;
    newInterval = 1;
  }
  let newEase = easeFactor + (0.1 - (5 - vibeScale) * (0.08 + (5 - vibeScale) * 0.02)) * 100;
  if (newEase < 130) newEase = 130;
  const next = new Date();
  next.setDate(next.getDate() + newInterval);
  return {
    easeFactor: Math.round(newEase),
    interval: newInterval,
    repetitions: newReps,
    nextReviewDate: next.toISOString(),
  };
}

function expandSurahRange(reference: string): string[] {
  const m = reference.match(/^surah:(\d+)-(\d+)$/);
  if (!m) return [reference];
  const from = parseInt(m[1], 10);
  const to = parseInt(m[2], 10);
  if (from === to) return [`surah:${from}`];
  const refs: string[] = [];
  for (let s = from; s <= Math.min(to, 114); s++) refs.push(`surah:${s}`);
  return refs;
}

export function recordAction(): void {
  const count = readJSON<number>(KEYS.actions, 0);
  writeJSON(KEYS.actions, count + 1);
  if (!localStorage.getItem(KEYS.firstActionDate)) {
    writeJSON(KEYS.firstActionDate, todayStr());
  }
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

function readLogs(): Log[] { return readJSON<Log[]>(KEYS.logs, []); }
function writeLogs(v: Log[]): void { writeJSON(KEYS.logs, v); }
function readSrs(): SrsItem[] { return readJSON<SrsItem[]>(KEYS.srs, []); }
function writeSrs(v: SrsItem[]): void { writeJSON(KEYS.srs, v); }
function readPlans(): DailyPlan[] { return readJSON<DailyPlan[]>(KEYS.plans, []); }
function writePlans(v: DailyPlan[]): void { writeJSON(KEYS.plans, v); }

function applyVibe(reference: string, type: string, vibeScale: number): void {
  const srsItems = readSrs();
  const refs = expandSurahRange(reference);
  for (const ref of refs) {
    const idx = srsItems.findIndex((i) => i.reference === ref);
    if (idx === -1) {
      const update = calculateNextReview(250, 0, 0, vibeScale);
      srsItems.push({
        id: nextId(),
        type,
        reference: ref,
        easeFactor: update.easeFactor,
        interval: update.interval,
        repetitions: update.repetitions,
        nextReviewDate: update.nextReviewDate,
      });
    } else {
      const cur = srsItems[idx];
      const u = calculateNextReview(cur.easeFactor, cur.interval, cur.repetitions, vibeScale);
      srsItems[idx] = { ...cur, ...u };
    }
  }
  writeSrs(srsItems);
}

export class LocalTrackerStorage implements ITrackerStorage {
  async getLogs(): Promise<Log[]> {
    return readLogs();
  }

  async createLog(input: LogInput): Promise<Log> {
    const logs = readLogs();
    const log: Log = {
      id: nextId(),
      type: input.type,
      reference: input.reference,
      vibeScale: input.vibeScale,
      createdAt: new Date().toISOString(),
    };
    logs.unshift(log);
    writeLogs(logs);
    applyVibe(input.reference, input.type, input.vibeScale);
    recordAction();
    return log;
  }

  async getSrsItems(): Promise<SrsItem[]> {
    return readSrs();
  }

  async getDueSrsItems(): Promise<SrsItem[]> {
    const now = new Date();
    return readSrs().filter((i) => new Date(i.nextReviewDate) <= now);
  }

  async getTodayPlan(): Promise<DailyPlan | null> {
    const t = todayStr();
    const plans = readPlans();
    return plans.find((p) => p.date === t) ?? null;
  }

  async getAllPlans(): Promise<DailyPlan[]> {
    return readPlans().slice().sort((a, b) => b.date.localeCompare(a.date));
  }

  async createOrUpdatePlan(bandwidth: number): Promise<DailyPlan> {
    const t = todayStr();
    const plans = readPlans();
    const existingIdx = plans.findIndex((p) => p.date === t);

    if (existingIdx === -1) {
      const carryover: string[] = [];
      const yPlan = plans.find((p) => p.date === yesterdayStr());
      if (yPlan) {
        const completed = yPlan.completedItems || [];
        for (const ref of yPlan.plannedItems || []) if (!completed.includes(ref)) carryover.push(ref);
      }
      const planned: string[] = [...carryover];
      let usedPages = planned.reduce((s, r) => s + getPageEquivalent(r), 0);
      const due = await this.getDueSrsItems();
      const all = await this.getSrsItems();
      for (const list of [due, all]) {
        for (const item of list) {
          if (usedPages >= bandwidth) break;
          if (!planned.includes(item.reference)) {
            planned.push(item.reference);
            usedPages += getPageEquivalent(item.reference);
          }
        }
        if (usedPages >= bandwidth) break;
      }
      const plan: DailyPlan = {
        id: nextId(),
        date: t,
        bandwidth,
        plannedItems: planned,
        completedItems: [],
        extraRevisions: [],
      };
      plans.push(plan);
      writePlans(plans);
      return plan;
    }

    const updated: DailyPlan = { ...plans[existingIdx], bandwidth };
    plans[existingIdx] = updated;
    writePlans(plans);
    return updated;
  }

  async addMoreItems(count: number): Promise<DailyPlan> {
    const plan = await this.requireToday();
    const due = await this.getDueSrsItems();
    const all = await this.getSrsItems();
    let added = 0;
    for (const list of [due, all]) {
      for (const item of list) {
        if (added >= count) break;
        if (!plan.plannedItems.includes(item.reference)) {
          plan.plannedItems = [...plan.plannedItems, item.reference];
          added += getPageEquivalent(item.reference);
        }
      }
      if (added >= count) break;
    }
    return this.replacePlan(plan);
  }

  async markPlanCompleted(reference: string, vibeScale: number): Promise<DailyPlan> {
    const plan = await this.requireToday();
    if (!plan.completedItems.includes(reference)) plan.completedItems.push(reference);
    const type = reference.split(":")[0] || "page";
    await this.createLog({ type, reference, vibeScale });
    // Mirror server: fan out to per-ayah logs + SRS for richer per-ayah stats.
    try {
      const groups = getAyahsForReference(reference);
      for (const g of groups) {
        for (const ayah of g.ayahs) {
          await this.createLog({ type: "ayah", reference: `ayah:${g.surah}:${ayah}`, vibeScale });
        }
      }
    } catch {
      // ignore fan-out errors — top-level log is already recorded.
    }
    return this.replacePlan(plan);
  }

  async markPlanCompletedAdvanced(input: CompleteAdvancedInput): Promise<DailyPlan> {
    const plan = await this.requireToday();
    if (!plan.completedItems.includes(input.reference)) plan.completedItems.push(input.reference);
    for (const av of input.ayahVibes) {
      await this.createLog({ type: "ayah", reference: `ayah:${av.surah}:${av.ayah}`, vibeScale: av.vibe });
    }
    if (input.ayahVibes.length > 0) {
      const overall = Math.round(input.ayahVibes.reduce((s, a) => s + a.vibe, 0) / input.ayahVibes.length);
      const type = input.reference.split(":")[0] || "page";
      await this.createLog({ type, reference: input.reference, vibeScale: overall });
    }
    return this.replacePlan(plan);
  }

  async removePlanItem(reference: string): Promise<DailyPlan> {
    const plan = await this.requireToday();
    plan.plannedItems = plan.plannedItems.filter((r) => r !== reference);
    plan.completedItems = plan.completedItems.filter((r) => r !== reference);
    return this.replacePlan(plan);
  }

  async clearPlan(): Promise<DailyPlan> {
    const plan = await this.requireToday();
    plan.plannedItems = [...plan.completedItems];
    return this.replacePlan(plan);
  }

  async logExtraRevision(input: LogInput): Promise<DailyPlan> {
    const t = todayStr();
    const plans = readPlans();
    let idx = plans.findIndex((p) => p.date === t);
    if (idx === -1) {
      const newPlan: DailyPlan = {
        id: nextId(), date: t, bandwidth: 5,
        plannedItems: [], completedItems: [], extraRevisions: [input.reference],
      };
      plans.push(newPlan);
      idx = plans.length - 1;
    } else {
      const extras = plans[idx].extraRevisions || [];
      if (!extras.includes(input.reference)) extras.push(input.reference);
      plans[idx] = { ...plans[idx], extraRevisions: extras };
    }
    writePlans(plans);
    await this.createLog(input);
    return plans[idx];
  }

  async togglePlanItem(date: string, reference: string): Promise<DailyPlan> {
    const plans = readPlans();
    const idx = plans.findIndex((p) => p.date === date);
    if (idx === -1) throw new Error("Plan not found");
    const completed = new Set(plans[idx].completedItems || []);
    if (completed.has(reference)) completed.delete(reference);
    else completed.add(reference);
    plans[idx] = { ...plans[idx], completedItems: Array.from(completed) };
    writePlans(plans);
    return plans[idx];
  }

  async getStats(): Promise<TrackerStats> {
    const allLogs = readLogs();
    const latest: Record<string, number> = {};
    for (let i = allLogs.length - 1; i >= 0; i--) latest[allLogs[i].reference] = allLogs[i].vibeScale;
    let memorizedPages = 0;
    for (const [ref, vibe] of Object.entries(latest)) {
      if (vibe >= 3) memorizedPages += getPageEquivalent(ref);
    }

    const t = todayStr();
    const plans = readPlans();
    const todayPlan = plans.find((p) => p.date === t) ?? null;
    let dueToday: number;
    if (todayPlan) {
      dueToday = Math.max(0, (todayPlan.plannedItems?.length ?? 0) - (todayPlan.completedItems?.length ?? 0));
    } else {
      dueToday = (await this.getDueSrsItems()).length;
    }

    const isActive = (p?: DailyPlan): boolean => {
      if (!p) return false;
      const planned = p.plannedItems || [];
      const completed = p.completedItems || [];
      const extras = p.extraRevisions || [];
      return (planned.length > 0 && completed.length >= planned.length) || extras.length > 0;
    };
    let dayStreak = 0;
    const cur = new Date();
    cur.setDate(cur.getDate() - 1);
    for (let d = 0; d < 365; d++) {
      const ds = cur.toISOString().slice(0, 10);
      const dp = plans.find((p) => p.date === ds);
      if (isActive(dp)) {
        dayStreak++;
        cur.setDate(cur.getDate() - 1);
      } else break;
    }
    if (isActive(todayPlan ?? undefined)) dayStreak++;

    return { memorizedPages, dueToday, dayStreak };
  }

  async backup(): Promise<BackupData> {
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      logs: readLogs(),
      srsItems: readSrs(),
      dailyPlans: readPlans(),
    };
  }

  async restore(data: BackupData): Promise<void> {
    if (data.version !== 1) throw new Error("Unsupported backup version");
    const logs = (data.logs ?? []).map((l) => ({
      id: nextId(),
      type: String(l.type ?? "page"),
      reference: String(l.reference ?? ""),
      vibeScale: Number(l.vibeScale ?? 3),
      createdAt: String(l.createdAt ?? new Date().toISOString()),
    })).filter((l) => l.reference);
    const srsItems = (data.srsItems ?? []).map((s) => ({
      id: nextId(),
      type: String(s.type ?? "page"),
      reference: String(s.reference ?? ""),
      easeFactor: Number(s.easeFactor ?? 250),
      interval: Number(s.interval ?? 1),
      repetitions: Number(s.repetitions ?? 0),
      nextReviewDate: String(s.nextReviewDate ?? new Date().toISOString()),
    })).filter((s) => s.reference);
    const plans = (data.dailyPlans ?? []).map((p) => ({
      id: nextId(),
      date: String(p.date ?? "").slice(0, 10),
      bandwidth: Number(p.bandwidth ?? 5),
      plannedItems: Array.isArray(p.plannedItems) ? p.plannedItems : [],
      completedItems: Array.isArray(p.completedItems) ? p.completedItems : [],
      extraRevisions: Array.isArray(p.extraRevisions) ? p.extraRevisions : [],
    })).filter((p) => p.date);

    writeLogs(logs);
    writeSrs(srsItems);
    writePlans(plans);
    if (logs.length > 0 && !localStorage.getItem(KEYS.firstActionDate)) {
      writeJSON(KEYS.firstActionDate, todayStr());
    }
  }

  async isEmpty(): Promise<boolean> {
    const logs = readLogs();
    const srs = readSrs();
    const plans = readPlans();
    const meaningfulPlans = plans.filter((p) => (p.plannedItems?.length ?? 0) > 0 || (p.completedItems?.length ?? 0) > 0 || (p.extraRevisions?.length ?? 0) > 0);
    return logs.length === 0 && srs.length === 0 && meaningfulPlans.length === 0;
  }

  async clear(): Promise<void> {
    Object.values(KEYS).forEach((k) => localStorage.removeItem(k));
  }

  // helpers
  private async requireToday(): Promise<DailyPlan> {
    const plan = await this.getTodayPlan();
    if (!plan) throw new Error("No plan for today");
    return plan;
  }

  private replacePlan(plan: DailyPlan): DailyPlan {
    const plans = readPlans();
    const idx = plans.findIndex((p) => p.id === plan.id);
    if (idx === -1) plans.push(plan);
    else plans[idx] = plan;
    writePlans(plans);
    return plan;
  }
}

export const localTrackerStorage = new LocalTrackerStorage();
