import { useState, useMemo, useEffect } from "react";
import AppShell from "@/components/AppShell";
import GuestBanner from "@/components/GuestBanner";
import { SURAHS } from "@/lib/quran-data";
import { Search, CalendarClock, PenLine, LayoutGrid, List } from "lucide-react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { useLogs } from "@/hooks/useTracker";
import { getAyahsForReference } from "@/storage/referenceFanOut";
import { LogModal } from "@/components/LogModal";

type StatusFilter = "all" | "not_started" | "in_progress" | "completed";
type LibraryView = "standard" | "simple";

const VIEW_STORAGE_KEY = "hafith_library_view";

function getInitialView(): LibraryView {
  if (typeof window === "undefined") return "standard";
  try {
    const v = window.localStorage.getItem(VIEW_STORAGE_KEY);
    return v === "simple" ? "simple" : "standard";
  } catch {
    return "standard";
  }
}

export default function LibraryPage() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [vibeFilter, setVibeFilter] = useState<number | null>(null);
  const [dateFilter, setDateFilter] = useState<string>("");
  const [isLogModalOpen, setIsLogModalOpen] = useState(false);
  const [view, setView] = useState<LibraryView>(getInitialView);
  const { data: logs } = useLogs();

  useEffect(() => {
    try { window.localStorage.setItem(VIEW_STORAGE_KEY, view); } catch { /* ignore */ }
  }, [view]);

  const { surahStatus, surahVibes, surahOldestDate, surahAvgVibe } = useMemo(() => {
    const statusMap: Record<number, StatusFilter> = {};
    const vibeMap: Record<number, Set<number>> = {};
    const oldestDateMap: Record<number, Date> = {};
    const avgVibeMap: Record<number, number> = {};
    if (!logs) {
      SURAHS.forEach((s) => { statusMap[s.id] = "not_started"; });
      return { surahStatus: statusMap, surahVibes: vibeMap, surahOldestDate: oldestDateMap, surahAvgVibe: avgVibeMap };
    }

    const loggedAyahs: Record<number, Set<number>> = {};
    const ayahVibes: Record<string, number> = {};
    const ayahDates: Record<string, Date> = {};

    const sorted = [...logs].reverse();
    for (const log of sorted) {
      const logDate = new Date(log.createdAt);
      const groups = getAyahsForReference(log.reference);
      for (const g of groups) {
        for (const a of g.ayahs) {
          if (!loggedAyahs[g.surah]) loggedAyahs[g.surah] = new Set();
          loggedAyahs[g.surah].add(a);
          ayahVibes[`${g.surah}:${a}`] = log.vibeScale;
          const key = `${g.surah}:${a}`;
          if (!ayahDates[key] || logDate > ayahDates[key]) ayahDates[key] = logDate;
        }
      }
    }

    SURAHS.forEach((s) => {
      const logged = loggedAyahs[s.id];
      if (!logged || logged.size === 0) statusMap[s.id] = "not_started";
      else if (logged.size >= s.ayahCount) statusMap[s.id] = "completed";
      else statusMap[s.id] = "in_progress";

      const vibes = new Set<number>();
      let oldest: Date | null = null;
      let vibeSum = 0;
      let vibeCount = 0;
      if (logged) {
        Array.from(logged).forEach((a) => {
          const v = ayahVibes[`${s.id}:${a}`];
          if (v) { vibes.add(v); vibeSum += v; vibeCount += 1; }
          const d = ayahDates[`${s.id}:${a}`];
          if (d && (!oldest || d < oldest)) oldest = d;
        });
      }
      if (vibes.size > 0) vibeMap[s.id] = vibes;
      if (oldest) oldestDateMap[s.id] = oldest;
      if (vibeCount > 0) avgVibeMap[s.id] = vibeSum / vibeCount;
    });

    return { surahStatus: statusMap, surahVibes: vibeMap, surahOldestDate: oldestDateMap, surahAvgVibe: avgVibeMap };
  }, [logs]);

  const getHeatmapColor = (sid: number): string => {
    const status = surahStatus[sid];
    if (status === "not_started") {
      return "bg-secondary/30 text-muted-foreground border-border hover:border-primary/50";
    }
    const avg = surahAvgVibe[sid];
    const level = avg ? Math.max(1, Math.min(5, Math.round(avg))) : 0;
    switch (level) {
      case 5: return "bg-primary text-primary-foreground border-primary";
      case 4: return "bg-primary/80 text-primary-foreground border-primary/80";
      case 3: return "bg-primary/60 text-primary-foreground border-primary/60";
      case 2: return "bg-primary/40 text-foreground border-primary/40";
      case 1: return "bg-primary/20 text-foreground border-primary/20";
      default: return "bg-primary/10 text-foreground border-primary/20 hover:border-primary/50";
    }
  };

  const filteredSurahs = SURAHS.filter((s) => {
    const matchesSearch = s.englishName.toLowerCase().includes(search.toLowerCase()) || s.name.includes(search);
    const matchesFilter = filter === "all" || surahStatus[s.id] === filter;
    const matchesVibe = vibeFilter === null || (surahVibes[s.id]?.has(vibeFilter) ?? false);
    let matchesDate = true;
    if (dateFilter) {
      const filterDate = new Date(dateFilter + "T23:59:59");
      const oldest = surahOldestDate[s.id];
      matchesDate = oldest ? oldest <= filterDate : false;
    }
    return matchesSearch && matchesFilter && matchesVibe && matchesDate;
  });

  const filterOptions: { value: StatusFilter; label: string }[] = [
    { value: "all", label: "All" },
    { value: "not_started", label: "Not Started" },
    { value: "in_progress", label: "In Progress" },
    { value: "completed", label: "Completed" },
  ];

  const statusBadge = (sid: number) => {
    const s = surahStatus[sid];
    if (s === "completed") return <span data-testid={`badge-status-${sid}`} className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-primary/15 text-primary">Done</span>;
    if (s === "in_progress") return <span data-testid={`badge-status-${sid}`} className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-accent/15 text-accent">In Progress</span>;
    return null;
  };

  return (
    <AppShell>
      <GuestBanner />
      <div className="p-4 max-w-6xl mx-auto">
      <div className="mb-6 flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <div className="relative w-64 shrink-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <input
              type="text"
              data-testid="input-search-surah"
              placeholder="Search surahs..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-card border border-border/50 rounded-xl text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all"
            />
          </div>
          <button
            data-testid="button-library-log-review"
            onClick={() => setIsLogModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold shadow-lg shadow-primary/25 hover:shadow-xl hover:-translate-y-0.5 transition-all"
          >
            <PenLine size={16} />
            Log Review
          </button>
        </div>
        <div className="flex items-center justify-between gap-2 min-w-0">
          <div className="flex gap-2 overflow-x-auto">
            {filterOptions.map((opt) => (
              <button
                key={opt.value}
                data-testid={`button-filter-${opt.value}`}
                onClick={() => setFilter(opt.value)}
                className={cn(
                  "px-4 py-1.5 rounded-full text-sm font-medium transition-all border",
                  filter === opt.value
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card text-muted-foreground border-border/50 hover:text-foreground hover:border-primary/30",
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="flex gap-1 bg-card border border-border/50 rounded-lg p-0.5 shrink-0">
            <button
              data-testid="button-library-view-standard"
              onClick={() => setView("standard")}
              className={cn(
                "px-2.5 py-1 rounded-md text-xs font-medium transition-all flex items-center gap-1",
                view === "standard" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <LayoutGrid size={12} /> Standard
            </button>
            <button
              data-testid="button-library-view-simple"
              onClick={() => setView("simple")}
              className={cn(
                "px-2.5 py-1 rounded-md text-xs font-medium transition-all flex items-center gap-1",
                view === "simple" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <List size={12} /> Simple
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground mr-1">Rating:</span>
          {[1, 2, 3, 4, 5].map((v) => (
            <button
              key={v}
              data-testid={`button-vibe-filter-${v}`}
              onClick={() => setVibeFilter(vibeFilter === v ? null : v)}
              className={cn(
                "w-8 h-8 rounded-full text-sm font-semibold transition-all border",
                vibeFilter === v
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-muted-foreground border-border/50 hover:text-foreground hover:border-primary/30",
              )}
            >
              {v}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <CalendarClock size={14} className="text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Reviewed before:</span>
          <input
            type="date"
            data-testid="input-date-filter"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="bg-card border border-border/50 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all"
          />
          {dateFilter && (
            <button
              data-testid="button-clear-date-filter"
              onClick={() => setDateFilter("")}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <div className={cn("flex items-center justify-end gap-1.5 text-xs text-muted-foreground mb-3", view === "simple" && "invisible")}>
        <span>Weak</span>
        <div className="flex gap-1">
          <div className="w-3 h-3 rounded-sm bg-primary/20" />
          <div className="w-3 h-3 rounded-sm bg-primary/40" />
          <div className="w-3 h-3 rounded-sm bg-primary/60" />
          <div className="w-3 h-3 rounded-sm bg-primary/80" />
          <div className="w-3 h-3 rounded-sm bg-primary" />
        </div>
        <span>Strong</span>
      </div>

      {view === "standard" ? (
        <div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredSurahs.map((surah) => (
              <Link
                key={surah.id}
                href={`/track/library/${surah.id}`}
                data-testid={`card-surah-${surah.id}`}
                className="bg-card p-4 rounded-2xl border border-border/50 flex items-center justify-between group hover:border-primary/30 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm transition-all border",
                    getHeatmapColor(surah.id),
                  )}>
                    {surah.id}
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">{surah.englishName}</h3>
                    <p className="text-xs text-muted-foreground">{surah.type} • {surah.ayahCount} Ayahs</p>
                  </div>
                </div>
                <span className="font-serif text-lg text-primary text-right" dir="rtl">{surah.name}</span>
              </Link>
            ))}
            {filteredSurahs.length === 0 && (
              <div className="col-span-full text-center py-12 text-muted-foreground">
                No surahs match your search or filter.
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-card p-4 sm:p-6 rounded-3xl border border-border/50">
          {filteredSurahs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              No surahs match your search or filter.
            </div>
          ) : (
            <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12 gap-2">
              {filteredSurahs.map((surah) => (
                <Link
                  key={surah.id}
                  href={`/track/library/${surah.id}`}
                  data-testid={`card-surah-${surah.id}`}
                  title={`${surah.id}. ${surah.englishName} — ${surah.ayahCount} ayahs`}
                  className={cn(
                    "aspect-square rounded-xl flex items-center justify-center text-sm font-semibold border transition-all duration-200 cursor-pointer hover:scale-110",
                    getHeatmapColor(surah.id),
                  )}
                >
                  {surah.id}
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
      </div>
      <LogModal isOpen={isLogModalOpen} onClose={() => setIsLogModalOpen(false)} />
    </AppShell>
  );
}
