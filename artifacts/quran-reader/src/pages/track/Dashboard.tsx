import { useState, useEffect, useCallback } from "react";
import AppShell from "@/components/AppShell";
import GuestBanner from "@/components/GuestBanner";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { useTrackerStorage } from "@/context/useTrackerStorage";
import type { DailyPlan, TrackerStats } from "@/storage/trackerStorage";
import { Trophy, ArrowRight, PenLine, CheckCircle2, Play, Flame, Plus, Target, X, ChevronDown, ChevronUp, Link2 } from "lucide-react";
import { TOTAL_PAGES, SURAHS } from "@/lib/quran-data";
import { Link } from "wouter";
import { LogModal } from "@/components/LogModal";
import GoalModal from "@/components/GoalModal";
import { useGoals, type Goal } from "@/hooks/useGoals";
import { cn } from "@/lib/utils";

function getSurahName(id: number): string {
  const surah = SURAHS.find((s) => s.id === id);
  return surah ? surah.englishName : "";
}

function formatReference(ref: string): string {
  const parts = ref.split(":");
  const type = parts[0];
  if (type === "page") return `Page ${parts[1] || ""}`;
  if (type === "ayah") {
    const sid = parseInt(parts[1], 10);
    const name = getSurahName(sid);
    return name ? `${name} — Ayah ${parts[2] || ""}` : `Ayah ${parts[1]}:${parts[2] || ""}`;
  }
  if (type === "surah") {
    const val = parts[1] || "";
    if (parts[2]) {
      const sid = parseInt(val, 10);
      const name = getSurahName(sid);
      return name ? `${name} — Ayahs ${parts[2]}` : `Surah ${val}:${parts[2]}`;
    }
    const rangeParts = val.split("-");
    const sid = parseInt(rangeParts[0], 10);
    const name = getSurahName(sid);
    if (rangeParts.length > 1) {
      const toSid = parseInt(rangeParts[1], 10);
      const toName = getSurahName(toSid);
      return `${name || `Surah ${sid}`} — ${toName || `Surah ${toSid}`}`;
    }
    return name ? `${name}` : `Surah ${val}`;
  }
  return ref;
}

function daysUntil(dateStr: string): number {
  const target = new Date(dateStr + "T00:00:00");
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - now.getTime()) / 86400000);
}

