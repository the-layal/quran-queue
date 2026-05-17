import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import { storage } from "../storage/index";
import {
  getPageEquivalent,
  getPagesForReference,
  groupConsecutivePages,
  getAyahsForReference,
} from "../lib/page-utils";
import { pushProgressToQF } from "../lib/qfGoalsService";

const router: IRouter = Router();

function isAuth(req: Request, res: Response): req is Request & { user: NonNullable<typeof req.user> } {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}

// ── SM-2 spaced repetition (easeFactor stored as int *100) ────────────────────

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

  const nextReviewDate = new Date();
  nextReviewDate.setDate(nextReviewDate.getDate() + newInterval);

  return { easeFactor: Math.round(newEase), interval: newInterval, repetitions: newReps, nextReviewDate };
}

function getYesterdayStr(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split("T")[0];
}

function getTodayStr(): string {
  return new Date().toISOString().split("T")[0];
}

function expandSurahRange(reference: string): string[] {
  const match = reference.match(/^surah:(\d+)-(\d+)$/);
  if (!match) return [reference];
  const from = parseInt(match[1], 10);
  const to = parseInt(match[2], 10);
  if (from === to) return [`surah:${from}`];
  const refs: string[] = [];
  for (let s = from; s <= Math.min(to, 114); s++) refs.push(`surah:${s}`);
  return refs;
}

const logInputSchema = z.object({
  type: z.string().min(1),
  reference: z.string().min(1),
  vibeScale: z.number().int().min(1).max(5),
});

// ── Logs ──────────────────────────────────────────────────────────────────────

router.get("/logs", async (req: Request, res: Response) => {
  if (!isAuth(req, res)) return;
  res.json(await storage.getLogs(req.user!.id));
});

router.post("/logs", async (req: Request, res: Response) => {
  if (!isAuth(req, res)) return;
  try {
    const userId = req.user!.id;
    const input = logInputSchema.parse(req.body);
    const log = await storage.createLog({ userId, ...input });

    const srsRefs = expandSurahRange(input.reference);
    for (const ref of srsRefs) {
      let srsItem = await storage.getSrsItemByReference(userId, ref);
      if (!srsItem) {
        srsItem = await storage.createSrsItem({
          userId,
          type: input.type,
          reference: ref,
          easeFactor: 250,
          interval: 0,
          repetitions: 0,
          nextReviewDate: new Date(),
        });
      }
      const update = calculateNextReview(srsItem.easeFactor, srsItem.interval, srsItem.repetitions, input.vibeScale);
      await storage.updateSrsItem(srsItem.id, update);
    }

    // Expand any reference type (ayah, ayah range, page, surah) and batch-update all matching goals
    const ayahGroups = getAyahsForReference(input.reference);
    const ayahPairs = ayahGroups.flatMap((g) => g.ayahs.map((a) => ({ surah: g.surah, ayah: a })));
    void updateGoalProgressForAyahs(userId, ayahPairs);

    res.status(201).json(log);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join(".") });
      return;
    }
    res.status(500).json({ message: "Internal Server Error" });
  }
});

