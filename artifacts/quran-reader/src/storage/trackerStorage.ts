export interface SrsItem {
  id: number;
  surah: number;
  ayahStart: number;
  ayahEnd: number;
  easeFactor: number;
  interval: number;
  repetitions: number;
  nextReview: string;
  lastReviewed: string | null;
}

export interface LogEntry {
  id: number;
  surah: number;
  ayahStart: number;
  ayahEnd: number;
  quality: number;
  notes: string | null;
  createdAt: string;
}

export interface TrackerStats {
  totalItems: number;
  totalLogs: number;
  dueToday: number;
  avgEaseFactor: number;
  todayReviews: number;
  dayStreak: number;
  qualityDistribution: Record<number, number>;
  recentLogs: LogEntry[];
}

export interface PlanItem {
  srsItemId: number;
  surah: number;
  ayahStart: number;
  ayahEnd: number;
  completed: boolean;
}

export interface DailyPlan {
  id: number;
  planDate: string;
  items: PlanItem[];
  completed: boolean;
}

export interface BackupData {
  version: number;
  exportedAt: string;
  logs: LogEntry[];
  srsItems: SrsItem[];
  dailyPlans: DailyPlan[];
}

export interface ITrackerStorage {
  getLogs(): Promise<LogEntry[]>;
  createLog(body: { surah: number; ayahStart: number; ayahEnd: number; quality: number; notes?: string }): Promise<LogEntry>;
  deleteLog(id: number): Promise<void>;

  getSrsItems(): Promise<SrsItem[]>;
  getStats(): Promise<TrackerStats>;

  getTodayPlan(): Promise<DailyPlan>;
  getPlans(): Promise<DailyPlan[]>;
  patchPlan(id: number, updates: Partial<{ items: PlanItem[]; completed: boolean }>): Promise<DailyPlan>;

  backup(): Promise<BackupData>;
  restore(data: BackupData): Promise<void>;

  isEmpty(): Promise<boolean>;
  clear(): Promise<void>;
}
