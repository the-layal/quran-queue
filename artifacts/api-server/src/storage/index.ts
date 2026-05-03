import { db, logsTable, srsItemsTable, dailyPlansTable } from "@workspace/db";
import { eq, and, lte, desc } from "drizzle-orm";
import type { Log, SrsItem, DailyPlan, InsertLog, InsertSrsItem } from "@workspace/db";

export type { Log, SrsItem, DailyPlan };

export interface IStorage {
  getLogs(userId: string): Promise<Log[]>;
  createLog(values: Omit<InsertLog, "userId"> & { userId: string }): Promise<Log>;
  deleteLog(id: number, userId: string): Promise<Log | undefined>;

  getSrsItems(userId: string): Promise<SrsItem[]>;
  getSrsItem(userId: string, surah: number, ayahStart: number, ayahEnd: number): Promise<SrsItem | undefined>;
  upsertSrsItem(userId: string, surah: number, ayahStart: number, ayahEnd: number, updates: Partial<Omit<SrsItem, "id" | "userId" | "surah" | "ayahStart" | "ayahEnd">>): Promise<void>;

  getStats(userId: string): Promise<{
    totalItems: number;
    dueToday: number;
    avgEaseFactor: number;
    todayReviews: number;
    recentLogs: Log[];
    qualityDistribution: Record<number, number>;
  }>;

  getTodayPlan(userId: string): Promise<DailyPlan>;
  getPlan(id: number, userId: string): Promise<DailyPlan | undefined>;
  patchPlan(id: number, userId: string, updates: Partial<Pick<DailyPlan, "items" | "completed">>): Promise<DailyPlan | undefined>;

  backup(userId: string): Promise<{ logs: Log[]; srsItems: SrsItem[]; dailyPlans: DailyPlan[] }>;
  restore(userId: string, data: { logs?: unknown[]; srsItems?: unknown[]; dailyPlans?: unknown[] }): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getLogs(userId: string): Promise<Log[]> {
    return db.select().from(logsTable).where(eq(logsTable.userId, userId)).orderBy(desc(logsTable.createdAt));
  }

  async createLog(values: InsertLog): Promise<Log> {
    const [row] = await db.insert(logsTable).values(values).returning();
    return row;
  }

  async deleteLog(id: number, userId: string): Promise<Log | undefined> {
    const [row] = await db.delete(logsTable).where(and(eq(logsTable.id, id), eq(logsTable.userId, userId))).returning();
    return row;
  }

  async getSrsItems(userId: string): Promise<SrsItem[]> {
    return db.select().from(srsItemsTable).where(eq(srsItemsTable.userId, userId)).orderBy(srsItemsTable.nextReview);
  }

  async getSrsItem(userId: string, surah: number, ayahStart: number, ayahEnd: number): Promise<SrsItem | undefined> {
    const [row] = await db.select().from(srsItemsTable).where(
      and(eq(srsItemsTable.userId, userId), eq(srsItemsTable.surah, surah), eq(srsItemsTable.ayahStart, ayahStart), eq(srsItemsTable.ayahEnd, ayahEnd))
    );
    return row;
  }

  async upsertSrsItem(userId: string, surah: number, ayahStart: number, ayahEnd: number, updates: Partial<Omit<SrsItem, "id" | "userId" | "surah" | "ayahStart" | "ayahEnd">>): Promise<void> {
    const existing = await this.getSrsItem(userId, surah, ayahStart, ayahEnd);
    if (existing) {
      await db.update(srsItemsTable).set({ ...updates, updatedAt: new Date() }).where(eq(srsItemsTable.id, existing.id));
    } else {
      await db.insert(srsItemsTable).values({ userId, surah, ayahStart, ayahEnd, ...updates } as InsertSrsItem);
    }
  }

