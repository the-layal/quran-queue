import { History, Loader2, AlertCircle } from "lucide-react";
import AppShell from "../../components/AppShell";
import GuestBanner from "../../components/GuestBanner";
import { useLogs } from "../../hooks/useTracker";

const VIBE_LABEL: Record<number, string> = {
  1: "Blackout", 2: "Wrong", 3: "Difficult", 4: "Hesitated", 5: "Perfect",
};
const VIBE_COLOR: Record<number, string> = {
  1: "text-red-500", 2: "text-orange-400", 3: "text-yellow-500", 4: "text-emerald-500", 5: "text-green-500",
};

function intensityClass(count: number): string {
  if (count === 0) return "bg-muted";
  if (count <= 2) return "bg-emerald-200 dark:bg-emerald-900";
  if (count <= 5) return "bg-emerald-400 dark:bg-emerald-700";
  if (count <= 9) return "bg-emerald-600 dark:bg-emerald-500";
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

  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <h2 className="text-sm font-semibold mb-3">Activity — last 15 weeks</h2>
      <div className="overflow-x-auto">
        <div className="flex gap-0.5">
          {weeks.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-0.5">
              {week.map(({ date, count }) => (
                <div key={date} title={count > 0 ? `${date}: ${count} review${count !== 1 ? "s" : ""}` : date}
                  className={`w-4 h-4 rounded-sm flex-shrink-0 ${intensityClass(count)}`} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function HistoryContent() {
  const { logs, loading, error, reload } = useLogs();

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
                        <div className="text-sm font-medium truncate">{log.reference}</div>
                        <div className="text-xs text-muted-foreground">{log.type}</div>
                      </div>
                      <span className={`text-xs font-medium flex-shrink-0 ${VIBE_COLOR[log.vibeScale] ?? "text-muted-foreground"}`}>
                        {VIBE_LABEL[log.vibeScale] ?? `V${log.vibeScale}`}
                      </span>
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
        <GuestBanner />
        <HistoryContent />
      </main>
    </AppShell>
  );
}
