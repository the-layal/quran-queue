import { db, logsTable, srsItemsTable, dailyPlansTable, goalsTable } from "@workspace/db";
import { eq, and, lte, desc } from "drizzle-orm";
import type { Log, SrsItem, DailyPlan, InsertLog, InsertSrsItem, InsertDailyPlan, Goal } from "@workspace/db";

export type { Log, SrsItem, DailyPlan, InsertLog, InsertSrsItem, InsertDailyPlan, Goal };

export interface IStorage {
  // Logs
  getLogs(userId: string): Promise<Log[]>;
  createLog(values: InsertLog): Promise<Log>;
  deleteLog(id: number): Promise<void>;
  bulkCreateLogs(items: InsertLog[]): Promise<void>;

  // SRS items
  getSrsItems(userId: string): Promise<SrsItem[]>;
  getAllSrsItems(): Promise<SrsItem[]>;
  getDueSrsItems(userId: string): Promise<SrsItem[]>;
  getSrsItemByReference(userId: string, reference: string): Promise<SrsItem | undefined>;
  createSrsItem(item: InsertSrsItem): Promise<SrsItem>;
  bulkCreateSrsItems(items: InsertSrsItem[]): Promise<void>;
  updateSrsItem(id: number, item: Partial<SrsItem>): Promise<SrsItem>;
  deleteSrsItem(id: number): Promise<void>;

  // Daily plans
  getDailyPlan(userId: string, date: string): Promise<DailyPlan | undefined>;
  getAllDailyPlans(userId: string): Promise<DailyPlan[]>;
  createDailyPlan(plan: InsertDailyPlan): Promise<DailyPlan>;
  bulkCreateDailyPlans(items: InsertDailyPlan[]): Promise<void>;
  restoreBackup(
    userId: string,
    rows: { logs: InsertLog[]; srsItems: InsertSrsItem[]; dailyPlans: InsertDailyPlan[] },
  ): Promise<void>;
  updateDailyPlan(id: number, plan: Partial<DailyPlan>): Promise<DailyPlan>;

  // Goals
  getGoals(userId: string): Promise<Goal[]>;
  createGoal(goal: Omit<Goal, "id" | "createdAt" | "completedAyahsList" | "status" | "qfGoalId">): Promise<Goal>;
  updateGoal(id: number, data: Partial<Goal>): Promise<Goal>;
  deleteGoal(id: number): Promise<void>;

