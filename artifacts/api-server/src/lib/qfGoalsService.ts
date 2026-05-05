import { qfTokenService } from "./qfTokenService";
import { getQfOAuthConfig } from "./qfOAuthConfig";

const { apiBaseUrl } = getQfOAuthConfig();
const QF_GOALS_URL = `${apiBaseUrl}/api/v4/user/goals`;

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

    const res = await fetch(QF_GOALS_URL, {
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

export async function pushProgressToQF(
  userId: string,
  qfGoalId: string,
  completedCount: number,
  totalCount: number,
  isComplete: boolean,
): Promise<void> {
  try {
    const token = await qfTokenService.getToken(userId);
    if (!token) return;

    await fetch(`${QF_GOALS_URL}/${qfGoalId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        completed_verses: completedCount,
        total_verses: totalCount,
        progress_percent: totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0,
        status: isComplete ? "complete" : "active",
      }),
    });
  } catch {
    // silent — local goal is the source of truth
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

    const res = await fetch(QF_GOALS_URL, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) return [];
    const raw = parseGoalList(await res.json());
    return raw.map((g) => ({ ...g, id: String(g.id) })) as QFGoalRecord[];
  } catch {
    return [];
  }
}
