import { pgTable, text, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const sharedQueuesTable = pgTable("shared_queues", {
  id: text("id").primaryKey(),
  items: jsonb("items").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertSharedQueueSchema = createInsertSchema(sharedQueuesTable);
export type InsertSharedQueue = z.infer<typeof insertSharedQueueSchema>;
export type SharedQueue = typeof sharedQueuesTable.$inferSelect;

export * from "./auth";
export * from "./hafith";