  deleteAllUserData(userId: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getLogs(userId: string): Promise<Log[]> {
    return db.select().from(logsTable).where(eq(logsTable.userId, userId)).orderBy(desc(logsTable.createdAt));
  }

  async createLog(values: InsertLog): Promise<Log> {
    const [row] = await db.insert(logsTable).values(values).returning();
    return row;
  }

  async deleteLog(id: number): Promise<void> {
    await db.delete(logsTable).where(eq(logsTable.id, id));
  }

  async bulkCreateLogs(items: InsertLog[]): Promise<void> {
    if (items.length === 0) return;
    await db.insert(logsTable).values(items);
  }

  async getSrsItems(userId: string): Promise<SrsItem[]> {
    return db.select().from(srsItemsTable).where(eq(srsItemsTable.userId, userId)).orderBy(srsItemsTable.nextReviewDate);
  }

  async getAllSrsItems(): Promise<SrsItem[]> {
    return db.select().from(srsItemsTable);
  }

  async getDueSrsItems(userId: string): Promise<SrsItem[]> {
    return db.select().from(srsItemsTable)
      .where(and(eq(srsItemsTable.userId, userId), lte(srsItemsTable.nextReviewDate, new Date())))
      .orderBy(srsItemsTable.nextReviewDate);
  }

  async getSrsItemByReference(userId: string, reference: string): Promise<SrsItem | undefined> {
    const [row] = await db.select().from(srsItemsTable)
      .where(and(eq(srsItemsTable.userId, userId), eq(srsItemsTable.reference, reference)));
    return row;
  }

  async createSrsItem(item: InsertSrsItem): Promise<SrsItem> {
    const [row] = await db.insert(srsItemsTable).values(item).returning();
    return row;
  }

  async bulkCreateSrsItems(items: InsertSrsItem[]): Promise<void> {
    if (items.length === 0) return;
    await db.insert(srsItemsTable).values(items);
  }

  async updateSrsItem(id: number, item: Partial<SrsItem>): Promise<SrsItem> {
    const [row] = await db.update(srsItemsTable).set(item).where(eq(srsItemsTable.id, id)).returning();
    return row;
  }

  async deleteSrsItem(id: number): Promise<void> {
    await db.delete(srsItemsTable).where(eq(srsItemsTable.id, id));
  }

  async getDailyPlan(userId: string, date: string): Promise<DailyPlan | undefined> {
    const [row] = await db.select().from(dailyPlansTable)
      .where(and(eq(dailyPlansTable.userId, userId), eq(dailyPlansTable.date, date)));
    return row;
  }

  async getAllDailyPlans(userId: string): Promise<DailyPlan[]> {
    return db.select().from(dailyPlansTable).where(eq(dailyPlansTable.userId, userId)).orderBy(desc(dailyPlansTable.date));
  }

  async createDailyPlan(plan: InsertDailyPlan): Promise<DailyPlan> {
    const [row] = await db.insert(dailyPlansTable).values(plan).returning();
    return row;
  }

  async bulkCreateDailyPlans(items: InsertDailyPlan[]): Promise<void> {
    if (items.length === 0) return;
    await db.insert(dailyPlansTable).values(items);
  }

  async updateDailyPlan(id: number, plan: Partial<DailyPlan>): Promise<DailyPlan> {
    const [row] = await db.update(dailyPlansTable).set(plan).where(eq(dailyPlansTable.id, id)).returning();
    return row;
  }

  async deleteAllUserData(userId: string): Promise<void> {
    await db.delete(logsTable).where(eq(logsTable.userId, userId));
    await db.delete(srsItemsTable).where(eq(srsItemsTable.userId, userId));
    await db.delete(dailyPlansTable).where(eq(dailyPlansTable.userId, userId));
    await db.delete(goalsTable).where(eq(goalsTable.userId, userId));
  }

  async restoreBackup(
    userId: string,
    rows: { logs: InsertLog[]; srsItems: InsertSrsItem[]; dailyPlans: InsertDailyPlan[] },
  ): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.delete(logsTable).where(eq(logsTable.userId, userId));
      await tx.delete(srsItemsTable).where(eq(srsItemsTable.userId, userId));
      await tx.delete(dailyPlansTable).where(eq(dailyPlansTable.userId, userId));
      if (rows.logs.length > 0) await tx.insert(logsTable).values(rows.logs);
      if (rows.srsItems.length > 0) await tx.insert(srsItemsTable).values(rows.srsItems);
      if (rows.dailyPlans.length > 0) await tx.insert(dailyPlansTable).values(rows.dailyPlans);
    });
  }

  async getGoals(userId: string): Promise<Goal[]> {
    return db.select().from(goalsTable)
      .where(eq(goalsTable.userId, userId))
      .orderBy(desc(goalsTable.createdAt));
  }

  async createGoal(goal: Omit<Goal, "id" | "createdAt" | "completedAyahsList" | "status" | "qfGoalId">): Promise<Goal> {
    const [row] = await db.insert(goalsTable).values({
      ...goal,
      completedAyahsList: [],
      status: "active",
      qfGoalId: null,
    }).returning();
    return row;
  }

  async updateGoal(id: number, data: Partial<Goal>): Promise<Goal> {
    const [row] = await db.update(goalsTable).set(data).where(eq(goalsTable.id, id)).returning();
    return row;
  }

  async deleteGoal(id: number): Promise<void> {
    await db.delete(goalsTable).where(eq(goalsTable.id, id));
  }
}

export const storage = new DatabaseStorage();
