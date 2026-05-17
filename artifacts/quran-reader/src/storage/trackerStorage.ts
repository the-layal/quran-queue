// Tracker data model (Hafith reference + vibeScale).
// Reference grammar: `page:N`, `page:N-M`, `ayah:S:N`, `ayah:S:N-M`,
// `surah:S`, `surah:S-T`, `surah:S:N-M`. easeFactor is stored as int * 100.

export interface Log {
  id: number;
  userId?: string;
  type: string;
  reference: string;
  vibeScale: number;
  createdAt: string;
}

export interface SrsItem {
  id: number;
  userId?: string;
  type: string;
  reference: string;
  easeFactor: number;
  interval: number;
  repetitions: number;
  nextReviewDate: string;
  retired?: boolean;
  retiredAt?: string | null;
  lastVibeScale?: number | null;
  lastReviewedAt?: string | null;
}

export interface DailyPlan {
  id: number;
  userId?: string;
  date: string;
  bandwidth: number;
  plannedItems: string[];
  completedItems: string[];
  extraRevisions: string[];
  removedItems?: string[];
}

export interface TrackerStats {
  memorizedPages: number;
  dueToday: number;
  dayStreak: number;
}

export interface BackupData {
  version: number;
  exportedAt: string;
  logs: Log[];
  srsItems: SrsItem[];
  dailyPlans: DailyPlan[];
}

export type LogInput = {
  type: string;
  reference: string;
  vibeScale: number;
};

export type CompleteAdvancedInput = {
  reference: string;
  ayahVibes: Array<{ surah: number; ayah: number; vibe: number }>;
};

export interface ITrackerStorage {
  // Logs
  getLogs(): Promise<Log[]>;
  createLog(input: LogInput): Promise<Log>;
  deleteLog(id: number): Promise<{ deleted: boolean; srsRemoved: boolean }>;

  // SRS items
  getSrsItems(): Promise<SrsItem[]>;
  getDueSrsItems(): Promise<SrsItem[]>;

  // Retirement
  retireSurah(reference: string): Promise<void>;
  unretireSurah(reference: string): Promise<void>;

  // Daily plans
  getTodayPlan(): Promise<DailyPlan | null>;
  getAllPlans(): Promise<DailyPlan[]>;
  createOrUpdatePlan(input: { bandwidth: number }): Promise<DailyPlan>;
  addMoreItems(input: { count: number }): Promise<DailyPlan>;
  markPlanCompleted(input: { reference: string; vibeScale: number }): Promise<DailyPlan>;
  markPlanCompletedAdvanced(input: CompleteAdvancedInput): Promise<DailyPlan>;
  removePlanItem(input: { reference: string }): Promise<DailyPlan>;
  clearPlan(): Promise<DailyPlan>;
  logExtraRevision(input: LogInput): Promise<DailyPlan>;
  togglePlanItem(input: { date: string; reference: string }): Promise<DailyPlan>;
  addPerfectlyKnownToSession(): Promise<DailyPlan>;

  // Stats
  getStats(): Promise<TrackerStats>;

  // Backup
  backup(): Promise<BackupData>;
  restore(data: BackupData): Promise<void>;

  // Prior knowledge seeding (onboarding)
  seedPriorKnowledge(items: Array<{ reference: string; vibe: number }>): Promise<void>;

  // Migration support
  isEmpty(): Promise<boolean>;
  clear(): Promise<void>;
}
