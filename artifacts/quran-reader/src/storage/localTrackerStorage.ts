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
import { getPageEquivalent, getPagesForReference } from "../lib/page-utils";


const DATA_VERSION = "2";
const KEYS = {
  dataVersion: "hafith_data_version",
  logs: "hafith_logs",
  srs: "hafith_srs",
  plans: "hafith_plans",
  nextId: "hafith_next_id",
  actions: "hafith_actions",
  firstActionDate: "hafith_first_action_date",
  nudgeDismissed: "hafith_nudge_dismissed",
  bookmarks: "hafith_bookmarks",
  onboardingComplete: "hafith_onboarding_complete",
};

export function isOnboardingComplete(): boolean {
  return localStorage.getItem(KEYS.onboardingComplete) === "1";
}

export function markOnboardingComplete(): void {
  localStorage.setItem(KEYS.onboardingComplete, "1");
}

function ensureDataVersion(): void {
  const stored = localStorage.getItem(KEYS.dataVersion);
  if (stored !== DATA_VERSION) {
    const hadData = !!localStorage.getItem(KEYS.logs) || !!localStorage.getItem(KEYS.srs);
    if (hadData) {
      for (const key of [KEYS.logs, KEYS.srs, KEYS.plans, KEYS.nextId, KEYS.actions, KEYS.firstActionDate]) {
        localStorage.removeItem(key);
      }
    }
    localStorage.setItem(KEYS.dataVersion, DATA_VERSION);
  }
}

