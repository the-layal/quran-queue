import { useState, useEffect, useCallback } from "react";
import AppShell from "@/components/AppShell";
import GuestBanner from "@/components/GuestBanner";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { useTrackerStorage } from "@/context/useTrackerStorage";
import type { DailyPlan, TrackerStats } from "@/storage/trackerStorage";
import { Trophy, ArrowRight, PenLine, CheckCircle2, Play, Flame } from "lucide-react";
import { TOTAL_PAGES, SURAHS } from "@/lib/quran-data";
import { Link } from "wouter";
import { LogModal } from "@/components/LogModal";
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

export default function Dashboard() {
  const { storage } = useTrackerStorage();
  const [stats, setStats] = useState<TrackerStats | null>(null);
  const [todayPlan, setTodayPlan] = useState<DailyPlan | null>(null);
  const [isLogModalOpen, setIsLogModalOpen] = useState(false);

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

  return (
    <AppShell>
      <GuestBanner />
      <div className="p-4 max-w-6xl mx-auto">
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
    </AppShell>
  );
}
