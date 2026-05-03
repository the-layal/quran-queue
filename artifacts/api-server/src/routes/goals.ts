import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import { storage } from "../storage/index";
import { qfTokenService } from "../lib/qfTokenService";

const router: IRouter = Router();

const QF_GOALS_URL = "https://api.quran.foundation/api/v4/user/goals";

function isAuth(req: Request, res: Response): req is Request & { user: NonNullable<typeof req.user> } {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}

async function syncGoalToQF(userId: string, goal: {
  surahNumber: number;
  ayahStart: number;
  ayahEnd: number;
  targetDate: string;
  dailyTarget: number;
}): Promise<string | null> {
  try {
    const token = await qfTokenService.getToken(userId);
    if (!token) return null;

    const res = await fetch(QF_GOALS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        type: "memorization",
        surah_id: goal.surahNumber,
        start_verse: goal.ayahStart,
        end_verse: goal.ayahEnd,
        target_date: goal.targetDate,
        daily_target: goal.dailyTarget,
      }),
    });

    if (!res.ok) return null;
    const data = (await res.json()) as { id?: string | number };
    return data.id ? String(data.id) : null;
  } catch {
    return null;
  }
}

async function pushProgressToQF(userId: string, qfGoalId: string, completedCount: number, totalCount: number): Promise<void> {
  try {
    const token = await qfTokenService.getToken(userId);
    if (!token) return;

    await fetch(`${QF_GOALS_URL}/${qfGoalId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        completed_verses: completedCount,
        total_verses: totalCount,
        progress_percent: totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0,
      }),
    });
  } catch {
    // silent — local goal is the source of truth
  }
}

const createGoalSchema = z.object({
  surahNumber: z.number().int().min(1).max(114),
  ayahStart: z.number().int().min(1),
  ayahEnd: z.number().int().min(1),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dailyTarget: z.number().int().min(1),
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

    const goal = await storage.createGoal({ userId, ...input });

    const qfGoalId = await syncGoalToQF(userId, input);
    if (qfGoalId) {
      await storage.updateGoal(goal.id, { qfGoalId });
      res.status(201).json({ ...goal, qfGoalId });
    } else {
      res.status(201).json(goal);
    }
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

router.get("/goals/qf/sync", async (req: Request, res: Response) => {
  if (!isAuth(req, res)) return;
  try {
    const userId = req.user!.id;
    const token = await qfTokenService.getToken(userId);
    if (!token) { res.json({ synced: 0 }); return; }

    const qfRes = await fetch(QF_GOALS_URL, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!qfRes.ok) { res.json({ synced: 0 }); return; }

    const qfGoals = (await qfRes.json()) as Array<{
      id: string | number;
      surah_id?: number;
      start_verse?: number;
      end_verse?: number;
      target_date?: string;
      daily_target?: number;
    }>;

    const existingGoals = await storage.getGoals(userId);
    const existingQfIds = new Set(existingGoals.map((g) => g.qfGoalId).filter(Boolean));

    let synced = 0;
    for (const qg of qfGoals) {
      const qfId = String(qg.id);
      if (existingQfIds.has(qfId)) continue;
      if (!qg.surah_id || !qg.start_verse || !qg.end_verse || !qg.target_date) continue;

      await storage.createGoal({
        userId,
        surahNumber: qg.surah_id,
        ayahStart: qg.start_verse,
        ayahEnd: qg.end_verse,
        targetDate: qg.target_date,
        dailyTarget: qg.daily_target ?? 1,
      });
      synced++;
    }

    res.json({ synced });
  } catch {
    res.json({ synced: 0 });
  }
});

export { pushProgressToQF };
export default router;
