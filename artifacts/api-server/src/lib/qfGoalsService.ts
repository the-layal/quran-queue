import { qfTokenService } from "./qfTokenService";

const QF_GOALS_URL = "https://api.quran.foundation/api/v4/user/goals";

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
    const data = (await res.json()) as { id?: string | number };
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
    const raw = (await res.json()) as Array<Record<string, unknown>>;
    return raw.map((g) => ({ ...g, id: String(g.id) })) as QFGoalRecord[];
  } catch {
    return [];
  }
}