router.delete("/logs/:id", async (req: Request, res: Response) => {
  if (!isAuth(req, res)) return;
  try {
    const userId = req.user!.id;
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) { res.status(400).json({ message: "Invalid log id" }); return; }

    const allLogs = await storage.getLogs(userId);
    const log = allLogs.find((l) => l.id === id);
    if (!log) { res.status(404).json({ message: "Log not found" }); return; }

    await storage.deleteLog(id);
    let remainingLogs = allLogs.filter((l) => l.id !== id);

    const srsRefsToRemove = new Set<string>();

    // Cascade: delete companion ayah logs and mark their SRS for removal when
    // no remaining segment log still fans out to those ayahs.
    if (log.type !== "ayah") {
      for (const g of getAyahsForReference(log.reference)) {
        for (const a of g.ayahs) {
          const stillCoveredBySegment = remainingLogs.some(
            (l) =>
              l.type !== "ayah" &&
              getAyahsForReference(l.reference).some(
                (gg) => gg.surah === g.surah && gg.ayahs.includes(a),
              ),
          );
          if (stillCoveredBySegment) continue;
          const ayahRef = `ayah:${g.surah}:${a}`;
          const companions = remainingLogs.filter((l) => l.reference === ayahRef);
          for (const cl of companions) await storage.deleteLog(cl.id);
          remainingLogs = remainingLogs.filter((l) => l.reference !== ayahRef);
          srsRefsToRemove.add(ayahRef);
        }
      }
    }

    // Mark expanded segment SRS refs for removal when no remaining log covers them.
    for (const segRef of expandSurahRange(log.reference)) {
      const stillCovered = remainingLogs.some(
        (l) => l.reference === segRef || expandSurahRange(l.reference).includes(segRef),
      );
      if (!stillCovered) srsRefsToRemove.add(segRef);
    }

    let srsRemoved = false;
    for (const ref of srsRefsToRemove) {
      const srsItem = await storage.getSrsItemByReference(userId, ref);
      if (srsItem) {
        await storage.deleteSrsItem(srsItem.id);
        srsRemoved = true;
      }
    }

    res.json({ deleted: true, srsRemoved });
  } catch {
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// ── SRS items ─────────────────────────────────────────────────────────────────

router.get("/srs", async (req: Request, res: Response) => {
  if (!isAuth(req, res)) return;
  res.json(await storage.getSrsItems(req.user!.id));
});

router.get("/srs/due", async (req: Request, res: Response) => {
  if (!isAuth(req, res)) return;
  res.json(await storage.getDueSrsItems(req.user!.id));
});

const SEED_TABLE: Record<number, { interval: number; repetitions: number; easeFactor: number }> = {
  1: { interval: 1,  repetitions: 1, easeFactor: 220 },
  2: { interval: 3,  repetitions: 2, easeFactor: 235 },
  3: { interval: 7,  repetitions: 3, easeFactor: 250 },
  4: { interval: 21, repetitions: 4, easeFactor: 265 },
  5: { interval: 60, repetitions: 5, easeFactor: 280 },
};

const seedSchema = z.array(z.object({
  reference: z.string().min(1),
  vibe: z.number().int().min(1).max(5),
})).max(114);

router.post("/srs/seed", async (req: Request, res: Response) => {
  if (!isAuth(req, res)) return;
  try {
    const userId = req.user!.id;
    const items = seedSchema.parse(req.body);
    const now = new Date();
    let seeded = 0;
    for (const { reference, vibe } of items) {
      const existing = await storage.getSrsItemByReference(userId, reference);
      if (existing) continue;
      const seed = SEED_TABLE[vibe] ?? SEED_TABLE[3];
      const nextReviewDate = new Date(now);
      nextReviewDate.setDate(nextReviewDate.getDate() + seed.interval);
      await storage.createSrsItem({
        userId,
        type: "surah",
        reference,
        easeFactor: seed.easeFactor,
        interval: seed.interval,
        repetitions: seed.repetitions,
        nextReviewDate,
      });
      // Write a log entry so the Library shows the surah immediately with the right vibe colour.
      await storage.createLog({ userId, type: "surah", reference, vibeScale: vibe });
      seeded++;
    }
    res.json({ seeded });
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: err.issues }); return; }
    throw err;
  }
});

// ── SRS retire / unretire ─────────────────────────────────────────────────────

const retireSchema = z.object({ reference: z.string().min(1) });

router.post("/srs/retire", async (req: Request, res: Response) => {
  if (!isAuth(req, res)) return;
  try {
    const userId = req.user!.id;
    const { reference } = retireSchema.parse(req.body);
    let item = await storage.getSrsItemByReference(userId, reference);
    if (!item) {
      const far = new Date();
      far.setFullYear(far.getFullYear() + 10);
      item = await storage.createSrsItem({
        userId, type: "surah", reference,
        easeFactor: 280, interval: 365, repetitions: 5,
        nextReviewDate: far,
      });
    }
    await storage.updateSrsItem(item.id, { retired: true, retiredAt: new Date() });
    const todayPlan = await storage.getDailyPlan(userId, getTodayStr());
    if (todayPlan) {
      const plannedItems = (todayPlan.plannedItems || []).filter((r) => r !== reference);
      await storage.updateDailyPlan(todayPlan.id, { plannedItems });
    }
    res.json({ retired: true });
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: err.issues }); return; }
    throw err;
  }
});