function GoalCard({ goal, onDelete }: { goal: Goal; onDelete: (id: number) => void }) {
  const [expanded, setExpanded] = useState(false);
  const surah = SURAHS.find((s) => s.id === goal.surahNumber);
  const totalAyahs = goal.ayahEnd - goal.ayahStart + 1;
  const completedSet = new Set(goal.completedAyahsList || []);
  const completedCount = completedSet.size;
  const progressPct = totalAyahs > 0 ? Math.round((completedCount / totalAyahs) * 100) : 0;
  const days = daysUntil(goal.targetDate);
  const isComplete = goal.status === "complete";
  const isOverdue = days < 0 && !isComplete;
  const isSynced = !!goal.qfGoalId;

  // Limit dot display to 60 ayahs; show ellipsis if more
  const displayDots = totalAyahs <= 80;

  return (
    <div className={cn(
      "bg-background rounded-2xl p-4 border flex flex-col gap-2.5",
      isComplete ? "border-primary/40 bg-primary/5" : isOverdue ? "border-destructive/30" : "border-border/50",
    )}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-semibold text-foreground leading-tight truncate">
              {surah?.englishName ?? `Surah ${goal.surahNumber}`}
            </p>
            {isSynced && (
              <span title="Synced with Quran Foundation" className="flex-shrink-0">
                <Link2 className="w-3 h-3 text-blue-500" />
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {goal.ayahStart === 1 && goal.ayahEnd === surah?.ayahCount
              ? "Full surah"
              : `Ayahs ${goal.ayahStart}–${goal.ayahEnd}`}
          </p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {isComplete && (
            <span className="text-[10px] font-bold uppercase tracking-wider bg-primary/15 text-primary px-2 py-0.5 rounded-full">Done</span>
          )}
          {isOverdue && (
            <span className="text-[10px] font-bold uppercase tracking-wider bg-destructive/15 text-destructive px-2 py-0.5 rounded-full">Overdue</span>
          )}
          <button
            onClick={() => onDelete(goal.id)}
            className="p-1 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            title="Remove goal"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="space-y-1">
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all", isComplete ? "bg-primary" : "bg-primary/70")}
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span className="tabular-nums">{completedCount}/{totalAyahs} ayahs</span>
          <span>
            {isComplete
              ? "Completed"
              : days === 0
              ? "Due today"
              : days > 0
              ? `${days}d left`
              : `${Math.abs(days)}d overdue`}
          </span>
        </div>
      </div>

      {/* Daily target */}
      {!isComplete && (
        <div className="text-[11px] text-muted-foreground">
          Target pace: <span className="font-medium text-foreground">{goal.dailyTarget} ayah{goal.dailyTarget !== 1 ? "s" : ""}/day</span>
        </div>
      )}

      {/* Expandable per-ayah mastery grid */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
      >
        {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        {expanded ? "Hide" : "Show"} ayah breakdown
      </button>

      {expanded && (
        <div className="pt-1">
          {displayDots ? (
            <div className="flex flex-wrap gap-1">
              {Array.from({ length: totalAyahs }, (_, i) => {
                const ayahNum = goal.ayahStart + i;
                const done = completedSet.has(ayahNum);
                return (
                  <div
                    key={ayahNum}
                    title={`Ayah ${ayahNum}${done ? " ✓" : ""}`}
                    className={cn(
                      "w-5 h-5 rounded text-[9px] flex items-center justify-center font-medium transition-colors",
                      done
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {ayahNum}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-1.5">
              <p className="text-[11px] text-muted-foreground">
                {completedCount} of {totalAyahs} ayahs memorized ({progressPct}%)
              </p>
              <div className="flex flex-wrap gap-0.5">
                {Array.from({ length: totalAyahs }, (_, i) => {
                  const ayahNum = goal.ayahStart + i;
                  const done = completedSet.has(ayahNum);
                  return (
                    <div
                      key={ayahNum}
                      title={`Ayah ${ayahNum}`}
                      className={cn(
                        "w-2.5 h-2.5 rounded-sm",
                        done ? "bg-primary" : "bg-muted",
                      )}
                    />
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const { storage } = useTrackerStorage();
  const [stats, setStats] = useState<TrackerStats | null>(null);
  const [todayPlan, setTodayPlan] = useState<DailyPlan | null>(null);
  const [isLogModalOpen, setIsLogModalOpen] = useState(false);
  const [isGoalModalOpen, setIsGoalModalOpen] = useState(false);

  const { goals, createGoal, deleteGoal } = useGoals();

  const reload = useCallback(async () => {
    const [s, p] = await Promise.all([storage.getStats(), storage.getTodayPlan()]);
    setStats(s);
    setTodayPlan(p);
  }, [storage]);

  useEffect(() => { reload(); }, [reload]);

  const memorizedPages = stats?.memorizedPages || 0;
  const dueToday = stats?.dueToday || 0;
  const dayStreak = stats?.dayStreak || 0;

  const progressData = [
    { name: "Memorized", value: memorizedPages || 0, color: "hsl(var(--primary))" },
    { name: "Remaining", value: Math.max(0, TOTAL_PAGES - memorizedPages) || 1, color: "hsl(var(--secondary))" },
  ];

  const percentage = TOTAL_PAGES > 0 ? Math.floor((memorizedPages / TOTAL_PAGES) * 100) : 0;
  const plannedItems = todayPlan?.plannedItems || [];
  const completedItems = todayPlan?.completedItems || [];

  const activeGoals = goals.filter((g) => g.status === "active");
  const completedGoals = goals.filter((g) => g.status === "complete");

  return (
    <AppShell>
      <GuestBanner />
      <div className="p-4 max-w-6xl mx-auto space-y-6">
        {/* Main stats row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-card rounded-3xl p-6 md:p-8 border border-border/50 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />
            <div className="flex flex-col md:flex-row items-center justify-between gap-8 relative z-10">
              <div className="flex-1 w-full text-center md:text-left">
                <h3 className="text-sm font-bold tracking-widest text-accent uppercase mb-2">Total Progress</h3>
                <h2 className="text-4xl md:text-5xl font-serif text-foreground mb-1" data-testid="text-memorized-pages">
                  {memorizedPages} <span className="text-xl md:text-2xl text-muted-foreground">/ {TOTAL_PAGES} pages</span>
                </h2>
                <p className="text-xs text-muted-foreground mb-4">Only memorization rated 3+ counts toward progress</p>
                <p className="text-muted-foreground max-w-sm mx-auto md:mx-0 leading-relaxed">
                  {memorizedPages > 0
                    ? `MashaAllah, you have memorized ${percentage}% of the Quran. Keep up the consistency.`
                    : "Log your first memorization to start tracking progress."}
                </p>

                <div className="flex gap-4 mt-8 justify-center md:justify-start">
                  <div className="bg-background rounded-2xl px-5 py-4 flex-1 max-w-[140px] border border-border/50 text-center">
                    <Trophy className="w-6 h-6 text-accent mx-auto mb-2" />
                    <p className="text-2xl font-bold text-foreground" data-testid="text-due-today">{dueToday}</p>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider mt-1">Due Today</p>
                  </div>
                  <div className="bg-background rounded-2xl px-5 py-4 flex-1 max-w-[140px] border border-border/50 text-center">
                    <Flame className="w-6 h-6 text-primary mx-auto mb-2" />
                    <p className="text-2xl font-bold text-foreground" data-testid="text-day-streak">{dayStreak}</p>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider mt-1">Day Streak</p>
                  </div>
                </div>
              </div>

              <div className="w-64 h-64 relative flex-shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={progressData} cx="50%" cy="50%" innerRadius={75} outerRadius={100} stroke="none" paddingAngle={5} dataKey="value" cornerRadius={10}>
                      {progressData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 4px 20px rgba(0,0,0,0.1)" }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex items-center justify-center flex-col pointer-events-none">
                  <span className="text-3xl font-serif font-bold text-foreground">{percentage}%</span>
                </div>
              </div>
            </div>
          </div>

          {/* Daily Plan card */}
          <div className="flex flex-col gap-6">
            <div className="bg-card rounded-3xl p-6 border border-border/50 flex-1">
              <div className="flex justify-between items-center mb-6">
                <h3 className="font-serif font-bold text-lg text-foreground">Daily Plan</h3>
                <Link href="/track/plan" className="text-primary hover:text-primary/80 transition-colors p-2 rounded-full hover:bg-primary/10" data-testid="link-daily-plan">
                  <ArrowRight size={20} />
                </Link>
              </div>

              {todayPlan && plannedItems.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground mb-3 font-medium">
                    {completedItems.length}/{plannedItems.length} completed
                  </p>
                  {plannedItems.slice(0, 5).map((ref, idx) => {
                    const isDone = completedItems.includes(ref);
                    return (
                      <div
                        key={`${ref}-${idx}`}
                        data-testid={`dashboard-plan-item-${idx}`}
                        className={cn(
                          "flex items-center gap-3 p-3 rounded-xl border border-transparent transition-colors",
                          isDone ? "opacity-50" : "hover:bg-secondary/30 hover:border-border/50",
                        )}
                      >
                        <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", isDone ? "bg-primary/15 text-primary" : "bg-primary/10 text-primary")}>
                          {isDone ? <CheckCircle2 size={16} /> : <Play size={14} className="ml-0.5" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={cn("text-sm font-semibold text-foreground truncate", isDone && "line-through text-muted-foreground")}>
                            {formatReference(ref)}
                          </p>
                        </div>
                        {isDone && <span className="text-[9px] uppercase tracking-wider font-bold bg-primary/10 text-primary px-2 py-0.5 rounded-full">Done</span>}
                      </div>
                    );
                  })}
                  {plannedItems.length > 5 && <p className="text-xs text-muted-foreground text-center pt-1">+{plannedItems.length - 5} more</p>}
                </div>
              ) : (
                <div className="text-center py-10">
                  <div className="w-16 h-16 rounded-full bg-secondary/50 flex items-center justify-center mx-auto mb-4 text-muted-foreground">
                    <Trophy size={24} />
                  </div>
                  <p className="text-foreground font-medium">No plan yet</p>
                  <p className="text-sm text-muted-foreground mt-1">Generate a daily plan to get started.</p>
                </div>
              )}

              <Link
                href="/track/plan"
                data-testid="link-start-session"
                className="mt-6 w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-secondary/50 text-foreground font-medium hover:bg-secondary transition-colors border border-border/50"
              >
                {todayPlan ? "Continue Session" : "Start Session"}
              </Link>
            </div>
          </div>
        </div>

        {/* Goals section */}
        <div className="bg-card rounded-3xl p-6 border border-border/50">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <Target className="w-5 h-5 text-primary" />
              <h3 className="font-serif font-bold text-lg text-foreground">Memorization Goals</h3>
              {goals.length > 0 && (
                <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full font-medium">
                  {activeGoals.length} active
                </span>
              )}
            </div>
            <button
              data-testid="button-new-goal"
              onClick={() => setIsGoalModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary/10 text-primary hover:bg-primary/20 transition-colors text-sm font-medium"
            >
              <Plus className="w-4 h-4" />
              New Goal
            </button>
          </div>

          {goals.length === 0 ? (
            <div className="text-center py-10">
              <div className="w-14 h-14 rounded-full bg-secondary/50 flex items-center justify-center mx-auto mb-3 text-muted-foreground">
                <Target size={22} />
              </div>
              <p className="text-foreground font-medium">No goals yet</p>
              <p className="text-sm text-muted-foreground mt-1 mb-4">Set a memorization goal to track your progress ayah by ayah.</p>
              <button
                onClick={() => setIsGoalModalOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Create Your First Goal
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {activeGoals.map((g) => (
                <GoalCard key={g.id} goal={g} onDelete={deleteGoal} />
              ))}
              {completedGoals.map((g) => (
                <GoalCard key={g.id} goal={g} onDelete={deleteGoal} />
              ))}
            </div>
          )}
        </div>
      </div>

      <button
        data-testid="button-dashboard-log"
        onClick={() => setIsLogModalOpen(true)}
        className="fixed bottom-6 right-6 w-14 h-14 rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/30 hover:shadow-xl hover:scale-105 active:scale-95 transition-all duration-200 flex items-center justify-center z-40"
        title="Log Revision"
      >
        <PenLine size={22} />
      </button>

      <LogModal isOpen={isLogModalOpen} onClose={() => { setIsLogModalOpen(false); reload(); }} />
      <GoalModal
        open={isGoalModalOpen}
        onClose={() => setIsGoalModalOpen(false)}
        onCreate={createGoal}
      />
    </AppShell>
  );
}
