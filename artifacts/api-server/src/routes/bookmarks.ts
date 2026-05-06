import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import { storage } from "../storage/index";
import { qfTokenService, markQFSyncError, clearQFSyncError } from "../lib/qfTokenService";
import { getQfOAuthConfig } from "../lib/qfOAuthConfig";

const router: IRouter = Router();

function getQFApiBase(): string {
  return `${getQfOAuthConfig().apiBaseUrl}/api/v4`;
}

function isAuth(req: Request, res: Response): req is Request & { user: NonNullable<typeof req.user> } {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}

// ── Local bookmarks ────────────────────────────────────────────────────────────

router.get("/bookmarks", async (req: Request, res: Response) => {
  if (!isAuth(req, res)) return;
  const bookmarks = await storage.getBookmarks(req.user!.id);
  res.json(bookmarks);
});

const createBookmarkSchema = z.object({
  surahNumber: z.number().int().min(1).max(114),
  ayahNumber: z.number().int().min(1),
  note: z.string().nullable().optional(),
});

const updateBookmarkSchema = z.object({
  note: z.string().nullable(),
});

router.post("/bookmarks", async (req: Request, res: Response) => {
  if (!isAuth(req, res)) return;
  try {
    const userId = req.user!.id;
    const input = createBookmarkSchema.parse(req.body);

    const existing = await storage.getBookmark(userId, input.surahNumber, input.ayahNumber);
    if (existing) {
      res.status(200).json(existing);
      return;
    }

    let qfBookmarkId: string | null = null;

    const token = await qfTokenService.getToken(userId);
    if (token) {
      try {
        const qfRes = await fetch(`${getQFApiBase()}/bookmarks`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`,
          },
          body: JSON.stringify({ verse_key: `${input.surahNumber}:${input.ayahNumber}` }),
        });
        if (qfRes.ok) {
          const qfData = (await qfRes.json()) as { id?: string | number };
          if (qfData.id != null) qfBookmarkId = String(qfData.id);
        } else {
          void markQFSyncError(userId);
        }
      } catch {
        void markQFSyncError(userId);
      }
    }

    const bookmark = await storage.createBookmark({
      userId,
      surahNumber: input.surahNumber,
      ayahNumber: input.ayahNumber,
      qfBookmarkId,
      note: input.note ?? null,
    });
    res.status(201).json(bookmark);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ message: err.errors[0].message });
      return;
    }
    res.status(500).json({ message: "Internal Server Error" });
  }
});

router.patch("/bookmarks/:id", async (req: Request, res: Response) => {
  if (!isAuth(req, res)) return;
  try {
    const userId = req.user!.id;
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) { res.status(400).json({ message: "Invalid bookmark id" }); return; }

    const input = updateBookmarkSchema.parse(req.body);

    const bookmarks = await storage.getBookmarks(userId);
    const bookmark = bookmarks.find((b) => b.id === id);
    if (!bookmark) { res.status(404).json({ message: "Bookmark not found" }); return; }

    const updated = await storage.updateBookmark(id, { note: input.note });
    res.json(updated);
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ message: err.errors[0].message }); return; }
    res.status(500).json({ message: "Internal Server Error" });
  }
});

router.delete("/bookmarks/:id", async (req: Request, res: Response) => {
  if (!isAuth(req, res)) return;
  try {
    const userId = req.user!.id;
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) { res.status(400).json({ message: "Invalid bookmark id" }); return; }

    const bookmarks = await storage.getBookmarks(userId);
    const bookmark = bookmarks.find((b) => b.id === id);
    if (!bookmark) { res.status(404).json({ message: "Bookmark not found" }); return; }

    if (bookmark.qfBookmarkId) {
      const token = await qfTokenService.getToken(userId);
      if (token) {
        try {
          const qfDel = await fetch(`${getQFApiBase()}/bookmarks/${bookmark.qfBookmarkId}`, {
            method: "DELETE",
            headers: { "Authorization": `Bearer ${token}` },
          });
          if (!qfDel.ok && qfDel.status !== 404) void markQFSyncError(userId);
        } catch {
          void markQFSyncError(userId);
        }
      }
    }

    await storage.deleteBookmark(id);
    res.json({ deleted: true });
  } catch {
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// ── QF proxy: create / delete (for clients that want to manage QF directly) ───

router.post("/bookmarks/qf", async (req: Request, res: Response) => {
  if (!isAuth(req, res)) return;
  if (!process.env.QF_CLIENT_ID) {
    res.status(503).json({ message: "Quran Foundation integration is not configured on this server" });
    return;
  }
  try {
    const input = createBookmarkSchema.parse(req.body);
    const token = await qfTokenService.getToken(req.user!.id);
    if (!token) { res.status(403).json({ message: "Not connected to Quran Foundation" }); return; }

    const qfRes = await fetch(`${getQFApiBase()}/bookmarks`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify({ verse_key: `${input.surahNumber}:${input.ayahNumber}` }),
    });
    if (!qfRes.ok) { res.status(502).json({ message: "QF API error" }); return; }
    const qfData = (await qfRes.json()) as unknown;
    res.status(201).json(qfData);
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ message: err.errors[0].message }); return; }
    res.status(500).json({ message: "Internal Server Error" });
  }
});

router.delete("/bookmarks/qf/:qfId", async (req: Request, res: Response) => {
  if (!isAuth(req, res)) return;
  if (!process.env.QF_CLIENT_ID) {
    res.status(503).json({ message: "Quran Foundation integration is not configured on this server" });
    return;
  }
  try {
    const qfId = req.params.qfId as string;
    if (!qfId) { res.status(400).json({ message: "Missing qfId" }); return; }
    const token = await qfTokenService.getToken(req.user!.id);
    if (!token) { res.status(403).json({ message: "Not connected to Quran Foundation" }); return; }

    const qfRes = await fetch(`${getQFApiBase()}/bookmarks/${encodeURIComponent(qfId)}`, {
      method: "DELETE",
      headers: { "Authorization": `Bearer ${token}` },
    });
    if (!qfRes.ok && qfRes.status !== 404) { res.status(502).json({ message: "QF API error" }); return; }
    res.json({ deleted: true });
  } catch {
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// ── QF sync ───────────────────────────────────────────────────────────────────

router.get("/bookmarks/qf/sync", async (req: Request, res: Response) => {
  if (!isAuth(req, res)) return;
  if (!process.env.QF_CLIENT_ID) {
    res.status(503).json({ message: "Quran Foundation integration is not configured on this server" });
    return;
  }
  try {
    const userId = req.user!.id;
    const token = await qfTokenService.getToken(userId);
    if (!token) {
      res.status(200).json({ synced: false, bookmarks: await storage.getBookmarks(userId) });
      return;
    }

    const qfRes = await fetch(`${getQFApiBase()}/bookmarks`, {
      headers: { "Authorization": `Bearer ${token}` },
    });

    if (!qfRes.ok) {
      res.status(200).json({ synced: false, bookmarks: await storage.getBookmarks(userId) });
      return;
    }

    const qfData = (await qfRes.json()) as Array<{ id: string | number; verse_key: string }>;

    const toUpsert: Array<{ surahNumber: number; ayahNumber: number; qfBookmarkId: string }> = [];
    for (const item of qfData) {
      const parts = item.verse_key.split(":");
      const surahNumber = parseInt(parts[0], 10);
      const ayahNumber = parseInt(parts[1], 10);
      if (!isNaN(surahNumber) && !isNaN(ayahNumber)) {
        toUpsert.push({ surahNumber, ayahNumber, qfBookmarkId: String(item.id) });
      }
    }

    await storage.bulkUpsertBookmarks(userId, toUpsert);

    const merged = await storage.getBookmarks(userId);
    // Clear any stored sync error — connection is clearly working
    void clearQFSyncError(userId);
    res.json({ synced: true, bookmarks: merged });
  } catch {
    res.status(500).json({ message: "Internal Server Error" });
  }
});

export default router;
