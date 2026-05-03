import { BookOpen, Calendar, TrendingUp, LayoutDashboard, Flame, Loader2, AlertCircle, Plus } from "lucide-react";
import { useLocation } from "wouter";
import AppShell from "../../components/AppShell";
import QuranGrid from "../../components/QuranGrid";
import GuestBanner from "../../components/GuestBanner";
import { useStats, useSrsItems } from "../../hooks/useTracker";
import { useState } from "react";
import LogReviewModal from "../../components/LogReviewModal";

const QUALITY_INFO: Record<number, { label: string; fill: string }> = {
  5: { label: "Perfect",        fill: "#22c55e" },
  4: { label: "Hesitated",      fill: "#10b981" },
  3: { label: "Difficult",      fill: "#eab308" },
  2: { label: "Wrong (easy)",   fill: "#fb923c" },
  1: { label: "Wrong",          fill: "#f87171" },
  0: { label: "Blackout",       fill: "#ef4444" },
};

function DonutChart({ distribution, total }: { distribution: Record<number, number>; total: number }) {
  const cx = 50, cy = 50, r = 36;
  const circ = 2 * Math.PI * r;
  let cumulative = 0;
  const segments = [5, 4, 3, 2, 1, 0].flatMap((q) => {
    const count = distribution[q] ?? 0;
    if (count === 0) return [];
    const pct = count / total;
    const seg = { quality: q, offset: circ - cumulative * circ, dasharray: `${pct * circ} ${(1 - pct) * circ}` };
    cumulative += pct;
    return [seg];
  });

  return (
    <div className="flex items-center gap-4">
      <div className="relative flex-shrink-0 w-24 h-24">
        <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth="14" />
          {segments.map(({ quality, offset, dasharray }) => (
            <circle key={quality} cx={cx} cy={cy} r={r} fill="none"
              stroke={QUALITY_INFO[quality]?.fill ?? "#94a3b8"} strokeWidth="14"
              strokeDasharray={dasharray} strokeDashoffset={offset} strokeLinecap="butt" />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-bold tabular-nums">{total}</span>
          <span className="text-[10px] text-muted-foreground">reviews</span>
        </div>
      </div>
      <div className="flex flex-col gap-1 flex-1 min-w-0">
        {[5, 4, 3, 2, 1, 0].map((q) => {
          const count = distribution[q] ?? 0;
          if (count === 0) return null;
          return (
            <div key={q} className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: QUALITY_INFO[q].fill }} />
              <span className="text-xs text-muted-foreground flex-1 truncate">{QUALITY_INFO[q].label}</span>
              <span className="text-xs font-medium tabular-nums">{count}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DashboardContent() {
  const { stats, loading: statsLoading, error: statsError, reload: reloadStats } = useStats();
  const { items, loading: srsLoading, reload: reloadSrs } = useSrsItems();
  const [logOpen, setLogOpen] = useState(false);
  const [, navigate] = useLocation();

  const loading = statsLoading || srsLoading;

  if (loading) {
    return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  if (statsError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 px-4">
        <AlertCircle className="w-8 h-8 text-destructive" />
        <p className="text-sm text-destructive text-center">{statsError}</p>
        <button onClick={reloadStats} className="text-sm text-primary underline">Try again</button>
      </div>
    );
  }

  if (!stats) return null;

  const totalQuality = Object.values(stats.qualityDistribution).reduce((a, b) => a + b, 0);

  const statCards = [
    { label: "Tracked Segments", value: stats.totalItems,               icon: <BookOpen className="w-5 h-5 text-primary" />,       desc: "SRS items" },
    { label: "Due Today",        value: stats.dueToday,                 icon: <Calendar className="w-5 h-5 text-orange-500" />,    desc: "Need review" },
    { label: "Today's Reviews",  value: stats.todayReviews,             icon: <TrendingUp className="w-5 h-5 text-emerald-500" />, desc: "Completed today" },
    { label: "Day Streak",       value: `${stats.dayStreak}d`,          icon: <Flame className="w-5 h-5 text-red-500" />,          desc: stats.dayStreak > 0 ? "Keep it up!" : "Log a review to start" },
  ];

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <button
          onClick={() => setLogOpen(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Log Review
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3">
        {statCards.map((card) => (
          <div key={card.label} className="bg-card border border-border rounded-xl p-4 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground font-medium">{card.label}</span>
              {card.icon}
            </div>
            <div className="text-2xl font-bold tabular-nums">{card.value}</div>
            <div className="text-xs text-muted-foreground">{card.desc}</div>
          </div>
        ))}
      </div>

      {/* Quran mastery grid */}
      <QuranGrid items={items} onSurahClick={(s) => navigate(`/track/library/${s}`)} />

      {/* Quality donut */}
      {totalQuality > 0 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <h2 className="text-sm font-semibold mb-4">Quality Distribution (last 100 reviews)</h2>
          <DonutChart distribution={stats.qualityDistribution} total={totalQuality} />
        </div>
      )}

      {/* Recent logs */}
      {stats.recentLogs.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <h2 className="text-sm font-semibold mb-3">Recent Reviews</h2>
          <div className="space-y-2">
            {stats.recentLogs.map((log) => (
              <div key={log.id} className="flex items-center gap-3 py-2 border-b border-border/50 last:border-0">
                <div className="text-xs text-muted-foreground tabular-nums">{log.surah}:{log.ayahStart}–{log.ayahEnd}</div>
                <div className="flex-1">
                  <span className="text-xs" style={{ color: QUALITY_INFO[log.quality]?.fill }}>
                    {QUALITY_INFO[log.quality]?.label ?? `Q${log.quality}`}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">{new Date(log.createdAt).toLocaleDateString()}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {stats.totalItems === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No segments tracked yet.</p>
          <p className="text-xs mt-1">Use the "Log Review" button to start tracking your memorization.</p>
        </div>
      )}

      {logOpen && (
        <LogReviewModal onClose={() => setLogOpen(false)} onSuccess={() => { reloadStats(); reloadSrs(); }} />
      )}
    </div>
  );
}

export default function Dashboard() {
  return (
    <AppShell centerContent={<span className="text-sm font-medium text-muted-foreground">Dashboard</span>}>
      <main className="flex-1">
        <GuestBanner />
        <DashboardContent />
      </main>
    </AppShell>
  );
}
