import { useState, useMemo } from "react";
import AppShell from "@/components/AppShell";
import GuestBanner from "@/components/GuestBanner";
import { SURAHS } from "@/lib/quran-data";
import { Search, CalendarClock, PenLine } from "lucide-react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { useLogs } from "@/hooks/useTracker";
import { getAyahsForPages } from "@/lib/page-utils";
import { LogModal } from "@/components/LogModal";

type StatusFilter = "all" | "not_started" | "in_progress" | "completed";

export default function LibraryPage() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [vibeFilter, setVibeFilter] = useState<number | null>(null);
  const [dateFilter, setDateFilter] = useState<string>("");
  const [isLogModalOpen, setIsLogModalOpen] = useState(false);
  const { data: logs } = useLogs();

  const { surahStatus, surahVibes, surahOldestDate } = useMemo(() => {
    const statusMap: Record<number, StatusFilter> = {};
    const vibeMap: Record<number, Set<number>> = {};
    const oldestDateMap: Record<number, Date> = {};
    if (!logs) {
      SURAHS.forEach((s) => { statusMap[s.id] = "not_started"; });
      return { surahStatus: statusMap, surahVibes: vibeMap, surahOldestDate: oldestDateMap };
    }

    const loggedAyahs: Record<number, Set<number>> = {};
    const ayahVibes: Record<string, number> = {};
    const ayahDates: Record<string, Date> = {};

    const sorted = [...logs].reverse();
    for (const log of sorted) {
      const ref = log.reference;
      const logDate = new Date(log.createdAt);

      const processAyah = (sid: number, a: number) => {
        if (!loggedAyahs[sid]) loggedAyahs[sid] = new Set();
        loggedAyahs[sid].add(a);
        ayahVibes[`${sid}:${a}`] = log.vibeScale;
        const key = `${sid}:${a}`;
        if (!ayahDates[key] || logDate > ayahDates[key]) ayahDates[key] = logDate;
      };

      const ayahMatch = ref.match(/^ayah:(\d+):(.+)$/);
      if (ayahMatch) {
        const sid = parseInt(ayahMatch[1], 10);
        const parts = ayahMatch[2].split("-");
        const start = parseInt(parts[0], 10);
        const end = parts.length > 1 ? parseInt(parts[1], 10) : start;
        for (let a = start; a <= end; a++) processAyah(sid, a);
      }

      const surahRangeMatch = ref.match(/^surah:(\d+):(.+)$/);
      if (surahRangeMatch) {
        const sid = parseInt(surahRangeMatch[1], 10);
        const parts = surahRangeMatch[2].split("-");
        const start = parseInt(parts[0], 10);
        const end = parts.length > 1 ? parseInt(parts[1], 10) : start;
        for (let a = start; a <= end; a++) processAyah(sid, a);
      }

      const surahMatch = ref.match(/^surah:(\d+)(?:-(\d+))?$/);
      if (surahMatch) {
        const fromId = parseInt(surahMatch[1], 10);
        const toId = surahMatch[2] ? parseInt(surahMatch[2], 10) : fromId;
        for (let sid = fromId; sid <= toId; sid++) {
          const surah = SURAHS.find((s) => s.id === sid);
          if (surah) for (let a = 1; a <= surah.ayahCount; a++) processAyah(sid, a);
        }
      }

      if (ref.startsWith("page:")) {
        const pagePart = ref.slice(5);
        const pageRangeParts = pagePart.split("-");
        const fromPage = parseInt(pageRangeParts[0], 10);
        const toPage = pageRangeParts.length > 1 ? parseInt(pageRangeParts[1], 10) : fromPage;
        if (!isNaN(fromPage) && !isNaN(toPage)) {
          const pages: number[] = [];
          for (let p = fromPage; p <= toPage; p++) pages.push(p);
          const groups = getAyahsForPages(pages);
          for (const g of groups) for (const a of g.ayahs) processAyah(g.surah, a);
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
      if (logged) {
        Array.from(logged).forEach((a) => {
          const v = ayahVibes[`${s.id}:${a}`];
          if (v) vibes.add(v);
          const d = ayahDates[`${s.id}:${a}`];
          if (d && (!oldest || d < oldest)) oldest = d;
        });
      }
      if (vibes.size > 0) vibeMap[s.id] = vibes;
      if (oldest) oldestDateMap[s.id] = oldest;
    });

    return { surahStatus: statusMap, surahVibes: vibeMap, surahOldestDate: oldestDateMap };
  }, [logs]);

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
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="relative w-full sm:w-64">
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
        <div className="flex gap-2 flex-wrap">
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
                "w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm transition-colors",
                surahStatus[surah.id] === "completed"
                  ? "bg-primary/20 text-primary group-hover:bg-primary group-hover:text-primary-foreground"
                  : surahStatus[surah.id] === "in_progress"
                    ? "bg-accent/15 text-accent group-hover:bg-accent group-hover:text-white"
                    : "bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground",
              )}>
                {surah.id}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-foreground">{surah.englishName}</h3>
                  {statusBadge(surah.id)}
                </div>
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
      <LogModal isOpen={isLogModalOpen} onClose={() => setIsLogModalOpen(false)} />
    </AppShell>
  );
}