router.post("/srs/unretire", async (req: Request, res: Response) => {
  if (!isAuth(req, res)) return;
  try {
    const userId = req.user!.id;
    const { reference } = retireSchema.parse(req.body);
    const item = await storage.getSrsItemByReference(userId, reference);
    if (!item) { res.status(404).json({ error: "SRS item not found" }); return; }
    const next = new Date();
    next.setDate(next.getDate() + 60);
    await storage.updateSrsItem(item.id, { retired: false, retiredAt: null, interval: 60, nextReviewDate: next });
    res.json({ retired: false });
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: err.issues }); return; }
    throw err;
  }
});

// ── Daily plans ───────────────────────────────────────────────────────────────

router.get("/plans/today", async (req: Request, res: Response) => {
  if (!isAuth(req, res)) return;
  const plan = await storage.getDailyPlan(req.user!.id, getTodayStr());
  res.json(plan ?? null);
});

router.get("/plans", async (req: Request, res: Response) => {
  if (!isAuth(req, res)) return;
  res.json(await storage.getAllDailyPlans(req.user!.id));
});

const planCreateSchema = z.object({ bandwidth: z.number().int().min(1).max(604) });

const TOTAL_QURAN_PAGES = 604;

router.post("/plans/today", async (req: Request, res: Response) => {
  if (!isAuth(req, res)) return;
  try {
    const userId = req.user!.id;
    const input = planCreateSchema.parse(req.body);
    const todayStr = getTodayStr();
    let plan = await storage.getDailyPlan(userId, todayStr);

    // Direct port of the original collectCandidatePages from quran-review-SRS/server/routes.ts.
    // Collects page numbers from due SRS items first, then all SRS items — naturally
    // bounded to what the user has registered. Never touches pages outside SRS.
    const collectCandidatePages = async (existingPages: Set<number>): Promise<number[]> => {
      const candidatePages: number[] = [];
      const dueItems = await storage.getDueSrsItems(userId);
      for (const item of dueItems) {
        for (const p of getPagesForReference(item.reference)) {
          if (!existingPages.has(p) && !candidatePages.includes(p)) {
            candidatePages.push(p);
          }
        }
      }
      const allItems = (await storage.getSrsItems(userId)).filter((i) => !i.retired);
      for (const item of allItems) {
        for (const p of getPagesForReference(item.reference)) {
          if (!existingPages.has(p) && !candidatePages.includes(p)) {
            candidatePages.push(p);
          }
        }
      }
      return candidatePages;
    };

    const allSrsFull = await storage.getSrsItems(userId);
    const retiredSet = new Set(allSrsFull.filter((s) => s.retired).map((s) => s.reference));
    const srsRefSet = new Set(allSrsFull.map((s) => s.reference));

    if (!plan) {
      const carryoverRefs: string[] = [];
      const yesterdayPlan = await storage.getDailyPlan(userId, getYesterdayStr());
      if (yesterdayPlan) {
        const completed = yesterdayPlan.completedItems || [];
        const planned = yesterdayPlan.plannedItems || [];
        for (const ref of planned)
          if (!completed.includes(ref) && !retiredSet.has(ref) && srsRefSet.has(ref)) carryoverRefs.push(ref);
      }

      let currentPageCount = 0;
      const plannedItems: string[] = [];
      const existingPages = new Set<number>();

      for (const ref of carryoverRefs) {
        const count = getPageEquivalent(ref);
        if (currentPageCount + count <= input.bandwidth || plannedItems.length === 0) {
          plannedItems.push(ref);
          currentPageCount += count;
          for (const p of getPagesForReference(ref)) existingPages.add(p);
        }
        if (currentPageCount >= input.bandwidth) break;
      }

      if (currentPageCount < input.bandwidth) {
        const candidatePages = await collectCandidatePages(existingPages);
        let i = 0;
        while (currentPageCount < input.bandwidth && i < candidatePages.length) {
          const batchEnd = Math.min(i + (input.bandwidth - currentPageCount), candidatePages.length);
          const batch = candidatePages.slice(i, batchEnd);
          const refs = groupConsecutivePages(batch);
          for (const ref of refs) {
            const count = getPageEquivalent(ref);
            if (currentPageCount + count > input.bandwidth && plannedItems.length > 0) break;
            plannedItems.push(ref);
            currentPageCount += count;
            for (const p of getPagesForReference(ref)) existingPages.add(p);
          }
          i = batchEnd;
        }
      }

      plan = await storage.createDailyPlan({
        userId,
        date: todayStr,
        bandwidth: input.bandwidth,
        plannedItems,
        completedItems: [],
        extraRevisions: [],
      });
    } else {
      const completedItems = plan.completedItems || [];
      const existingPlanned = (plan.plannedItems || []).filter(
        (r) => (srsRefSet.has(r) || completedItems.includes(r)) && (!retiredSet.has(r) || completedItems.includes(r)),
      );
      let currentPageCount = 0;
      const existingPages = new Set<number>();

      for (const ref of existingPlanned) {
        currentPageCount += getPageEquivalent(ref);
        for (const p of getPagesForReference(ref)) existingPages.add(p);
      }

      if (input.bandwidth > currentPageCount) {
        const plannedItems = [...existingPlanned];
        const candidatePages = await collectCandidatePages(existingPages);
        let i = 0;
        while (currentPageCount < input.bandwidth && i < candidatePages.length) {
          const batchEnd = Math.min(i + (input.bandwidth - currentPageCount), candidatePages.length);
          const batch = candidatePages.slice(i, batchEnd);
          const refs = groupConsecutivePages(batch);
          for (const ref of refs) {
            const count = getPageEquivalent(ref);
            if (currentPageCount + count > input.bandwidth && plannedItems.length > 0) break;
            plannedItems.push(ref);
            currentPageCount += count;
            for (const p of getPagesForReference(ref)) existingPages.add(p);
          }
          i = batchEnd;
        }
        plan = await storage.updateDailyPlan(plan.id, { bandwidth: input.bandwidth, plannedItems });
      } else if (input.bandwidth < currentPageCount) {
        const plannedItems: string[] = [];
        let newPageCount = 0;
        for (const ref of existingPlanned) {
          if (completedItems.includes(ref)) {
            plannedItems.push(ref);
            newPageCount += getPageEquivalent(ref);
            continue;
          }
          const count = getPageEquivalent(ref);
          if (newPageCount + count <= input.bandwidth) {
            plannedItems.push(ref);
            newPageCount += count;
          }
        }
        plan = await storage.updateDailyPlan(plan.id, { bandwidth: input.bandwidth, plannedItems });
      } else {
        plan = await storage.updateDailyPlan(plan.id, { bandwidth: input.bandwidth, plannedItems: existingPlanned });
      }
    }

    res.json(plan);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join(".") });
      return;
    }
    res.status(500).json({ message: "Internal Server Error" });
  }
});

