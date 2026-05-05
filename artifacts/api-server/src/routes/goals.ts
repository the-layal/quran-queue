import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import { storage } from "../storage/index";
import { syncGoalToQF, pushProgressToQF, fetchQFGoals } from "../lib/qfGoalsService";
import { SURAHS } from "../lib/page-utils";

const router: IRouter = Router();

function isAuth(req: Request, res: Response): req is Request & { user: NonNullable<typeof req.user> } {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}

function getSurahAyahCount(surahNumber: number): number {
  const s = SURAHS.find((x) => x.id === surahNumber);
  return s?.ayahCount ?? 0;
}

const createGoalSchema = z.object({
  surahNumber: z.number().int().min(1).max(114),
  ayahStart: z.number().int().min(1),
  ayahEnd: z.number().int().min(1),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dailyTarget: z.number().int().min(1),
  // Optional migration fields — passed when importing guest goals after sign-in
  completedAyahsList: z.array(z.number().int()).optional(),
  status: z.enum(["active", "complete"]).optional(),
});

router.get("/goals", async (req: Request, res: Response) => {
  if (!isAuth(req, res)) return;
  const goals = await storage.getGoals(req.user!.id);
  res.json(goals);
});

router.post("/goals", async (req: Request, res: Response) => {
  if (!isAuth(req, res)) return;
  try {
    const userId = req.user!.id;
    const input = createGoalSchema.parse(req.body);

    if (input.ayahEnd < input.ayahStart) {
      res.status(400).json({ message: "ayahEnd must be >= ayahStart" });
      return;
    }

    // Server-side surah verse count validation
    const surahAyahCount = getSurahAyahCount(input.surahNumber);
    if (surahAyahCount > 0) {
      if (input.ayahStart > surahAyahCount) {
        res.status(400).json({ message: `ayahStart exceeds surah ${input.surahNumber}'s verse count (${surahAyahCount})` });
        return;
      }
      if (input.ayahEnd > surahAyahCount) {
        res.status(400).json({ message: `ayahEnd exceeds surah ${input.surahNumber}'s verse count (${surahAyahCount})` });
        return;
      }
    }

    const goal = await storage.createGoal({
      userId,
      surahNumber: input.surahNumber,
      ayahStart: input.ayahStart,
      ayahEnd: input.ayahEnd,
      targetDate: input.targetDate,
      dailyTarget: input.dailyTarget,
      completedAyahsList: input.completedAyahsList,
      status: input.status,
    });

    // Best-effort QF sync — fire async, don't block the response
    syncGoalToQF(userId, input).then(async (qfGoalId) => {
      if (qfGoalId) await storage.updateGoal(goal.id, { qfGoalId });
    }).catch(() => {});

    res.status(201).json(goal);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ message: err.errors[0].message });
      return;
    }
    res.status(500).json({ message: "Internal Server Error" });
  }
});

const updateGoalSchema = z.object({
  status: z.enum(["active", "complete"]).optional(),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dailyTarget: z.number().int().min(1).optional(),
});

router.patch("/goals/:id", async (req: Request, res: Response) => {
  if (!isAuth(req, res)) return;
  try {
    const userId = req.user!.id;
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) { res.status(400).json({ message: "Invalid goal id" }); return; }

    const goals = await storage.getGoals(userId);
    const goal = goals.find((g) => g.id === id);
    if (!goal) { res.status(404).json({ message: "Goal not found" }); return; }

    const input = updateGoalSchema.parse(req.body);
    const updated = await storage.updateGoal(id, input);

    // Push status/date changes to QF in background
    if (updated.qfGoalId) {
      const total = updated.ayahEnd - updated.ayahStart + 1;
      const completed = (updated.completedAyahsList || []).length;
      const isComplete = updated.status === "complete";
      void pushProgressToQF(userId, updated.qfGoalId, completed, total, isComplete);
    }

    res.json(updated);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ message: err.errors[0].message });
      return;
    }
    res.status(500).json({ message: "Internal Server Error" });
  }
});

router.delete("/goals/:id", async (req: Request, res: Response) => {
  if (!isAuth(req, res)) return;
  try {
    const userId = req.user!.id;
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) { res.status(400).json({ message: "Invalid goal id" }); return; }

    const goals = await storage.getGoals(userId);
    const goal = goals.find((g) => g.id === id);
    if (!goal) { res.status(404).json({ message: "Goal not found" }); return; }

    await storage.deleteGoal(id);
    res.json({ deleted: true });
  } catch {
    res.status(500).json({ message: "Internal Server Error" });
  }
});

/**
 * GET /api/goals/qf/sync
 * Imports goals from QF that don't exist locally yet and returns the count.
 */
router.get("/goals/qf/sync", async (req: Request, res: Response) => {
  if (!isAuth(req, res)) return;
  if (!process.env.QF_CLIENT_ID) {
    res.status(503).json({ message: "Quran Foundation integration is not configured on this server" });
    return;
  }
  try {
    const userId = req.user!.id;
    const qfGoals = await fetchQFGoals(userId);
    if (qfGoals.length === 0) { res.json({ synced: 0 }); return; }

    const existingGoals = await storage.getGoals(userId);
    const existingQfIds = new Set(existingGoals.map((g) => g.qfGoalId).filter(Boolean));

    let synced = 0;
    for (const qg of qfGoals) {
      if (existingQfIds.has(qg.id)) continue;
      if (!qg.surah_id || !qg.start_verse || !qg.end_verse || !qg.target_date) continue;

      const created = await storage.createGoal({
        userId,
        surahNumber: qg.surah_id,
        ayahStart: qg.start_verse,
        ayahEnd: qg.end_verse,
        targetDate: qg.target_date,
        dailyTarget: qg.daily_target ?? 1,
      });
      // Store qfGoalId so future syncs don't reimport it
      await storage.updateGoal(created.id, { qfGoalId: qg.id });
      synced++;
    }

    res.json({ synced });
  } catch {
    res.json({ synced: 0 });
  }
});

export default router;
