import { useParams, Link } from "wouter";
import AppShell from "@/components/AppShell";
import GuestBanner from "@/components/GuestBanner";
import { SURAHS } from "@/lib/quran-data";
import { ArrowLeft, BookOpen, Calendar, LayoutGrid } from "lucide-react";
import { useState, useMemo } from "react";
import { LogModal } from "@/components/LogModal";
import { useLogs } from "@/hooks/useTracker";
import { getAyahsForPages } from "@/lib/page-utils";
import { format } from "date-fns";

type ViewMode = "standard" | "by_date";

export default function SurahDetail() {
  const params = useParams<{ surah?: string }>();
  const surahId = parseInt(params.surah || "1", 10);
  const surah = SURAHS.find((s) => s.id === surahId) || SURAHS[0];

  const [isLogModalOpen, setIsLogModalOpen] = useState(false);
  const [selectedAyah, setSelectedAyah] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("standard");
  const { data: logs } = useLogs();

  const { masteryMap, dateMap } = useMemo(() => {
    const mMap: Record<number, number> = {};
    const dMap: Record<number, Date> = {};
    if (!logs) return { masteryMap: mMap, dateMap: dMap };
    const sorted = [...logs].reverse();
    for (const log of sorted) {
      const ref = log.reference;
      const setAyah = (a: number) => {
        mMap[a] = log.vibeScale;
        const logDate = new Date(log.createdAt);
        if (!dMap[a] || logDate > dMap[a]) dMap[a] = logDate;
      };
      if (ref.startsWith(`ayah:${surahId}:`)) {
        const rangePart = ref.split(":").slice(2).join(":");
        const parts = rangePart.split("-");
        const start = parseInt(parts[0], 10);
        const end = parts.length > 1 ? parseInt(parts[1], 10) : start;
        if (!isNaN(start) && !isNaN(end)) for (let a = start; a <= end; a++) setAyah(a);
      }
      if (ref.startsWith(`surah:${surahId}:`)) {
        const rangePart = ref.split(":").slice(2).join(":");
        const parts = rangePart.split("-");
        const start = parseInt(parts[0], 10);
        const end = parts.length > 1 ? parseInt(parts[1], 10) : start;
        if (!isNaN(start) && !isNaN(end)) for (let a = start; a <= end; a++) setAyah(a);
      }
      if (ref === `surah:${surahId}`) {
        for (let a = 1; a <= surah.ayahCount; a++) setAyah(a);
      }
      const surahRangeMatch = ref.match(/^surah:(\d+)-(\d+)$/);
      if (surahRangeMatch) {
        const fromSurah = parseInt(surahRangeMatch[1], 10);
        const toSurah = parseInt(surahRangeMatch[2], 10);
        if (surahId >= fromSurah && surahId <= toSurah) {
          for (let a = 1; a <= surah.ayahCount; a++) setAyah(a);
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
          for (const g of groups) {
            if (g.surah === surahId) for (const a of g.ayahs) setAyah(a);
          }
        }
      }
    }
    return { masteryMap: mMap, dateMap: dMap };
  }, [logs, surahId, surah.ayahCount]);

  const oldestReviewDate = useMemo(() => {
    const dates = Object.values(dateMap);
    if (dates.length === 0) return null;
    return dates.reduce((oldest, d) => (d < oldest ? d : oldest), dates[0]);
  }, [dateMap]);

  const dateGroups = useMemo(() => {
    if (viewMode !== "by_date") return [];
    const groups: { label: string; sortKey: number; ayahs: number[] }[] = [];
    const neverReviewed: number[] = [];
    const byDate: Record<string, number[]> = {};
    for (let a = 1; a <= surah.ayahCount; a++) {
      const d = dateMap[a];
      if (!d) neverReviewed.push(a);
      else {
        const key = format(d, "yyyy-MM-dd");
        if (!byDate[key]) byDate[key] = [];
        byDate[key].push(a);
      }
    }
    if (neverReviewed.length > 0) groups.push({ label: "Never Reviewed", sortKey: 0, ayahs: neverReviewed });
    const sortedDates = Object.keys(byDate).sort();
    for (const dateStr of sortedDates) {
      groups.push({
        label: format(new Date(dateStr + "T00:00:00"), "MMM d, yyyy"),
        sortKey: new Date(dateStr).getTime(),
        ayahs: byDate[dateStr].sort((a, b) => a - b),
      });
    }
    return groups;
  }, [viewMode, surah.ayahCount, dateMap]);

  const getColorForMastery = (level: number) => {
    switch (level) {
      case 5: return "bg-primary text-primary-foreground border-primary";
      case 4: return "bg-primary/80 text-primary-foreground border-primary/80";
      case 3: return "bg-primary/60 text-primary-foreground border-primary/60";
      case 2: return "bg-primary/40 text-foreground border-primary/40";
      case 1: return "bg-primary/20 text-foreground border-primary/20";
      default: return "bg-secondary/10 text-muted-foreground border-border hover:border-primary/50";
    }
  };

  const getAyahTitle = (ayahNum: number) => {
    const mastery = masteryMap[ayahNum] || 0;
    const date = dateMap[ayahNum];
    const masteryLabel = mastery ? `Vibe: ${mastery}` : "Not reviewed";
    const dateLabel = date ? `Last reviewed: ${format(date, "MMM d, yyyy")}` : "";
    return `Ayah ${ayahNum} — ${masteryLabel}${dateLabel ? ` • ${dateLabel}` : ""}`;
  };

  const handleAyahClick = (ayahNum: number) => {
    setSelectedAyah(ayahNum);
    setIsLogModalOpen(true);
  };

  const renderAyahButton = (ayahNum: number) => {
    const mastery = masteryMap[ayahNum] || 0;
    return (
      <button
        key={ayahNum}
        data-testid={`button-ayah-${ayahNum}`}
        onClick={() => handleAyahClick(ayahNum)}
        className={`aspect-square rounded-xl flex items-center justify-center text-sm font-medium transition-all duration-200 border cursor-pointer hover:scale-110 ${getColorForMastery(mastery)}`}
        title={getAyahTitle(ayahNum)}
      >
        {ayahNum}
      </button>
    );
  };

  return (
    <AppShell>
      <GuestBanner />
      <div className="p-4 md:px-10 w-full">
      <div className="mb-6 flex justify-between items-center">
        <Link href="/track/library" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors p-2 -ml-2 rounded-lg hover:bg-secondary/50">
          <ArrowLeft size={18} />
          <span className="font-medium text-sm">Back to Library</span>
        </Link>
        <button
          onClick={() => { setSelectedAyah(null); setIsLogModalOpen(true); }}
          className="bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-semibold hover:-translate-y-0.5 transition-all flex items-center gap-2"
        >
          <BookOpen size={16} /> Log Entire Surah
        </button>
      </div>

      <div className="bg-card rounded-3xl p-6 md:p-8 border border-border/50 mb-8 text-center relative overflow-hidden">
        <div className="absolute inset-0 bg-primary/5 pointer-events-none opacity-50" />
        <h1 className="text-4xl md:text-5xl font-serif text-primary mb-2" dir="rtl">{surah.name}</h1>
        <h2 className="text-xl text-foreground font-medium mb-1">{surah.englishName}</h2>
        <p className="text-muted-foreground text-sm uppercase tracking-widest">{surah.type} • {surah.ayahCount} Ayahs</p>
        {oldestReviewDate && (<p className="text-muted-foreground text-xs mt-1">Oldest review: {format(oldestReviewDate, "MMM d, yyyy")}</p>)}
      </div>

      <div>
        <div className="flex flex-wrap justify-between items-center mb-4 gap-x-4 gap-y-2">
          <div className="flex items-center gap-3 min-w-0">
            <h3 className="font-serif font-bold text-lg text-foreground shrink-0">Ayah Heatmap</h3>
            <div className="flex gap-1 bg-card border border-border/50 rounded-lg p-0.5 shrink-0">
              <button
                data-testid="button-view-standard"
                onClick={() => setViewMode("standard")}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all flex items-center gap-1 ${viewMode === "standard" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                <LayoutGrid size={12} /> Standard
              </button>
              <button
                data-testid="button-view-by-date"
                onClick={() => setViewMode("by_date")}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all flex items-center gap-1 ${viewMode === "by_date" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                <Calendar size={12} /> By Date
              </button>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
            <span>Weak</span>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((l) => (<div key={l} className={`w-3 h-3 rounded-sm ${getColorForMastery(l)} border-none`} />))}
            </div>
            <span>Strong</span>
          </div>
        </div>

        {viewMode === "standard" ? (
          <div className="bg-card p-6 rounded-3xl border border-border/50">
            <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12 gap-2">
              {Array.from({ length: surah.ayahCount }, (_, i) => renderAyahButton(i + 1))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {dateGroups.map((group) => (
              <div key={group.label} className="bg-card p-5 rounded-3xl border border-border/50">
                <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  {group.label}
                  <span className="ml-2 text-xs font-normal normal-case tracking-normal">
                    ({group.ayahs.length} ayah{group.ayahs.length !== 1 ? "s" : ""})
                  </span>
                </h4>
                <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12 gap-2">
                  {group.ayahs.map((ayahNum) => renderAyahButton(ayahNum))}
                </div>
              </div>
            ))}
            {dateGroups.length === 0 && (
              <div className="text-center py-12 text-muted-foreground bg-card rounded-3xl border border-border/50">
                No ayahs have been reviewed yet.
              </div>
            )}
          </div>
        )}
      </div>

      <LogModal
        isOpen={isLogModalOpen}
        onClose={() => setIsLogModalOpen(false)}
        initialType={selectedAyah ? "ayah_range" : "surah"}
        initialFrom={selectedAyah ? String(selectedAyah) : String(surah.id)}
        initialSurahId={surah.id}
      />
      </div>
    </AppShell>
  );
}