const addMoreSchema = z.object({ count: z.number().int().min(1).max(20) });

router.post("/plans/today/add-more", async (req: Request, res: Response) => {
  if (!isAuth(req, res)) return;
  try {
    const userId = req.user!.id;
    const input = addMoreSchema.parse(req.body);
    let plan = await storage.getDailyPlan(userId, getTodayStr());
    if (!plan) { res.status(400).json({ message: "No plan for today. Generate a plan first." }); return; }

    const currentItems = plan.plannedItems || [];
    const existingPages = new Set<number>();
    for (const ref of currentItems) for (const p of getPagesForReference(ref)) existingPages.add(p);

    const allItems = await storage.getSrsItems(userId);

    // Build a set of page numbers the user explicitly dismissed today
    const dismissedPages = new Set<number>();
    for (const ref of (plan.removedItems || [])) {
      for (const p of getPagesForReference(ref)) dismissedPages.add(p);
    }

    const newRefs: string[] = [];
    let added = 0;
    // Due SRS refs first, preserving original references
    const dueItems = await storage.getDueSrsItems(userId);
    const dueRefSet = new Set(dueItems.map((i) => i.reference));
    for (const item of dueItems) {
      if (added >= input.count) break;
      if (currentItems.includes(item.reference) || newRefs.includes(item.reference)) continue;
      const pages = getPagesForReference(item.reference);
      if (pages.every((p) => existingPages.has(p))) continue;
      if (pages.some((p) => dismissedPages.has(p))) continue;
      newRefs.push(item.reference);
      added += getPageEquivalent(item.reference);
      for (const p of pages) existingPages.add(p);
    }
    // Then non-due, non-retired SRS items (soonest nextReviewDate first) — never go outside user's SRS
    if (added < input.count) {
      const nonDueItems = allItems
        .filter((item) => !item.retired && !dueRefSet.has(item.reference))
        .sort((a, b) => a.nextReviewDate.localeCompare(b.nextReviewDate));
      for (const item of nonDueItems) {
        if (added >= input.count) break;
        if (currentItems.includes(item.reference) || newRefs.includes(item.reference)) continue;
        const pages = getPagesForReference(item.reference);
        if (pages.every((p) => existingPages.has(p))) continue;
        if (pages.some((p) => dismissedPages.has(p))) continue;
        newRefs.push(item.reference);
        added += getPageEquivalent(item.reference);
        for (const p of pages) existingPages.add(p);
      }
    }
    if (newRefs.length > 0) {
      plan = await storage.updateDailyPlan(plan.id, { plannedItems: [...currentItems, ...newRefs] });
    }
    res.json(plan);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join(".") });
      return;
    }
    res.status(500).json({ message: "Internal Server Error" });
  }
});

