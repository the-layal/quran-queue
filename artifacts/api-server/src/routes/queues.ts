import { Router, type IRouter } from "express";
import { z } from "zod";
import { randomBytes } from "crypto";
import { db, sharedQueuesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

const CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

function genShareId(): string {
  const bytes = randomBytes(8);
  let id = "";
  for (const byte of bytes) {
    id += CHARS[byte % CHARS.length];
  }
  return id;
}

const QueueItemSchema = z.object({
  id: z.string(),
  selectedWordIds: z.array(z.string()),
  brushFineness: z.string(),
  label: z.string(),
  repeatCount: z.number().int().min(0),
});

const SubQueueEntrySchema = z.object({
  isSubQueue: z.literal(true),
  id: z.string(),
  label: z.string(),
  repeatCount: z.number().int().min(0),
  items: z.array(QueueItemSchema),
  collapsed: z.boolean().optional(),
});

const QueueEntrySchema = z.union([SubQueueEntrySchema, QueueItemSchema]);

const CreateQueueBodySchema = z.union([
  z.object({ entries: z.array(QueueEntrySchema).min(1) }),
  z.object({ items: z.array(QueueItemSchema).min(1) }),
]);

router.post("/queues", async (req, res) => {
  const parsed = CreateQueueBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", details: parsed.error.issues });
    return;
  }

  const entries =
    "entries" in parsed.data ? parsed.data.entries : parsed.data.items;

  // Retry up to 5 times to handle the rare case of an ID collision
  let id: string | null = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = genShareId();
    try {
      await db.insert(sharedQueuesTable).values({
        id: candidate,
        items: entries,
      });
      id = candidate;
      break;
    } catch (err: unknown) {
      const isUniqueViolation =
        err != null &&
        typeof err === "object" &&
        "code" in err &&
        (err as { code: string }).code === "23505";
      if (!isUniqueViolation) throw err;
    }
  }

  if (!id) {
    res.status(500).json({ error: "Failed to generate unique ID" });
    return;
  }

  res.status(201).json({ id });
});

router.get("/queues/:id", async (req, res) => {
  const { id } = req.params;
  if (!id || typeof id !== "string" || id.length > 32) {
    res.status(400).json({ error: "Invalid queue ID" });
    return;
  }

  const rows = await db
    .select()
    .from(sharedQueuesTable)
    .where(eq(sharedQueuesTable.id, id))
    .limit(1);

  if (rows.length === 0) {
    res.status(404).json({ error: "Queue not found" });
    return;
  }

  const stored = rows[0].items as unknown[];
  const flatItems = stored.flatMap((e: unknown) => {
    const entry = e as Record<string, unknown>;
    return entry.isSubQueue === true
      ? (entry.items as unknown[])
      : [e];
  });
  res.json({ id: rows[0].id, entries: stored, items: flatItems });
});

export default router;
