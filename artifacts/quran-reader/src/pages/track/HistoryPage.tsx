import { useState, useMemo } from "react";
import AppShell from "@/components/AppShell";
import GuestBanner from "@/components/GuestBanner";
import { useAllPlans, useToggleHistoryItem } from "@/hooks/useTracker";
import type { DailyPlan } from "@/hooks/useTracker";
import { ChevronLeft, ChevronRight, CheckCircle2, Circle, BookOpen, Calendar, Pencil, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { getSurahNamesForPageRange, getPageCountForReference } from "@/lib/page-utils";

function formatReference(ref: string): string {
  const parts = ref.split(":");
  const type = parts[0];
  if (type === "page") {
    const val = parts[1] || "";
    const rangeParts = val.split("-");
    const from = parseInt(rangeParts[0], 10);
    const to = rangeParts.length > 1 ? parseInt(rangeParts[1], 10) : from;
    const surahNames = getSurahNamesForPageRange(from, to).join(", ");
    const pageLabel = from === to ? `Page ${from}` : `Pages ${from}–${to}`;
    return surahNames ? `${pageLabel} — ${surahNames}` : pageLabel;
  }
  if (type === "surah") return `Surah ${parts[1] || ""}`;
  if (type === "juz") return `Juz ${parts[1] || ""}`;
  return ref;
}

function formatPageCount(ref: string): string {
  const count = getPageCountForReference(ref);
  return count === 1 ? "1 pg" : `${count} pg`;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type DayStatus = "complete" | "partial" | "empty" | "none";

function getDayStatus(plan: DailyPlan | undefined): DayStatus {
  if (!plan) return "none";
  const planned = plan.plannedItems || [];
  const completed = plan.completedItems || [];
  if (planned.length === 0) return "none";
  if (completed.length === 0) return "empty";
  if (completed.length >= planned.length) return "complete";
  return "partial";
}

function getDotColor(status: DayStatus): string {
  switch (status) {
    case "complete": return "bg-primary";
    case "partial": return "bg-amber-400";
    case "empty": return "bg-muted-foreground/40";
    default: return "";
  }
}

function formatLongDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}

export default function HistoryPage() {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const { data: plans = [], isLoading } = useAllPlans();
  const toggleItem = useToggleHistoryItem();

  const plansByDate = useMemo(() => {
    const map: Record<string, DailyPlan> = {};
    for (const p of plans) map[p.date] = p;
    return map;
  }, [plans]);

  const selectedPlan = selectedDate ? plansByDate[selectedDate] : null;

  function prevMonth() {
    if (viewMonth === 0) { setViewYear((y) => y - 1); setViewMonth(11); }
    else setViewMonth((m) => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewYear((y) => y + 1); setViewMonth(0); }
    else setViewMonth((m) => m + 1);
  }

  const calendarDays = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const cells: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [viewYear, viewMonth]);

  function makeDateStr(day: number) {
    return `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  function isToday(day: number) {
    return viewYear === today.getFullYear() && viewMonth === today.getMonth() && day === today.getDate();
  }

  const monthHasSomePlans = useMemo(() => {
    return calendarDays.some((d) => d !== null && plansByDate[makeDateStr(d)] !== undefined);
  }, [calendarDays, plansByDate, viewYear, viewMonth]);

  const planned = selectedPlan?.plannedItems || [];
  const completedSet = new Set<string>(selectedPlan?.completedItems || []);

  function handleDaySelect(ds: string, hasPlan: boolean, isSelected: boolean) {
    if (!hasPlan) return;
    setEditing(false);
    setSelectedDate(isSelected ? null : ds);
  }

  function handleToggle(ref: string) {
    if (!selectedDate || toggleItem.isPending) return;
    toggleItem.mutate({ date: selectedDate, reference: ref });
  }

  return (
    <AppShell>
      <GuestBanner />
      <div className="p-4 max-w-5xl mx-auto">
      <div className="flex flex-col lg:flex-row gap-6">
        <div className="flex-1 min-w-0">
          <div className="bg-card rounded-2xl border border-border/50 p-6">
            <div className="flex items-center justify-between mb-6">
              <button onClick={prevMonth} className="p-2 rounded-xl hover:bg-secondary/60 text-muted-foreground hover:text-foreground transition-colors" data-testid="button-prev-month">
                <ChevronLeft size={20} />
              </button>
              <h2 className="font-serif text-xl font-semibold text-foreground">{MONTH_NAMES[viewMonth]} {viewYear}</h2>
              <button onClick={nextMonth} className="p-2 rounded-xl hover:bg-secondary/60 text-muted-foreground hover:text-foreground transition-colors" data-testid="button-next-month">
                <ChevronRight size={20} />
              </button>
            </div>

            <div className="grid grid-cols-7 mb-2">
              {DAY_LABELS.map((d) => (<div key={d} className="text-center text-xs font-medium text-muted-foreground py-1">{d}</div>))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {calendarDays.map((day, idx) => {
                if (!day) return <div key={`empty-${idx}`} />;
                const ds = makeDateStr(day);
                const plan = plansByDate[ds];
                const status = getDayStatus(plan);
                const isSelected = selectedDate === ds;
                const todayDay = isToday(day);

                return (
                  <button
                    key={ds}
                    data-testid={`day-cell-${ds}`}
                    onClick={() => handleDaySelect(ds, !!plan, isSelected)}
                    className={cn(
                      "relative flex flex-col items-center justify-center h-11 rounded-xl transition-all duration-150 select-none",
                      plan ? "cursor-pointer hover:bg-secondary/50" : "cursor-default",
                      isSelected ? "bg-primary/10 ring-2 ring-primary ring-offset-1" : "",
                    )}
                  >
                    <span className={cn(
                      "text-sm font-medium leading-none",
                      todayDay ? "text-primary font-bold" : plan ? "text-foreground" : "text-muted-foreground/40",
                    )}>{day}</span>
                    {status !== "none" && (<span className={cn("w-1.5 h-1.5 rounded-full mt-1", getDotColor(status))} />)}
                    {todayDay && status === "none" && (<span className="w-1.5 h-1.5 rounded-full mt-1 bg-primary/30" />)}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-5 mt-5 pt-4 border-t border-border/40 flex-wrap">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><span className="w-2 h-2 rounded-full bg-primary inline-block" /> All done</div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" /> Partial</div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><span className="w-2 h-2 rounded-full bg-muted-foreground/40 inline-block" /> Nothing done</div>
            </div>
          </div>

          {!isLoading && !monthHasSomePlans && (
            <p className="text-center text-sm text-muted-foreground mt-4">No plans recorded this month.</p>
          )}
        </div>

        <div className="lg:w-80 shrink-0">
          {selectedPlan && selectedDate ? (
            <div className="bg-card rounded-2xl border border-border/50 p-6">
              <div className="flex items-start justify-between mb-1 gap-2">
                <div className="flex items-start gap-2 min-w-0">
                  <Calendar size={16} className="text-primary mt-0.5 shrink-0" />
                  <h3 className="font-serif font-semibold text-foreground text-base leading-snug">{formatLongDate(selectedDate)}</h3>
                </div>
                <button
                  data-testid="button-edit-history"
                  onClick={() => setEditing((e) => !e)}
                  className={cn(
                    "shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors",
                    editing ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
                  )}
                >
                  {editing ? <X size={13} /> : <Pencil size={13} />}
                  {editing ? "Done" : "Edit"}
                </button>
              </div>

              <p className="text-xs text-muted-foreground mb-5">
                Bandwidth: {selectedPlan.bandwidth} {selectedPlan.bandwidth === 1 ? "page" : "pages"}
                {" · "}
                {completedSet.size} / {planned.length} completed
              </p>

              {editing && (
                <p className="text-xs text-primary/70 mb-3 bg-primary/5 rounded-lg px-3 py-2">
                  Tap any item to mark it done or undone.
                </p>
              )}

              {planned.length === 0 ? (
                <p className="text-sm text-muted-foreground">No items were planned.</p>
              ) : (
                <ul className="space-y-2" data-testid="history-plan-items">
                  {planned.map((ref, i) => {
                    const done = completedSet.has(ref);
                    return (
                      <li
                        key={i}
                        data-testid={`history-item-${i}`}
                        onClick={() => editing && handleToggle(ref)}
                        className={cn(
                          "flex items-start gap-2.5 p-3 rounded-xl border transition-all",
                          done ? "bg-primary/5 border-primary/20" : "bg-secondary/30 border-border/40",
                          editing && "cursor-pointer hover:ring-2 hover:ring-primary/30",
                          editing && toggleItem.isPending && "opacity-60 pointer-events-none",
                        )}
                      >
                        {done
                          ? <CheckCircle2 size={16} className="text-primary mt-0.5 shrink-0" />
                          : <Circle size={16} className="mt-0.5 shrink-0 text-muted-foreground/40" />}
                        <div className="min-w-0 flex-1">
                          <p className={cn("font-medium leading-snug text-sm", done ? "text-foreground" : "text-muted-foreground")}>
                            {formatReference(ref)}
                          </p>
                          <p className="text-xs text-muted-foreground/60 mt-0.5">{formatPageCount(ref)}</p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}

              {!editing && completedSet.size > 0 && completedSet.size >= planned.length && (
                <div className="mt-4 pt-4 border-t border-border/40 text-center">
                  <p className="text-xs text-primary font-semibold">Day fully completed</p>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-card rounded-2xl border border-border/50 p-8 flex flex-col items-center justify-center text-center min-h-48">
              <BookOpen size={28} className="text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">
                {isLoading ? "Loading plans…" : "Select a highlighted day to see its plan"}
              </p>
            </div>
          )}
        </div>
      </div>
      </div>
    </AppShell>
  );
}