const completeSchema = z.object({ reference: z.string(), vibeScale: z.number().int().min(1).max(5) });

async function applyVibeToReference(userId: string, type: string, reference: string, vibe: number) {
  await storage.createLog({ userId, type, reference, vibeScale: vibe });
  const srs = await storage.getSrsItemByReference(userId, reference);
  if (srs) {
    const u = calculateNextReview(srs.easeFactor, srs.interval, srs.repetitions, vibe);
    await storage.updateSrsItem(srs.id, u);
  } else {
    const u = calculateNextReview(250, 0, 0, vibe);
    await storage.createSrsItem({ userId, type, reference, ...u });
  }
}

/**
 * Update all matching goals for a batch of (surah, ayah) pairs from a single
 * review event, then push progress to QF once per affected goal (not per ayah).
 */
async function updateGoalProgressForAyahs(
  userId: string,
  ayahPairs: Array<{ surah: number; ayah: number }>,
): Promise<void> {
  if (ayahPairs.length === 0) return;
  try {
    const goals = await storage.getGoals(userId);
    const activeGoals = goals.filter((g) => g.status === "active");
    if (activeGoals.length === 0) return;

    // Build a completed-set per goal, apply all ayahs, then write once per goal
    const goalUpdates = new Map<number, { completedList: number[]; total: number; qfGoalId: string | null | undefined }>();

    for (const { surah, ayah } of ayahPairs) {
      for (const goal of activeGoals) {
        if (goal.surahNumber !== surah || goal.ayahStart > ayah || goal.ayahEnd < ayah) continue;
        if (!goalUpdates.has(goal.id)) {
          goalUpdates.set(goal.id, {
            completedList: [...(goal.completedAyahsList || [])],
            total: goal.ayahEnd - goal.ayahStart + 1,
            qfGoalId: goal.qfGoalId,
          });
        }
        const entry = goalUpdates.get(goal.id)!;
        if (!entry.completedList.includes(ayah)) entry.completedList.push(ayah);
      }
    }

    // Persist each updated goal and push once to QF
    for (const [goalId, { completedList, total, qfGoalId }] of goalUpdates) {
      const isComplete = completedList.length >= total;
      const updated = await storage.updateGoal(goalId, {
        completedAyahsList: completedList,
        status: isComplete ? "complete" : "active",
      });
      // Push progress to QF in background — best-effort, once per goal
      if (qfGoalId ?? updated.qfGoalId) {
        void pushProgressToQF(
          userId,
          (qfGoalId ?? updated.qfGoalId)!,
          updated.completedAyahsList?.length ?? completedList.length,
          total,
          isComplete,
        );
      }
    }
  } catch {
    // non-critical — don't block the response
  }
}

router.post("/plans/today/complete", async (req: Request, res: Response) => {
  if (!isAuth(req, res)) return;
  try {
    const userId = req.user!.id;
    const input = completeSchema.parse(req.body);
    let plan = await storage.getDailyPlan(userId, getTodayStr());
    if (!plan) { res.status(400).json({ message: "No plan for today" }); return; }

    const completedItems = [...(plan.completedItems || [])];
    if (!completedItems.includes(input.reference)) completedItems.push(input.reference);
    plan = await storage.updateDailyPlan(plan.id, { completedItems });

    const type = input.reference.split(":")[0] || "page";
    await applyVibeToReference(userId, type, input.reference, input.vibeScale);

    const ayahGroups = getAyahsForReference(input.reference);
    const ayahPairsComplete: Array<{ surah: number; ayah: number }> = [];
    for (const group of ayahGroups) {
      for (const ayah of group.ayahs) {
        const ayahRef = `ayah:${group.surah}:${ayah}`;
        await applyVibeToReference(userId, "ayah", ayahRef, input.vibeScale);
        ayahPairsComplete.push({ surah: group.surah, ayah });
      }
    }
    void updateGoalProgressForAyahs(userId, ayahPairsComplete);

    res.json(plan);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join(".") });
      return;
    }
    res.status(500).json({ message: "Internal Server Error" });
  }
});

