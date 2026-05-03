import { Router, type IRouter, type Request, type Response } from "express";
import { storage } from "../storage/index";

const router: IRouter = Router();

function isAuth(req: Request, res: Response): req is Request & { user: NonNullable<typeof req.user> } {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}

// ── SM-2 spaced repetition algorithm ──────────────────────────────────────────

function sm2(quality: number, easeFactor: number, interval: number, repetitions: number) {
  if (quality < 0 || quality > 5) throw new Error("Quality must be 0-5");

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
    lastReviewed: new Date().toISOString().slice(0, 10),
  };
}

// ── Logs ──────────────────────────────────────────────────────────────────────

router.get("/logs", async (req: Request, res: Response) => {
  if (!isAuth(req, res)) return;
  res.json(await storage.getLogs(req.user!.id));
});

router.post("/logs", async (req: Request, res: Response) => {
  if (!isAuth(req, res)) return;
  const userId = req.user!.id;
  const { surah, ayahStart, ayahEnd, quality, notes } = req.body as {
    surah: number;
    ayahStart: number;
    ayahEnd: number;
    quality: number;
    notes?: string;
  };

  if (!surah || !ayahStart || !ayahEnd || quality === undefined) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }
  if (quality < 0 || quality > 5) {
    res.status(400).json({ error: "Quality must be 0-5" });
    return;
  }

  const log = await storage.createLog({ userId, surah, ayahStart, ayahEnd, quality, notes: notes ?? null });

  const existing = await storage.getSrsItem(userId, surah, ayahStart, ayahEnd);
  const current = existing ?? { easeFactor: 2.5, interval: 1, repetitions: 0 };
  const updated = sm2(quality, current.easeFactor, current.interval, current.repetitions);
  await storage.upsertSrsItem(userId, surah, ayahStart, ayahEnd, updated);

  res.status(201).json(log);
});

router.delete("/logs/:id", async (req: Request, res: Response) => {
  if (!isAuth(req, res)) return;
  const id = parseInt(String(req.params.id), 10);
  const deleted = await storage.deleteLog(id, req.user!.id);
  if (!deleted) { res.status(404).json({ error: "Log not found" }); return; }
  res.json({ success: true });
});

// ── SRS items ─────────────────────────────────────────────────────────────────

router.get("/srs", async (req: Request, res: Response) => {
  if (!isAuth(req, res)) return;
  res.json(await storage.getSrsItems(req.user!.id));
});

// ── Stats ─────────────────────────────────────────────────────────────────────

router.get("/stats", async (req: Request, res: Response) => {
  if (!isAuth(req, res)) return;
  res.json(await storage.getStats(req.user!.id));
});

// ── Daily Plans ───────────────────────────────────────────────────────────────

router.get("/plans/today", async (req: Request, res: Response) => {
  if (!isAuth(req, res)) return;
  res.json(await storage.getTodayPlan(req.user!.id));
});

router.patch("/plans/:id", async (req: Request, res: Response) => {
  if (!isAuth(req, res)) return;
  const id = parseInt(String(req.params.id), 10);
  const { items, completed } = req.body as { items?: unknown[]; completed?: boolean };
  const updates: Partial<{ items: unknown[]; completed: boolean }> = {};
  if (items !== undefined) updates.items = items;
  if (completed !== undefined) updates.completed = completed;
  const updated = await storage.patchPlan(id, req.user!.id, updates);
  if (!updated) { res.status(404).json({ error: "Plan not found" }); return; }
  res.json(updated);
});

// ── Backup / Restore ──────────────────────────────────────────────────────────

router.get("/backup", async (req: Request, res: Response) => {
  if (!isAuth(req, res)) return;
  const data = await storage.backup(req.user!.id);
  const backup = { version: 1, exportedAt: new Date().toISOString(), ...data };
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", `attachment; filename="hafith-backup-${new Date().toISOString().slice(0, 10)}.json"`);
  res.json(backup);
});

router.post("/restore", async (req: Request, res: Response) => {
  if (!isAuth(req, res)) return;
  const body = req.body as Record<string, unknown>;
  if (typeof body !== "object" || body === null || body.version === undefined) {
    res.status(400).json({ error: "Invalid backup format: missing version field" });
    return;
  }
  const { logs, srsItems, dailyPlans } = body;
  if (logs !== undefined && !Array.isArray(logs)) { res.status(400).json({ error: "logs must be an array" }); return; }
  if (srsItems !== undefined && !Array.isArray(srsItems)) { res.status(400).json({ error: "srsItems must be an array" }); return; }
  if (dailyPlans !== undefined && !Array.isArray(dailyPlans)) { res.status(400).json({ error: "dailyPlans must be an array" }); return; }
  await storage.restore(req.user!.id, { logs: logs as unknown[], srsItems: srsItems as unknown[], dailyPlans: dailyPlans as unknown[] });
  res.json({ success: true });
});

export default router;
