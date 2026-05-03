import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import { storage } from "../storage/index";
import {
  getPageEquivalent,
  getPagesForReference,
  groupConsecutivePages,
  getAyahsForReference,
} from "../lib/page-utils";

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

    res.status(201).json(log);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join(".") });
      return;
    }
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

    // Schedule due SRS refs first (preserving reference type), then fresh
    // pages 1..604 in order. Skips pages already covered by the plan or by
    // any known SRS item.
    const fillFromDueAndFresh = async (
      plannedItems: string[],
      existingPages: Set<number>,
      bandwidth: number,
      currentPageCount: number,
    ): Promise<{ plannedItems: string[]; currentPageCount: number }> => {
      const allItems = await storage.getSrsItems(userId);
      const knownPages = new Set<number>();
      for (const item of allItems) {
        for (const p of getPagesForReference(item.reference)) knownPages.add(p);
      }
      // Due SRS items first, in due-item order, using the original ref
      const dueItems = await storage.getDueSrsItems(userId);
      for (const item of dueItems) {
        if (currentPageCount >= bandwidth) break;
        if (plannedItems.includes(item.reference)) continue;
        const pages = getPagesForReference(item.reference);
        if (pages.every((p) => existingPages.has(p))) continue;
        const weight = getPageEquivalent(item.reference);
        if (currentPageCount + weight > bandwidth && plannedItems.length > 0) break;
        plannedItems.push(item.reference);
        currentPageCount += weight;
        for (const p of pages) existingPages.add(p);
      }
      // Then fresh pages 1..604 in order, excluding pages already covered
      // (either by the plan or by any known SRS item).
      const freshPages: number[] = [];
      for (let p = 1; p <= TOTAL_QURAN_PAGES; p++) {
        if (!existingPages.has(p) && !knownPages.has(p)) freshPages.push(p);
      }
      let i = 0;
      while (currentPageCount < bandwidth && i < freshPages.length) {
        const batchEnd = Math.min(i + (bandwidth - currentPageCount), freshPages.length);
        const batch = freshPages.slice(i, batchEnd);
        for (const ref of groupConsecutivePages(batch)) {
          const weight = getPageEquivalent(ref);
          if (currentPageCount + weight > bandwidth && plannedItems.length > 0) break;
          plannedItems.push(ref);
          currentPageCount += weight;
          for (const p of getPagesForReference(ref)) existingPages.add(p);
        }
        i = batchEnd;
      }
      return { plannedItems, currentPageCount };
    };

    if (!plan) {
      const carryoverRefs: string[] = [];
      const yesterdayPlan = await storage.getDailyPlan(userId, getYesterdayStr());
      if (yesterdayPlan) {
        const completed = yesterdayPlan.completedItems || [];
        const planned = yesterdayPlan.plannedItems || [];
        for (const ref of planned) if (!completed.includes(ref)) carryoverRefs.push(ref);
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
        await fillFromDueAndFresh(plannedItems, existingPages, input.bandwidth, currentPageCount);
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
      const existingPlanned = plan.plannedItems || [];
      let currentPageCount = 0;
      const existingPages = new Set<number>();

      for (const ref of existingPlanned) {
        currentPageCount += getPageEquivalent(ref);
        for (const p of getPagesForReference(ref)) existingPages.add(p);
      }

      if (input.bandwidth > currentPageCount) {
        const plannedItems = [...existingPlanned];
        await fillFromDueAndFresh(plannedItems, existingPages, input.bandwidth, currentPageCount);
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
        plan = await storage.updateDailyPlan(plan.id, { bandwidth: input.bandwidth });
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
    const knownPages = new Set<number>();
    for (const item of allItems) {
      for (const p of getPagesForReference(item.reference)) knownPages.add(p);
    }

    const newRefs: string[] = [];
    let added = 0;
    // Due SRS refs first, preserving original references
    const dueItems = await storage.getDueSrsItems(userId);
    for (const item of dueItems) {
      if (added >= input.count) break;
      if (currentItems.includes(item.reference) || newRefs.includes(item.reference)) continue;
      const pages = getPagesForReference(item.reference);
      if (pages.every((p) => existingPages.has(p))) continue;
      newRefs.push(item.reference);
      added += getPageEquivalent(item.reference);
      for (const p of pages) existingPages.add(p);
    }
    // Then fresh pages 1..604 in order
    if (added < input.count) {
      const freshPages: number[] = [];
      for (let p = 1; p <= TOTAL_QURAN_PAGES; p++) {
        if (!existingPages.has(p) && !knownPages.has(p)) freshPages.push(p);
      }
      const remaining = Math.max(0, Math.ceil(input.count - added));
      const pagesToAdd = freshPages.slice(0, remaining);
      if (pagesToAdd.length > 0) {
        for (const ref of groupConsecutivePages(pagesToAdd)) newRefs.push(ref);
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
    for (const group of ayahGroups) {
      for (const ayah of group.ayahs) {
        const ayahRef = `ayah:${group.surah}:${ayah}`;
        await applyVibeToReference(userId, "ayah", ayahRef, input.vibeScale);
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
    const updated = await storage.updateDailyPlan(plan.id, { plannedItems, completedItems });

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