const completeAdvSchema = z.object({
  reference: z.string(),
  ayahVibes: z.array(z.object({
    surah: z.number().int(),
    ayah: z.number().int(),
    vibe: z.number().int().min(1).max(5),
  })),
});

router.post("/plans/today/complete-advanced", async (req: Request, res: Response) => {
  if (!isAuth(req, res)) return;
  try {
    const userId = req.user!.id;
    const input = completeAdvSchema.parse(req.body);
    let plan = await storage.getDailyPlan(userId, getTodayStr());
    if (!plan) { res.status(400).json({ message: "No plan for today" }); return; }
    if (input.ayahVibes.length === 0) { res.status(400).json({ message: "No ayah ratings provided" }); return; }

    const completedItems = [...(plan.completedItems || [])];
    if (!completedItems.includes(input.reference)) completedItems.push(input.reference);
    plan = await storage.updateDailyPlan(plan.id, { completedItems });

    for (const av of input.ayahVibes) {
      const ayahRef = `ayah:${av.surah}:${av.ayah}`;
      await applyVibeToReference(userId, "ayah", ayahRef, av.vibe);
    }
    void updateGoalProgressForAyahs(userId, input.ayahVibes.map((av) => ({ surah: av.surah, ayah: av.ayah })));

    const overallVibe = Math.round(input.ayahVibes.reduce((s, a) => s + a.vibe, 0) / input.ayahVibes.length);
    const refType = input.reference.split(":")[0] || "page";
    await applyVibeToReference(userId, refType, input.reference, overallVibe);

    res.json(plan);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join(".") });
      return;
    }
    res.status(500).json({ message: "Internal Server Error" });
  }
});

const removeItemSchema = z.object({ reference: z.string() });

router.post("/plans/today/remove-item", async (req: Request, res: Response) => {
  if (!isAuth(req, res)) return;
  try {
    const userId = req.user!.id;
    const input = removeItemSchema.parse(req.body);
    const plan = await storage.getDailyPlan(userId, getTodayStr());
    if (!plan) { res.status(400).json({ message: "No plan exists for today" }); return; }

    const plannedItems = (plan.plannedItems || []).filter((r) => r !== input.reference);
    const completedItems = (plan.completedItems || []).filter((r) => r !== input.reference);
    const prevRemoved = plan.removedItems || [];
    const removedItems = prevRemoved.includes(input.reference) ? prevRemoved : [...prevRemoved, input.reference];
    const updated = await storage.updateDailyPlan(plan.id, { plannedItems, completedItems, removedItems });

    const removedPages = getPagesForReference(input.reference);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    const allSrs = await storage.getSrsItems(userId);
    const now = new Date();
    for (const srs of allSrs) {
      const overlap = getPagesForReference(srs.reference).some(p => removedPages.includes(p));
      if (overlap && srs.nextReviewDate <= now) {
        await storage.updateSrsItem(srs.id, { nextReviewDate: tomorrow });
      }
    }

    res.json(updated);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join(".") });
      return;
    }
    res.status(500).json({ message: "Internal Server Error" });
  }
});

router.post("/plans/today/perfectly-known", async (req: Request, res: Response) => {
  if (!isAuth(req, res)) return;
  try {
    const userId = req.user!.id;
    let plan = await storage.getDailyPlan(userId, getTodayStr());
    if (!plan) { res.status(400).json({ message: "No plan for today. Generate a plan first." }); return; }
    const allSrs = await storage.getSrsItems(userId);
    const retiredRefs = allSrs.filter((s) => s.retired).map((s) => s.reference);
    const planned = [...(plan.plannedItems || [])];
    for (const ref of retiredRefs) {
      if (!planned.includes(ref)) planned.push(ref);
    }
    plan = await storage.updateDailyPlan(plan.id, { plannedItems: planned });
    res.json(plan);
  } catch {
    res.status(500).json({ message: "Internal Server Error" });
  }
});

