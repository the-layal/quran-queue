import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTrackerStorage } from "../context/useTrackerStorage";
import type {
  Log,
  SrsItem,
  DailyPlan,
  TrackerStats,
  LogInput,
  CompleteAdvancedInput,
} from "../storage/trackerStorage";

export type { Log, SrsItem, DailyPlan, TrackerStats, LogInput, CompleteAdvancedInput };

export function masteryLevelFromVibe(vibe: number | undefined): "new" | "struggling" | "reviewing" | "learning" | "mastered" {
  if (vibe === undefined) return "new";
  if (vibe <= 1) return "struggling";
  if (vibe === 2) return "reviewing";
  if (vibe === 3) return "learning";
  return "mastered";
}

export function masteryLabelFromVibe(vibe: number | undefined): string {
  return ({
    new: "New",
    struggling: "Struggling",
    reviewing: "Reviewing",
    learning: "Learning",
    mastered: "Mastered",
  } as const)[masteryLevelFromVibe(vibe)];
}

const KEYS = {
  logs: ["tracker", "logs"] as const,
  srs: ["tracker", "srs"] as const,
  todayPlan: ["tracker", "todayPlan"] as const,
  allPlans: ["tracker", "allPlans"] as const,
  stats: ["tracker", "stats"] as const,
};

function useInvalidateAll() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["tracker"] });
  };
}

export function useLogs() {
  const { storage } = useTrackerStorage();
  return useQuery<Log[]>({ queryKey: KEYS.logs, queryFn: () => storage.getLogs() });
}

export function useSrsItems() {
  const { storage } = useTrackerStorage();
  return useQuery<SrsItem[]>({ queryKey: KEYS.srs, queryFn: () => storage.getSrsItems() });
}

export function useStats() {
  const { storage } = useTrackerStorage();
  return useQuery<TrackerStats>({ queryKey: KEYS.stats, queryFn: () => storage.getStats() });
}

export function useTodayPlan() {
  const { storage } = useTrackerStorage();
  return useQuery<DailyPlan | null>({ queryKey: KEYS.todayPlan, queryFn: () => storage.getTodayPlan() });
}

export function useAllPlans() {
  const { storage } = useTrackerStorage();
  return useQuery<DailyPlan[]>({ queryKey: KEYS.allPlans, queryFn: () => storage.getAllPlans() });
}

export function useCreateOrUpdatePlan() {
  const { storage } = useTrackerStorage();
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (vars: { bandwidth: number }) => storage.createOrUpdatePlan(vars),
    onSuccess: () => invalidate(),
  });
}

export function useMarkPlanCompleted() {
  const { storage } = useTrackerStorage();
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (vars: { reference: string; vibeScale: number }) =>
      storage.markPlanCompleted(vars),
    onSuccess: () => invalidate(),
  });
}

export function useMarkPlanCompletedAdvanced() {
  const { storage } = useTrackerStorage();
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (vars: CompleteAdvancedInput) => storage.markPlanCompletedAdvanced(vars),
    onSuccess: () => invalidate(),
  });
}

export function useAddMoreItems() {
  const { storage } = useTrackerStorage();
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (vars: { count: number }) => storage.addMoreItems(vars),
    onSuccess: () => invalidate(),
  });
}

export function useRemovePlanItem() {
  const { storage } = useTrackerStorage();
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (vars: { reference: string }) => storage.removePlanItem(vars),
    onSuccess: () => invalidate(),
  });
}

export function useClearPlan() {
  const { storage } = useTrackerStorage();
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: () => storage.clearPlan(),
    onSuccess: () => invalidate(),
  });
}

export function useToggleHistoryItem() {
  const { storage } = useTrackerStorage();
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (vars: { date: string; reference: string }) =>
      storage.togglePlanItem(vars),
    onSuccess: () => invalidate(),
  });
}

export function useCreateLog() {
  const { storage } = useTrackerStorage();
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (input: LogInput) => storage.createLog(input),
    onSuccess: () => invalidate(),
  });
}

export function useLogExtraRevision() {
  const { storage } = useTrackerStorage();
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (input: LogInput) => storage.logExtraRevision(input),
    onSuccess: () => invalidate(),
  });
}

export function useDeleteLog() {
  const { storage } = useTrackerStorage();
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (id: number) => storage.deleteLog(id),
    onSuccess: () => invalidate(),
  });
}

export function useRetireSurah() {
  const { storage } = useTrackerStorage();
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (reference: string) => storage.retireSurah(reference),
    onSuccess: () => invalidate(),
  });
}

export function useUnretireSurah() {
  const { storage } = useTrackerStorage();
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (reference: string) => storage.unretireSurah(reference),
    onSuccess: () => invalidate(),
  });
}

export function useAddPerfectlyKnownToSession() {
  const { storage } = useTrackerStorage();
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: () => storage.addPerfectlyKnownToSession(),
    onSuccess: () => invalidate(),
  });
}
