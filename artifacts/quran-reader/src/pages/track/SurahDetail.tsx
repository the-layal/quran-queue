import { useParams, Link } from "wouter";
import AppShell from "@/components/AppShell";
import GuestBanner from "@/components/GuestBanner";
import { SURAHS } from "@/lib/quran-data";
import { ArrowLeft, BookOpen, Calendar, ChevronDown, LayoutGrid, Star } from "lucide-react";
import { useState, useMemo } from "react";
import { LogModal } from "@/components/LogModal";
import { useSrsItems, useRetireSurah, useUnretireSurah } from "@/hooks/useTracker";
import { getAyahPage } from "@/storage/referenceFanOut";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

type ViewMode = "standard" | "by_date";

export default function SurahDetail() {
  const params = useParams<{ surah?: string }>();
  const surahId = parseInt(params.surah || "1", 10);
  const surah = SURAHS.find((s) => s.id === surahId) || SURAHS[0];

  const [isLogModalOpen, setIsLogModalOpen] = useState(false);
  const [selectedAyah, setSelectedAyah] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("standard");
  const [confirmRetire, setConfirmRetire] = useState(false);
  const [segmentsExpanded, setSegmentsExpanded] = useState(false);
  const { data: srsItems } = useSrsItems();
  const retireMutation = useRetireSurah();
  const unretireMutation = useUnretireSurah();

  const ayahSrsItems = useMemo(() => {
    if (!srsItems) return [];
    return srsItems
      .filter((it) => it.reference.startsWith(`ayah:${surahId}:`))
      .sort((a, b) => {
        const aNum = parseInt(a.reference.split(":")[2], 10);
        const bNum = parseInt(b.reference.split(":")[2], 10);
        return aNum - bNum;
      });
  }, [srsItems, surahId]);

  const surahRef = `surah:${surahId}`;
  const surahSrsItem = srsItems?.find((it) => it.reference === surahRef);
  const isRetired = surahSrsItem?.retired ?? false;
  const isRetiring = retireMutation.isPending || unretireMutation.isPending;

  const { masteryMap, dateMap } = useMemo(() => {
    const mMap: Record<number, number> = {};
    const dMap: Record<number, Date> = {};
    for (const item of ayahSrsItems) {
      const parts = item.reference.split(":");
      const ayahNum = parseInt(parts[2], 10);
      if (isNaN(ayahNum)) continue;
      if (item.lastVibeScale != null) mMap[ayahNum] = item.lastVibeScale;
      if (item.lastReviewedAt) dMap[ayahNum] = new Date(item.lastReviewedAt);
    }
    return { masteryMap: mMap, dateMap: dMap };
  }, [ayahSrsItems]);

  const ayahsByPage = useMemo(() => {
    const pageMap = new Map<number, Array<{ ayahNum: number; item: typeof ayahSrsItems[0] }>>();
    for (const item of ayahSrsItems) {
      const ayahNum = parseInt(item.reference.split(":")[2], 10);
      if (isNaN(ayahNum)) continue;
      const page = getAyahPage(surahId, ayahNum) ?? 0;
      if (!pageMap.has(page)) pageMap.set(page, []);
      pageMap.get(page)!.push({ ayahNum, item });
    }
    return Array.from(pageMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([page, items]) => ({ page, items }));
  }, [ayahSrsItems, surahId]);

  const totalTracked = ayahSrsItems.length;
  const avgReps = totalTracked > 0
    ? Math.round((ayahSrsItems.reduce((s, it) => s + it.repetitions, 0) / totalTracked) * 10) / 10
    : 0;

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

  const handleRetire = () => {
    retireMutation.mutate(surahRef, { onSuccess: () => setConfirmRetire(false) });
  };

  const handleUnretire = () => {
    unretireMutation.mutate(surahRef);
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

        <div className="mt-5 flex items-center justify-center">
          {isRetired ? (
            <div className="flex items-center gap-3 flex-wrap justify-center">
              <div className="flex items-center gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-4 py-2 rounded-full">
                <Star className="w-4 h-4 fill-amber-400 text-amber-400 flex-shrink-0" />
                <span className="text-sm font-semibold text-amber-700 dark:text-amber-300">Perfectly Known — Retired</span>
              </div>
              <button
                onClick={handleUnretire}
                disabled={isRetiring}
                className="text-xs text-muted-foreground hover:text-foreground underline transition-colors"
              >
                {isRetiring ? "Saving..." : "Un-retire"}
              </button>
            </div>
          ) : confirmRetire ? (
            <div className="flex items-center gap-3 text-sm flex-wrap justify-center">
              <span className="text-muted-foreground">Retire this surah from your review queue?</span>
              <button
                onClick={handleRetire}
                disabled={isRetiring}
                className="font-semibold text-amber-600 hover:text-amber-700 transition-colors"
              >
                {isRetiring ? "Retiring..." : "Yes, retire it"}
              </button>
              <button
                onClick={() => setConfirmRetire(false)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmRetire(true)}
              className={cn(
                "flex items-center gap-2 text-sm text-muted-foreground hover:text-amber-600 transition-colors group",
                "border border-border/50 hover:border-amber-300 px-4 py-1.5 rounded-full",
              )}
            >
              <Star className="w-4 h-4 group-hover:fill-amber-400 transition-colors" />
              Retire as Perfectly Known
            </button>
          )}
        </div>
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

      <div className="mt-8">
        <div className="flex flex-wrap items-center gap-4 mb-4">
          <h3 className="font-serif font-bold text-lg text-foreground">Tracked Ayahs</h3>
          {totalTracked > 0 && (
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span>
                <span className="font-semibold text-foreground">{totalTracked}</span>
                {" / "}{surah.ayahCount} tracked
              </span>
              <span>
                avg <span className="font-semibold text-foreground">{avgReps}</span> reps
              </span>
            </div>
          )}
        </div>
        {totalTracked === 0 ? (
          <div className="bg-card p-6 rounded-3xl border border-border/50 text-sm text-muted-foreground text-center">
            No ayahs tracked yet. Log a review to start spaced repetition for this surah.
          </div>
        ) : (
          <div className="bg-card rounded-3xl border border-border/50 overflow-hidden">
            <button
              data-testid="button-toggle-segments"
              onClick={() => setSegmentsExpanded((v) => !v)}
              className="w-full flex items-center justify-between px-5 py-4 text-sm font-medium text-foreground hover:bg-secondary/20 transition-colors"
            >
              <span>
                {segmentsExpanded
                  ? "Hide ayah details"
                  : `${totalTracked} ayah${totalTracked !== 1 ? "s" : ""} tracked`}
              </span>
              <ChevronDown
                size={16}
                className={cn("text-muted-foreground transition-transform duration-200", segmentsExpanded && "rotate-180")}
              />
            </button>
            {segmentsExpanded && (
              <div className="border-t border-border/50">
                {ayahsByPage.map(({ page, items }) => (
                  <div key={page}>
                    <div className="px-5 py-2 bg-secondary/10 border-b border-border/30">
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Page {page}
                      </span>
                    </div>
                    {items.map(({ ayahNum, item }) => (
                      <div
                        key={ayahNum}
                        data-testid={`srs-ayah-${surahId}-${ayahNum}`}
                        className="flex items-center justify-between px-5 py-2.5 text-sm border-b border-border/20 last:border-0"
                      >
                        <span className="text-foreground font-medium">Ayah {ayahNum}</span>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span>
                            {item.lastReviewedAt
                              ? format(new Date(item.lastReviewedAt), "MMM d, yyyy")
                              : "Not reviewed"}
                          </span>
                          <span className="px-2 py-0.5 rounded-md bg-secondary/40 text-foreground font-semibold">
                            {item.repetitions} rep{item.repetitions === 1 ? "" : "s"}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
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