router.post("/plans/today/clear", async (req: Request, res: Response) => {
  if (!isAuth(req, res)) return;
  try {
    const userId = req.user!.id;
    const plan = await storage.getDailyPlan(userId, getTodayStr());
    if (!plan) { res.status(400).json({ message: "No plan exists for today" }); return; }

    const completedItems = plan.completedItems || [];
    const plannedItems = plan.plannedItems || [];
    const uncompleted = plannedItems.filter((r) => !completedItems.includes(r));

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    const allSrs = await storage.getSrsItems(userId);
    const now = new Date();
    for (const ref of uncompleted) {
      const removedPages = getPagesForReference(ref);
      for (const srs of allSrs) {
        const overlap = getPagesForReference(srs.reference).some(p => removedPages.includes(p));
        if (overlap && srs.nextReviewDate <= now) {
          await storage.updateSrsItem(srs.id, { nextReviewDate: tomorrow });
        }
      }
    }

    const updated = await storage.updateDailyPlan(plan.id, { plannedItems: [...completedItems] });
    res.json(updated);
  } catch {
    res.status(500).json({ message: "Internal Server Error" });
  }
});

const logExtraSchema = z.object({
  type: z.string(),
  reference: z.string(),
  vibeScale: z.number().int().min(1).max(5),
});

router.post("/plans/today/extra", async (req: Request, res: Response) => {
  if (!isAuth(req, res)) return;
  try {
    const userId = req.user!.id;
    const input = logExtraSchema.parse(req.body);
    const todayStr = getTodayStr();
    let plan = await storage.getDailyPlan(userId, todayStr);

    if (!plan) {
      plan = await storage.createDailyPlan({
        userId, date: todayStr, bandwidth: 5,
        plannedItems: [], completedItems: [], extraRevisions: [input.reference],
      });
    } else {
      const extras = [...(plan.extraRevisions || [])];
      if (!extras.includes(input.reference)) extras.push(input.reference);
      plan = await storage.updateDailyPlan(plan.id, { extraRevisions: extras });
    }

    await storage.createLog({ userId, type: input.type, reference: input.reference, vibeScale: input.vibeScale });

    const srsRefs = expandSurahRange(input.reference);
    for (const ref of srsRefs) {
      const srs = await storage.getSrsItemByReference(userId, ref);
      if (srs) {
        const u = calculateNextReview(srs.easeFactor, srs.interval, srs.repetitions, input.vibeScale);
        await storage.updateSrsItem(srs.id, u);
      } else {
        const u = calculateNextReview(250, 0, 0, input.vibeScale);
        await storage.createSrsItem({ userId, type: input.type, reference: ref, ...u });
      }
    }

    res.json(plan);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join(".") });
      return;
    }
    res.status(500).json({ message: "Internal Server Error" });
  }
});

const toggleHistorySchema = z.object({ reference: z.string() });

router.post("/plans/:date/toggle-item", async (req: Request, res: Response) => {
  if (!isAuth(req, res)) return;
  try {
    const userId = req.user!.id;
    const date = String(req.params.date);
    const input = toggleHistorySchema.parse(req.body);
    const plan = await storage.getDailyPlan(userId, date);
    if (!plan) { res.status(404).json({ message: "Plan not found" }); return; }
    const completed = new Set<string>(plan.completedItems || []);
    if (completed.has(input.reference)) completed.delete(input.reference);
    else completed.add(input.reference);
    const updated = await storage.updateDailyPlan(plan.id, { completedItems: Array.from(completed) });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ message: String(err) });
  }
});

// ── Stats ─────────────────────────────────────────────────────────────────────

