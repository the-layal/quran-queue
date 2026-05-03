import { useState } from "react";
import { History, Loader2, AlertCircle, Trash2 } from "lucide-react";
import AppShell from "../../components/AppShell";
import AuthRequired from "../../components/AuthRequired";
import { useLogs } from "../../hooks/useTracker";

const QUALITY_COLORS: Record<number, string> = {
  0: "text-red-500", 1: "text-red-400", 2: "text-orange-400",
  3: "text-yellow-500", 4: "text-emerald-500", 5: "text-green-500",
};
const QUALITY_LABELS: Record<number, string> = {
  0: "Blackout", 1: "Wrong", 2: "Wrong (familiar)", 3: "Difficult", 4: "Hesitated", 5: "Perfect",
};

function intensityClass(count: number): string {
  if (count === 0) return "bg-muted";
  if (count <= 2)  return "bg-emerald-200 dark:bg-emerald-900";
  if (count <= 5)  return "bg-emerald-400 dark:bg-emerald-700";
  if (count <= 9)  return "bg-emerald-600 dark:bg-emerald-500";
  return "bg-emerald-800 dark:bg-emerald-400";
}

function ActivityCalendar({ countByDate }: { countByDate: Record<string, number> }) {
  const WEEKS = 15;
  const today = new Date();
  const totalDays = WEEKS * 7;
  const cells: Array<{ date: string; count: number }> = [];
  for (let i = totalDays - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const ds = d.toISOString().slice(0, 10);
    cells.push({ date: ds, count: countByDate[ds] ?? 0 });
  }

  const weeks: typeof cells[] = [];
  for (let w = 0; w < WEEKS; w++) weeks.push(cells.slice(w * 7, (w + 1) * 7));

  const months: Array<{ label: string; col: number }> = [];
  let lastMonth = "";
  weeks.forEach((week, wi) => {
    const m = week[0]?.date.slice(0, 7) ?? "";
    if (m !== lastMonth) {
      months.push({ label: new Date(week[0].date + "T12:00:00").toLocaleString("default", { month: "short" }), col: wi });
      lastMonth = m;
    }
  });

  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <h2 className="text-sm font-semibold mb-3">Activity — last 15 weeks</h2>
      <div className="overflow-x-auto">
        <div className="inline-block min-w-0">
          <div className="flex mb-1" style={{ paddingLeft: 18 }}>
            {weeks.map((_, wi) => {
              const m = months.find((m) => m.col === wi);
              return (
                <div key={wi} className="w-4 mr-0.5 text-[9px] text-muted-foreground leading-none flex-shrink-0">
                  {m?.label ?? ""}
                </div>
              );
            })}
          </div>
          <div className="flex gap-0.5">
            <div className="flex flex-col gap-0.5 mr-0.5">
              {["", "M", "", "W", "", "F", ""].map((d, i) => (
                <div key={i} className="w-4 h-4 text-[9px] text-muted-foreground leading-4 text-right pr-0.5">{d}</div>
              ))}
            </div>
            {weeks.map((week, wi) => (
              <div key={wi} className="flex flex-col gap-0.5">
                {week.map(({ date, count }) => (
                  <div key={date} title={count > 0 ? `${date}: ${count} review${count !== 1 ? "s" : ""}` : date}
                    className={`w-4 h-4 rounded-sm flex-shrink-0 ${intensityClass(count)}`} />
                ))}
              </div>
            ))}
          </div>
          <div className="flex items-center gap-1.5 mt-2 justify-end">
            <span className="text-[10px] text-muted-foreground">Less</span>
            {["bg-muted", "bg-emerald-200 dark:bg-emerald-900", "bg-emerald-400 dark:bg-emerald-700", "bg-emerald-600 dark:bg-emerald-500", "bg-emerald-800 dark:bg-emerald-400"].map((cls, i) => (
              <div key={i} className={`w-3 h-3 rounded-sm ${cls}`} />
            ))}
            <span className="text-[10px] text-muted-foreground">More</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function HistoryContent() {
  const { logs, loading, error, reload, deleteLog } = useLogs();
  const [deleting, setDeleting] = useState<number | null>(null);

  const handleDelete = async (id: number) => {
    setDeleting(id);
    try { await deleteLog(id); } finally { setDeleting(null); }
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 px-4">
        <AlertCircle className="w-8 h-8 text-destructive" />
        <p className="text-sm text-destructive text-center">{error}</p>
        <button onClick={reload} className="text-sm text-primary underline">Try again</button>
      </div>
    );
  }

  const countByDate: Record<string, number> = {};
  const grouped: Record<string, typeof logs> = {};
  for (const log of logs) {
    const date = log.createdAt.slice(0, 10);
    countByDate[date] = (countByDate[date] ?? 0) + 1;
    if (!grouped[date]) grouped[date] = [];
    grouped[date].push(log);
  }
  const dates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">History</h1>
        <span className="text-xs text-muted-foreground">{logs.length} reviews</span>
      </div>

      {logs.length > 0 && <ActivityCalendar countByDate={countByDate} />}

      {dates.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <History className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No reviews logged yet.</p>
          <p className="text-xs mt-1">Complete your daily plan to build a history.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {dates.map((date) => {
            const dayLogs = grouped[date];
            const label = new Date(date + "T12:00:00").toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
            return (
              <div key={date} className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
                  <span className="text-sm font-semibold">{label}</span>
                  <span className="text-xs text-muted-foreground">{dayLogs.length} reviews</span>
                </div>
                <div className="divide-y divide-border/50">
                  {dayLogs.map((log) => (
                    <div key={log.id} className="flex items-center gap-3 px-4 py-3">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm">Surah {log.surah} · {log.ayahStart}–{log.ayahEnd}</div>
                        {log.notes && <div className="text-xs text-muted-foreground truncate mt-0.5">{log.notes}</div>}
                      </div>
                      <span className={`text-xs font-medium flex-shrink-0 ${QUALITY_COLORS[log.quality] ?? "text-muted-foreground"}`}>
                        {QUALITY_LABELS[log.quality] ?? `Q${log.quality}`}
                      </span>
                      <button onClick={() => handleDelete(log.id)} disabled={deleting === log.id}
                        className="flex-shrink-0 p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-colors disabled:opacity-50"
                        aria-label="Delete log">
                        {deleting === log.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function HistoryPage() {
  return (
    <AppShell centerContent={<span className="text-sm font-medium text-muted-foreground">History</span>}>
      <main className="flex-1">
        <AuthRequired>
          <HistoryContent />
        </AuthRequired>
      </main>
    </AppShell>
  );
}
