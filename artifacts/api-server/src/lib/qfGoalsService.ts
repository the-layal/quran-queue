import { qfTokenService } from "./qfTokenService";
import { getQfOAuthConfig } from "./qfOAuthConfig";

function getQFGoalsUrl(): string {
  return `${getQfOAuthConfig().apiBaseUrl}/api/v4/user/goals`;
}

/** Parse QF API JSON — handles both raw arrays and wrapped { data: [...] } shapes. */
function parseGoalList(body: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(body)) return body as Array<Record<string, unknown>>;
  if (body && typeof body === "object") {
    const obj = body as Record<string, unknown>;
    if (Array.isArray(obj.data)) return obj.data as Array<Record<string, unknown>>;
    if (Array.isArray(obj.goals)) return obj.goals as Array<Record<string, unknown>>;
  }
  return [];
}

/** Parse a single QF goal record — handles both flat and wrapped shapes. */
function parseSingleGoal(body: unknown): { id?: string | number } {
  if (body && typeof body === "object") {
    const obj = body as Record<string, unknown>;
    // wrapped: { data: { id: ... } }
    if (obj.data && typeof obj.data === "object") return obj.data as { id?: string | number };
    return obj as { id?: string | number };
  }
  return {};
}

export async function syncGoalToQF(
  userId: string,
  goal: {
    surahNumber: number;
    ayahStart: number;
    ayahEnd: number;
    targetDate: string;
    dailyTarget: number;
  },
): Promise<string | null> {
  try {
    const token = await qfTokenService.getToken(userId);
    if (!token) return null;

    const res = await fetch(getQFGoalsUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
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
    const data = parseSingleGoal(await res.json());
    return data.id ? String(data.id) : null;
  } catch {
    return null;
  }
}

/** Returns true if the push succeeded, false on any error (non-throwing). */
export async function pushProgressToQF(
  userId: string,
  qfGoalId: string,
  completedCount: number,
  totalCount: number,
  isComplete: boolean,
): Promise<boolean> {
  try {
    const token = await qfTokenService.getToken(userId);
    if (!token) return false;

    const res = await fetch(`${getQFGoalsUrl()}/${qfGoalId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        completed_verses: completedCount,
        total_verses: totalCount,
        progress_percent: totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0,
        status: isComplete ? "complete" : "active",
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Returns true if the delete succeeded (or the goal was already gone), false on error. */
export async function deleteGoalFromQF(
  userId: string,
  qfGoalId: string,
): Promise<boolean> {
  try {
    const token = await qfTokenService.getToken(userId);
    if (!token) return false;

    const res = await fetch(`${getQFGoalsUrl()}/${qfGoalId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.ok || res.status === 404;
  } catch {
    return false;
  }
}

export interface QFGoalRecord {
  id: string;
  surah_id?: number;
  start_verse?: number;
  end_verse?: number;
  target_date?: string;
  daily_target?: number;
}

export async function fetchQFGoals(userId: string): Promise<QFGoalRecord[]> {
  try {
    const token = await qfTokenService.getToken(userId);
    if (!token) return [];

    const res = await fetch(getQFGoalsUrl(), {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) return [];
    const raw = parseGoalList(await res.json());
    return raw.map((g) => ({ ...g, id: String(g.id) })) as QFGoalRecord[];
  } catch {
    return [];
  }
}