router.get("/stats", async (req: Request, res: Response) => {
  if (!isAuth(req, res)) return;
  const userId = req.user!.id;

  const allLogs = await storage.getLogs(userId);
  const latestVibeByRef: Record<string, number> = {};
  for (let i = allLogs.length - 1; i >= 0; i--) {
    const log = allLogs[i];
    latestVibeByRef[log.reference] = log.vibeScale;
  }
  let memorizedPages = 0;
  for (const ref of Object.keys(latestVibeByRef)) {
    if (latestVibeByRef[ref] < 3) continue;
    const rparts = ref.split(":");
    if (rparts[0] === "ayah" && !(rparts[2] || "").includes("-")) continue;
    memorizedPages += getPageEquivalent(ref);
  }
  memorizedPages = Math.round(memorizedPages * 10) / 10;

  const todayStr = getTodayStr();
  const todayPlan = await storage.getDailyPlan(userId, todayStr);
  let dueToday = 0;
  if (todayPlan) {
    const planned = todayPlan.plannedItems || [];
    const completed = todayPlan.completedItems || [];
    dueToday = Math.max(0, planned.length - completed.length);
  } else {
    const dueItems = await storage.getDueSrsItems(userId);
    dueToday = dueItems.length;
  }

  const allPlans = await storage.getAllDailyPlans(userId);

  function isDayActive(p?: typeof todayPlan): boolean {
    if (!p) return false;
    const planned = p.plannedItems || [];
    const completed = p.completedItems || [];
    const extras = p.extraRevisions || [];
    return (planned.length > 0 && completed.length >= planned.length) || extras.length > 0;
  }

  let dayStreak = 0;
  const checkDate = new Date();
  checkDate.setDate(checkDate.getDate() - 1);
  for (let d = 0; d < 365; d++) {
    const dateStr = checkDate.toISOString().split("T")[0];
    const dayPlan = allPlans.find(p => p.date === dateStr);
    if (isDayActive(dayPlan)) {
      dayStreak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      break;
    }
  }
  if (isDayActive(todayPlan)) dayStreak++;

  res.json({ memorizedPages, dueToday, dayStreak });
});

// ── Backup / Restore ──────────────────────────────────────────────────────────

router.get("/backup", async (req: Request, res: Response) => {
  if (!isAuth(req, res)) return;
  const userId = req.user!.id;
  const [logs, srsItems, dailyPlans] = await Promise.all([
    storage.getLogs(userId),
    storage.getSrsItems(userId),
    storage.getAllDailyPlans(userId),
  ]);
  res.json({ version: 1, exportedAt: new Date().toISOString(), logs, srsItems, dailyPlans });
});

router.post("/backup/restore", async (req: Request, res: Response) => {
  if (!isAuth(req, res)) return;
  try {
    const userId = req.user!.id;
    const body = req.body as Record<string, unknown>;
    if (!body || body.version !== 1) {
      res.status(400).json({ message: "Unsupported backup version" });
      return;
    }

    const logRows = ((body.logs as unknown[]) ?? []).map((raw) => {
      const r = raw as Record<string, unknown>;
      return {
        userId,
        type: String(r.type ?? "page"),
        reference: String(r.reference ?? ""),
        vibeScale: Number(r.vibeScale ?? 3),
        createdAt: r.createdAt ? new Date(String(r.createdAt)) : new Date(),
      };
    }).filter((r) => r.reference);

    const srsRows = ((body.srsItems as unknown[]) ?? []).map((raw) => {
      const r = raw as Record<string, unknown>;
      return {
        userId,
        type: String(r.type ?? "page"),
        reference: String(r.reference ?? ""),
        easeFactor: Number(r.easeFactor ?? 250),
        interval: Number(r.interval ?? 1),
        repetitions: Number(r.repetitions ?? 0),
        nextReviewDate: r.nextReviewDate ? new Date(String(r.nextReviewDate)) : new Date(),
      };
    }).filter((r) => r.reference);

    const planRows = ((body.dailyPlans as unknown[]) ?? []).map((raw) => {
      const r = raw as Record<string, unknown>;
      return {
        userId,
        date: String(r.date ?? "").slice(0, 10),
        bandwidth: Number(r.bandwidth ?? 5),
        plannedItems: Array.isArray(r.plannedItems) ? (r.plannedItems as string[]) : [],
        completedItems: Array.isArray(r.completedItems) ? (r.completedItems as string[]) : [],
        extraRevisions: Array.isArray(r.extraRevisions) ? (r.extraRevisions as string[]) : [],
      };
    }).filter((r) => r.date);

    await storage.restoreBackup(userId, { logs: logRows, srsItems: srsRows, dailyPlans: planRows });

    res.json({
      message: "Backup restored successfully",
      imported: { logs: logRows.length, srsItems: srsRows.length, dailyPlans: planRows.length },
    });
  } catch (err) {
    res.status(400).json({ message: String(err) });
  }
});

export default router;
