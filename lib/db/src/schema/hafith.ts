import { pgTable, text, integer, timestamp, jsonb, date, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const logsTable = pgTable("logs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: text("user_id").notNull(),
  type: text("type").notNull(),
  reference: text("reference").notNull(),
  vibeScale: integer("vibe_scale").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const srsItemsTable = pgTable("srs_items", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: text("user_id").notNull(),
  type: text("type").notNull(),
  reference: text("reference").notNull(),
  easeFactor: integer("ease_factor").notNull().default(250),
  interval: integer("interval").notNull().default(0),
  repetitions: integer("repetitions").notNull().default(0),
  nextReviewDate: timestamp("next_review_date", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  userReferenceUnique: uniqueIndex("srs_items_user_reference_unique").on(t.userId, t.reference),
}));

export const dailyPlansTable = pgTable("daily_plans", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: text("user_id").notNull(),
  date: date("date").notNull(),
  bandwidth: integer("bandwidth").notNull(),
  plannedItems: jsonb("planned_items").$type<string[]>().notNull().default([]),
  completedItems: jsonb("completed_items").$type<string[]>().notNull().default([]),
  extraRevisions: jsonb("extra_revisions").$type<string[]>().notNull().default([]),
  removedItems: jsonb("removed_items").$type<string[]>().notNull().default([]),
});

export const goalsTable = pgTable("goals", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: text("user_id").notNull(),
  surahNumber: integer("surah_number").notNull(),
  ayahStart: integer("ayah_start").notNull(),
  ayahEnd: integer("ayah_end").notNull(),
  targetDate: date("target_date").notNull(),
  dailyTarget: integer("daily_target").notNull(),
  completedAyahsList: jsonb("completed_ayahs_list").$type<number[]>().notNull().default([]),
  status: text("status").notNull().default("active"),
  qfGoalId: text("qf_goal_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const bookmarksTable = pgTable("bookmarks", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: text("user_id").notNull(),
  surahNumber: integer("surah_number").notNull(),
  ayahNumber: integer("ayah_number").notNull(),
  qfBookmarkId: text("qf_bookmark_id"),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  userAyahUnique: uniqueIndex("bookmarks_user_ayah_unique").on(t.userId, t.surahNumber, t.ayahNumber),
}));

export const insertLogSchema = createInsertSchema(logsTable).omit({ createdAt: true });
export const insertSrsItemSchema = createInsertSchema(srsItemsTable);
export const insertDailyPlanSchema = createInsertSchema(dailyPlansTable);
export const insertGoalSchema = createInsertSchema(goalsTable).omit({
  createdAt: true,
  completedAyahsList: true,
  status: true,
  qfGoalId: true,
});
export const insertBookmarkSchema = createInsertSchema(bookmarksTable).omit({ createdAt: true });

export type Log = typeof logsTable.$inferSelect;
export type InsertLog = z.infer<typeof insertLogSchema>;
export type SrsItem = typeof srsItemsTable.$inferSelect;
export type InsertSrsItem = z.infer<typeof insertSrsItemSchema>;
export type DailyPlan = typeof dailyPlansTable.$inferSelect;
export type InsertDailyPlan = z.infer<typeof insertDailyPlanSchema>;
export type Goal = typeof goalsTable.$inferSelect;
export type InsertGoal = z.infer<typeof insertGoalSchema>;
export type Bookmark = typeof bookmarksTable.$inferSelect;
export type InsertBookmark = z.infer<typeof insertBookmarkSchema>;