ensureDataVersion();

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

  async deleteLog(id: number): Promise<{ deleted: boolean; srsRemoved: boolean }> {
    let logs = readLogs();
    const idx = logs.findIndex((l) => l.id === id);
    if (idx === -1) return { deleted: false, srsRemoved: false };
    const log = logs[idx];
    logs.splice(idx, 1);
    writeLogs(logs);

    const srsRefsToRemove = new Set<string>();

    // Cascade: delete companion ayah logs and mark their SRS for removal when
    // no remaining segment log still fans out to those ayahs.
    if (log.type !== "ayah") {
      for (const g of getAyahsForReference(log.reference)) {
        for (const a of g.ayahs) {
          const stillCoveredBySegment = logs.some(
            (l) =>
              l.type !== "ayah" &&
              getAyahsForReference(l.reference).some(
                (gg) => gg.surah === g.surah && gg.ayahs.includes(a),
              ),
          );
          if (stillCoveredBySegment) continue;
          const ayahRef = `ayah:${g.surah}:${a}`;
          const companions = logs.filter((l) => l.reference === ayahRef);
          if (companions.length > 0) {
            logs = logs.filter((l) => l.reference !== ayahRef);
            writeLogs(logs);
          }
          srsRefsToRemove.add(ayahRef);
        }
      }
    }

    // Mark expanded segment SRS refs for removal when no remaining log covers them.
    for (const segRef of expandSurahRange(log.reference)) {
      const stillCovered = logs.some(
        (l) => l.reference === segRef || expandSurahRange(l.reference).includes(segRef),
      );
      if (!stillCovered) srsRefsToRemove.add(segRef);
    }

    let srsRemoved = false;
    const srsItems = readSrs();
    let srsChanged = false;
    for (const ref of srsRefsToRemove) {
      const srsIdx = srsItems.findIndex((s) => s.reference === ref);
      if (srsIdx !== -1) {
        srsItems.splice(srsIdx, 1);
        srsChanged = true;
        srsRemoved = true;
      }
    }
    if (srsChanged) writeSrs(srsItems);
    return { deleted: true, srsRemoved };
  }

  async getSrsItems(): Promise<SrsItem[]> {
    return readSrs();
  }

  async getDueSrsItems(): Promise<SrsItem[]> {
    const now = new Date();
    return readSrs().filter((i) => !i.retired && new Date(i.nextReviewDate) <= now);
  }

  async retireSurah(reference: string): Promise<void> {
    const items = readSrs();
    const idx = items.findIndex((i) => i.reference === reference);
    if (idx !== -1) {
      items[idx] = { ...items[idx], retired: true, retiredAt: new Date().toISOString() };
    } else {
      const next = new Date();
      next.setDate(next.getDate() + 365);
      items.push({
        id: nextId(),
        type: "surah",
        reference,
        easeFactor: 280,
        interval: 365,
        repetitions: 5,
        nextReviewDate: next.toISOString(),
        retired: true,
        retiredAt: new Date().toISOString(),
      });
    }
    writeSrs(items);
  }

  async unretireSurah(reference: string): Promise<void> {
    const items = readSrs();
    const idx = items.findIndex((i) => i.reference === reference);
    if (idx !== -1) {
      const next = new Date();
      next.setDate(next.getDate() + 60);
      items[idx] = {
        ...items[idx],
        retired: false,
        retiredAt: null,
        interval: 60,
        nextReviewDate: next.toISOString(),
      };
      writeSrs(items);
    }
  }

  async addPerfectlyKnownToSession(): Promise<DailyPlan> {
    const plan = await this.requireToday();
    const retiredItems = readSrs().filter((i) => i.retired);
    for (const item of retiredItems) {
      if (!plan.plannedItems.includes(item.reference)) {
        plan.plannedItems = [...plan.plannedItems, item.reference];
      }
    }
    return this.replacePlan(plan);
  }

  async getTodayPlan(): Promise<DailyPlan | null> {
    const t = todayStr();
    const plans = readPlans();
    const plan = plans.find((p) => p.date === t) ?? null;
    if (!plan) return null;
    const srsRefs = new Set(readSrs().map((i) => i.reference));
    const filtered = plan.plannedItems.filter((r) => srsRefs.has(r));
    if (filtered.length !== plan.plannedItems.length) {
      const idx = plans.findIndex((p) => p.date === t);
      plans[idx] = { ...plan, plannedItems: filtered };
      writePlans(plans);
      return plans[idx];
    }
    return plan;
  }

  async getAllPlans(): Promise<DailyPlan[]> {
    return readPlans().slice().sort((a, b) => b.date.localeCompare(a.date));
  }

  async createOrUpdatePlan({ bandwidth }: { bandwidth: number }): Promise<DailyPlan> {
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
      for (const item of due) {
        if (usedPages >= bandwidth) break;
        if (!planned.includes(item.reference)) {
          planned.push(item.reference);
          usedPages += getPageEquivalent(item.reference);
        }
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

    const existing = plans[existingIdx];
    const srsRefs = new Set(readSrs().map((i) => i.reference));
    const planned = (existing.plannedItems || []).filter((r) => srsRefs.has(r));
    let usedPages = planned.reduce((s, r) => s + getPageEquivalent(r), 0);
    if (usedPages < bandwidth) {
      const due = await this.getDueSrsItems();
      for (const item of due) {
        if (usedPages >= bandwidth) break;
        if (!planned.includes(item.reference)) {
          planned.push(item.reference);
          usedPages += getPageEquivalent(item.reference);
        }
      }
    }
    const updated: DailyPlan = { ...existing, bandwidth, plannedItems: planned };
    plans[existingIdx] = updated;
    writePlans(plans);
    return updated;
  }

  async addMoreItems({ count }: { count: number }): Promise<DailyPlan> {
    const plan = await this.requireToday();
    const due = await this.getDueSrsItems();
    const dismissedPages = new Set<number>();
    for (const ref of (plan.removedItems || [])) {
      for (const p of getPagesForReference(ref)) dismissedPages.add(p);
    }
    let added = 0;
    for (const item of due) {
      if (added >= count) break;
      if (plan.plannedItems.includes(item.reference)) continue;
      if (getPagesForReference(item.reference).some((p) => dismissedPages.has(p))) continue;
      plan.plannedItems = [...plan.plannedItems, item.reference];
      added += getPageEquivalent(item.reference);
    }
    return this.replacePlan(plan);
  }

  async markPlanCompleted({ reference, vibeScale }: { reference: string; vibeScale: number }): Promise<DailyPlan> {
    const plan = await this.requireToday();
    if (!plan.completedItems.includes(reference)) plan.completedItems.push(reference);
    const type = reference.split(":")[0] || "page";
    await this.createLog({ type, reference, vibeScale });
    const groups = getAyahsForReference(reference);
    for (const g of groups) {
      for (const ayah of g.ayahs) {
        await this.createLog({ type: "ayah", reference: `ayah:${g.surah}:${ayah}`, vibeScale });
      }
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

  async removePlanItem({ reference }: { reference: string }): Promise<DailyPlan> {
    const plan = await this.requireToday();
    plan.plannedItems = plan.plannedItems.filter((r) => r !== reference);
    plan.completedItems = plan.completedItems.filter((r) => r !== reference);
    const removed = plan.removedItems || [];
    if (!removed.includes(reference)) plan.removedItems = [...removed, reference];
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

  async togglePlanItem({ date, reference }: { date: string; reference: string }): Promise<DailyPlan> {
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
      if (vibe < 3) continue;
      const parts = ref.split(":");
      if (parts[0] === "ayah" && !(parts[2] || "").includes("-")) continue;
      memorizedPages += getPageEquivalent(ref);
    }
    memorizedPages = Math.round(memorizedPages * 10) / 10;

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

  async seedPriorKnowledge(items: Array<{ reference: string; vibe: number }>): Promise<void> {
    const SEED: Record<number, { interval: number; repetitions: number; easeFactor: number }> = {
      1: { interval: 1,  repetitions: 1, easeFactor: 220 },
      2: { interval: 3,  repetitions: 2, easeFactor: 235 },
      3: { interval: 7,  repetitions: 3, easeFactor: 250 },
      4: { interval: 21, repetitions: 4, easeFactor: 265 },
      5: { interval: 60, repetitions: 5, easeFactor: 280 },
    };
    const srsItems = readSrs();
    const now = new Date();
    for (const { reference, vibe } of items) {
      if (srsItems.find((s) => s.reference === reference)) continue;
      const seed = SEED[vibe] ?? SEED[3];
      const next = new Date(now);
      next.setDate(next.getDate() + seed.interval);
      srsItems.push({
        id: nextId(),
        type: "surah",
        reference,
        easeFactor: seed.easeFactor,
        interval: seed.interval,
        repetitions: seed.repetitions,
        nextReviewDate: next.toISOString(),
      });
    }
    writeSrs(srsItems);
    if (items.length > 0) recordAction();
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