  async getStats(userId: string) {
    const today = new Date().toISOString().slice(0, 10);
    const allItems = await this.getSrsItems(userId);
    const totalItems = allItems.length;
    const dueToday = allItems.filter((i) => i.nextReview <= today).length;
    const avgEaseFactor = totalItems > 0 ? allItems.reduce((s, i) => s + i.easeFactor, 0) / totalItems : 0;

    const allLogs = await db.select().from(logsTable).where(eq(logsTable.userId, userId)).orderBy(desc(logsTable.createdAt));
    const todayReviews = allLogs.filter((l) => l.createdAt.toISOString().slice(0, 10) === today).length;

    const qualityDistribution: Record<number, number> = {};
    for (const log of allLogs.slice(0, 100)) {
      qualityDistribution[log.quality] = (qualityDistribution[log.quality] ?? 0) + 1;
    }

    return { totalItems, dueToday, avgEaseFactor: Math.round(avgEaseFactor * 100) / 100, todayReviews, recentLogs: allLogs.slice(0, 10), qualityDistribution };
  }

  async getTodayPlan(userId: string): Promise<DailyPlan> {
    const today = new Date().toISOString().slice(0, 10);
    const [existing] = await db.select().from(dailyPlansTable).where(and(eq(dailyPlansTable.userId, userId), eq(dailyPlansTable.planDate, today)));
    if (existing) return existing;

    const dueItems = await db.select().from(srsItemsTable).where(and(eq(srsItemsTable.userId, userId), lte(srsItemsTable.nextReview, today))).orderBy(srsItemsTable.nextReview);
    const items = dueItems.map((item) => ({ srsItemId: item.id, surah: item.surah, ayahStart: item.ayahStart, ayahEnd: item.ayahEnd, completed: false }));
    const [plan] = await db.insert(dailyPlansTable).values({ userId, planDate: today, items }).returning();
    return plan;
  }

  async getPlan(id: number, userId: string): Promise<DailyPlan | undefined> {
    const [row] = await db.select().from(dailyPlansTable).where(and(eq(dailyPlansTable.id, id), eq(dailyPlansTable.userId, userId)));
    return row;
  }

  async patchPlan(id: number, userId: string, updates: Partial<Pick<DailyPlan, "items" | "completed">>): Promise<DailyPlan | undefined> {
    const [row] = await db.update(dailyPlansTable).set(updates).where(and(eq(dailyPlansTable.id, id), eq(dailyPlansTable.userId, userId))).returning();
    return row;
  }

  async backup(userId: string) {
    const [logs, srsItems, dailyPlans] = await Promise.all([
      this.getLogs(userId),
      this.getSrsItems(userId),
      db.select().from(dailyPlansTable).where(eq(dailyPlansTable.userId, userId)),
    ]);
    return { logs, srsItems, dailyPlans };
  }

  async restore(userId: string, data: { logs?: unknown[]; srsItems?: unknown[]; dailyPlans?: unknown[] }): Promise<void> {
    const logRows = (data.logs ?? []).map((l) => {
      const r = l as Record<string, unknown>;
      return { userId, surah: Number(r.surah), ayahStart: Number(r.ayahStart), ayahEnd: Number(r.ayahEnd), quality: Number(r.quality), notes: typeof r.notes === "string" ? r.notes : null };
    });
    const srsRows = (data.srsItems ?? []).map((s) => {
      const r = s as Record<string, unknown>;
      return { userId, surah: Number(r.surah), ayahStart: Number(r.ayahStart), ayahEnd: Number(r.ayahEnd), easeFactor: Number(r.easeFactor) || 2.5, interval: Number(r.interval) || 1, repetitions: Number(r.repetitions) || 0, nextReview: String(r.nextReview ?? "").slice(0, 10), lastReviewed: r.lastReviewed ? String(r.lastReviewed).slice(0, 10) : null };
    });
    const planRows = (data.dailyPlans ?? []).map((p) => {
      const r = p as Record<string, unknown>;
      return { userId, planDate: String(r.planDate ?? "").slice(0, 10), items: Array.isArray(r.items) ? r.items : [], completed: Boolean(r.completed) };
    });

    await db.transaction(async (tx) => {
      await tx.delete(logsTable).where(eq(logsTable.userId, userId));
      await tx.delete(srsItemsTable).where(eq(srsItemsTable.userId, userId));
      await tx.delete(dailyPlansTable).where(eq(dailyPlansTable.userId, userId));
      if (logRows.length > 0) await tx.insert(logsTable).values(logRows);
      if (srsRows.length > 0) await tx.insert(srsItemsTable).values(srsRows as InsertSrsItem[]);
      if (planRows.length > 0) await tx.insert(dailyPlansTable).values(planRows);
    });
  }
}

export const storage = new DatabaseStorage();
