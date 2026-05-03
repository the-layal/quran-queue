import { useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./useAuth";
import { useQFConnection } from "./useQFConnection";

export interface Bookmark {
  id: number;
  surahNumber: number;
  ayahNumber: number;
  qfBookmarkId?: string | null;
  createdAt: string;
}

// ── localStorage helpers (guest users) ────────────────────────────────────────

export const BOOKMARK_LS_KEY = "hafith_bookmarks";

function readLocalBookmarks(): Bookmark[] {
  try {
    const raw = localStorage.getItem(BOOKMARK_LS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Bookmark[];
  } catch {
    return [];
  }
}

function writeLocalBookmarks(bookmarks: Bookmark[]): void {
  localStorage.setItem(BOOKMARK_LS_KEY, JSON.stringify(bookmarks));
}

let localIdCounter = 0;
function nextLocalId(): number {
  localIdCounter -= 1;
  return localIdCounter;
}

// ── API helpers ────────────────────────────────────────────────────────────────

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: "include", ...options });
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { message?: string };
    throw new Error(data.message ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

function jsonPost<T>(path: string, body: unknown): Promise<T> {
  return apiFetch<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ── Shared query key ───────────────────────────────────────────────────────────

export const BOOKMARKS_QUERY_KEY = ["bookmarks"] as const;

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useBookmarks() {
  const { isAuthenticated } = useAuth();
  const { isQFConnected } = useQFConnection();
  const queryClient = useQueryClient();

  // ── Fetch bookmarks ─────────────────────────────────────────────────────────
  const { data: bookmarks = [], isLoading } = useQuery<Bookmark[]>({
    queryKey: BOOKMARKS_QUERY_KEY,
    queryFn: async () => {
      if (!isAuthenticated) return readLocalBookmarks();
      // For authenticated + QF-connected users: do a one-time sync then return merged list
      if (isQFConnected) {
        try {
          const result = await apiFetch<{ synced: boolean; bookmarks: Bookmark[] }>(
            "/api/bookmarks/qf/sync",
          );
          return result.bookmarks;
        } catch {
          // Fall through to plain fetch
        }
      }
      return apiFetch<Bookmark[]>("/api/bookmarks");
    },
    staleTime: 5 * 60 * 1000,
  });

  // ── Toggle mutation ─────────────────────────────────────────────────────────
  const toggleMutation = useMutation({
    mutationFn: async ({
      surahNumber,
      ayahNumber,
      existingId,
    }: {
      surahNumber: number;
      ayahNumber: number;
      existingId?: number;
    }) => {
      if (existingId !== undefined) {
        // Remove
        if (!isAuthenticated) {
          const updated = readLocalBookmarks().filter(
            (b) => !(b.surahNumber === surahNumber && b.ayahNumber === ayahNumber),
          );
          writeLocalBookmarks(updated);
          return null;
        }
        await apiFetch(`/api/bookmarks/${existingId}`, { method: "DELETE" });
        return null;
      } else {
        // Create
        if (!isAuthenticated) {
          const newBm: Bookmark = {
            id: nextLocalId(),
            surahNumber,
            ayahNumber,
            qfBookmarkId: null,
            createdAt: new Date().toISOString(),
          };
          writeLocalBookmarks([newBm, ...readLocalBookmarks()]);
          return newBm;
        }
        return jsonPost<Bookmark>("/api/bookmarks", { surahNumber, ayahNumber });
      }
    },

    onMutate: async ({ surahNumber, ayahNumber, existingId }) => {
      await queryClient.cancelQueries({ queryKey: BOOKMARKS_QUERY_KEY });
      const prev = queryClient.getQueryData<Bookmark[]>(BOOKMARKS_QUERY_KEY) ?? [];

      if (existingId !== undefined) {
        queryClient.setQueryData<Bookmark[]>(
          BOOKMARKS_QUERY_KEY,
          prev.filter((b) => b.id !== existingId),
        );
      } else {
        const optimistic: Bookmark = {
          id: nextLocalId(),
          surahNumber,
          ayahNumber,
          qfBookmarkId: null,
          createdAt: new Date().toISOString(),
        };
        queryClient.setQueryData<Bookmark[]>(BOOKMARKS_QUERY_KEY, [optimistic, ...prev]);
      }
      return { prev };
    },

    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) {
        queryClient.setQueryData<Bookmark[]>(BOOKMARKS_QUERY_KEY, ctx.prev);
      }
    },

    onSuccess: (data) => {
      if (data !== null) {
        // Replace the optimistic entry (negative id) with the real one
        queryClient.setQueryData<Bookmark[]>(BOOKMARKS_QUERY_KEY, (old = []) =>
          old.map((b) => (b.id < 0 && b.surahNumber === data.surahNumber && b.ayahNumber === data.ayahNumber ? data : b)),
        );
      }
    },
  });

  // ── Public API ──────────────────────────────────────────────────────────────

  const isBookmarked = useCallback(
    (surahNumber: number, ayahNumber: number): boolean =>
      bookmarks.some((b) => b.surahNumber === surahNumber && b.ayahNumber === ayahNumber),
    [bookmarks],
  );

  const toggleBookmark = useCallback(
    (surahNumber: number, ayahNumber: number): void => {
      const existing = bookmarks.find(
        (b) => b.surahNumber === surahNumber && b.ayahNumber === ayahNumber,
      );
      toggleMutation.mutate({
        surahNumber,
        ayahNumber,
        existingId: existing?.id,
      });
    },
    [bookmarks, toggleMutation],
  );

  return {
    bookmarks,
    isLoading,
    isQFConnected,
    isBookmarked,
    toggleBookmark,
  };
}

// ── Guest → API migration (called from TrackerStorageContext after sign-in) ──

export async function migrateGuestBookmarks(): Promise<void> {
  const local = readLocalBookmarks();
  if (local.length === 0) return;
  try {
    for (const bm of local) {
      await jsonPost("/api/bookmarks", {
        surahNumber: bm.surahNumber,
        ayahNumber: bm.ayahNumber,
      });
    }
    writeLocalBookmarks([]);
  } catch {
    // non-fatal — guest bookmarks remain in localStorage
  }
}
