import { useState, useMemo, useEffect, useCallback } from "react";
import AppShell from "@/components/AppShell";
import GuestBanner from "@/components/GuestBanner";
import { useTrackerStorage } from "@/context/useTrackerStorage";
import type { DailyPlan, CompleteAdvancedInput, SrsItem } from "@/storage/trackerStorage";
import { LogModal } from "@/components/LogModal";
import { AdvancedVibeGrid } from "@/components/AdvancedVibeGrid";
import { BrainCircuit, Settings2, CheckCircle2, ListTodo, ChevronLeft, ChevronRight, Circle, Play, BookOpen, Layers, X, Trash2, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { VibeScale } from "@/components/ui/VibeScale";
import { getPageCountForReference, getSurahNamesForPageRange, getSurahName } from "@/lib/page-utils";
import PriorKnowledgeSetup from "@/components/PriorKnowledgeSetup";
import { isOnboardingComplete, markOnboardingComplete } from "@/storage/localTrackerStorage";

function parseReference(ref: string) {
  const parts = ref.split(":");
  const refType = parts[0] || "page";
  if (refType === "ayah" || refType === "ayah_range") {
    const surahIdVal = parseInt(parts[1] || "1", 10);
    const rangePart = parts[2] || "";
    const rangeParts = rangePart.split("-");
    return {
      initialType: "ayah_range" as const,
      initialSurahId: surahIdVal,
      initialFrom: rangeParts[0] || "",
      initialTo: rangeParts[1] || "",
    };
  }
  const val = parts[1] || "";
  const rangeParts = val.split("-");
  return {
    initialType: refType as "page" | "surah",
    initialFrom: rangeParts[0] || "",
    initialTo: rangeParts[1] || "",
  };
}

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
  if (type === "surah") {
    const surahVal = parts[1] || "";
    const surahRangeParts = surahVal.split("-");
    const fromSurah = parseInt(surahRangeParts[0], 10);
    const toSurah = surahRangeParts.length > 1 ? parseInt(surahRangeParts[1], 10) : fromSurah;
    const fromName = getSurahName(fromSurah);
    if (fromSurah === toSurah) {
      return `Surah ${fromSurah} — ${fromName.en}`;
    }
    const toName = getSurahName(toSurah);
    return `Surah ${fromSurah}–${toSurah} — ${fromName.en} to ${toName.en}`;
  }
  if (type === "ayah" || type === "ayah_range") {
    const surahNum = parseInt(parts[1] || "0", 10);
    const name = getSurahName(surahNum);
    const rangePart = parts[2] || "";
    const rangeParts = rangePart.split("-");
    const from = rangeParts[0] || "";
    const to = rangeParts.length > 1 ? rangeParts[1] : "";
    const ayahRange = to ? `${from}–${to}` : from;
    return `${name.en} ${surahNum}:${ayahRange}`;
  }
  return ref;
}

function formatPageCount(pages: number): string {
  const rounded = Math.round(pages * 10) / 10;
  return `${rounded} pg`;
}

function getTotalPages(refs: string[]): number {
  let total = 0;
  for (const ref of refs) total += getPageCountForReference(ref);
  return total;
}

function PlanCalendar({ plans }: { plans: DailyPlan[] }) {
  const [currentMonth, setCurrentMonth] = useState(() => new Date());
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthName = currentMonth.toLocaleString("default", { month: "long", year: "numeric" });

  const plansByDate = useMemo(() => {
    const map: Record<string, DailyPlan> = {};
    for (const p of plans) map[p.date] = p;
    return map;
  }, [plans]);

  const prevMonth = () => setCurrentMonth(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentMonth(new Date(year, month + 1, 1));
  const todayStr = new Date().toISOString().split("T")[0];

  return (
    <div className="bg-card rounded-3xl p-6 border border-border/50">
      <div className="flex justify-between items-center mb-5">
        <button onClick={prevMonth} className="p-2 rounded-lg hover:bg-secondary/50 text-muted-foreground hover:text-foreground transition-colors">
          <ChevronLeft size={18} />
        </button>
        <h3 className="font-serif font-bold text-foreground">{monthName}</h3>
        <button onClick={nextMonth} className="p-2 rounded-lg hover:bg-secondary/50 text-muted-foreground hover:text-foreground transition-colors">
          <ChevronRight size={18} />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center mb-2">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider py-1">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: firstDay }, (_, i) => (<div key={`empty-${i}`} />))}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const day = i + 1;
          const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const plan = plansByDate[dateStr];
          const isToday = dateStr === todayStr;
          const totalItems = plan?.plannedItems?.length || 0;
          const completedCount = plan?.completedItems?.length || 0;
          const allDone = totalItems > 0 && completedCount >= totalItems;
          const partial = completedCount > 0 && !allDone;

          return (
            <div
              key={day}
              data-testid={`calendar-day-${dateStr}`}
              className={cn(
                "aspect-square rounded-lg flex flex-col items-center justify-center text-xs relative transition-all",
                isToday && "ring-2 ring-primary/40",
                allDone && "bg-primary/15 text-primary font-bold",
                partial && "bg-accent/10 text-accent font-medium",
                !plan && "text-muted-foreground",
              )}
            >
              <span>{day}</span>
              {plan && (
                <div className="flex gap-0.5 mt-0.5">
                  {allDone ? <CheckCircle2 size={8} className="text-primary" /> :
                   partial ? <Circle size={8} className="text-accent fill-accent/30" /> :
                   totalItems > 0 ? <Circle size={8} className="text-muted-foreground" /> : null}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function DailyPlanPage() {
  const { storage } = useTrackerStorage();

  const [plan, setPlan] = useState<DailyPlan | null>(null);
  const [allPlans, setAllPlans] = useState<DailyPlan[]>([]);
  const [srsItems, setSrsItems] = useState<SrsItem[]>([]);
  const [isLoadingPlan, setIsLoadingPlan] = useState(true);
  const [pending, setPending] = useState<null | "create" | "complete" | "complete-adv" | "add" | "clear" | "perfectly-known" | "retire">(null);

  const [bandwidth, setBandwidth] = useState(5);
  const [isConfiguring, setIsConfiguring] = useState(false);
  const [logModalOpen, setLogModalOpen] = useState(false);
  const [extraModalOpen, setExtraModalOpen] = useState(false);
  const [selectedReference, setSelectedReference] = useState<string>("");
  const [inlineVibeRef, setInlineVibeRef] = useState<string | null>(null);
  const [inlineVibe, setInlineVibe] = useState(0);
  const [advancedMode, setAdvancedMode] = useState<string | null>(null);

  // null = still checking, true = show onboarding, false = skip
  const [onboardingNeeded, setOnboardingNeeded] = useState<boolean | null>(null);

  useEffect(() => {
    if (isOnboardingComplete()) { setOnboardingNeeded(false); return; }
    storage.isEmpty().then((empty) => setOnboardingNeeded(empty));
  }, [storage]);

  const handleOnboardingComplete = async (selections: Array<{ reference: string; vibe: number }>) => {
    if (selections.length > 0) await storage.seedPriorKnowledge(selections);
    markOnboardingComplete();
    setOnboardingNeeded(false);
    await reload();
  };

  const handleOnboardingSkip = () => {
    markOnboardingComplete();
    setOnboardingNeeded(false);
  };

  const reload = useCallback(async () => {
    const [p, all, srs] = await Promise.all([storage.getTodayPlan(), storage.getAllPlans(), storage.getSrsItems()]);
    setPlan(p);
    setAllPlans(all);
    setSrsItems(srs);
    setIsLoadingPlan(false);
  }, [storage]);

  useEffect(() => { reload(); }, [reload]);

  const handleCreatePlan = async () => {
    setPending("create");
    try {
      await storage.createOrUpdatePlan({ bandwidth });
      setIsConfiguring(false);
      await reload();
    } finally {
      setPending(null);
    }
  };

  const handleItemClick = (reference: string) => {
    setInlineVibeRef(reference);
    setInlineVibe(0);
    setAdvancedMode(null);
  };

  const handleVibeSubmit = async (reference: string, vibe: number) => {
    setPending("complete");
    try {
      await storage.markPlanCompleted({ reference, vibeScale: vibe });
      setInlineVibeRef(null);
      setInlineVibe(0);
      await reload();
    } finally {
      setPending(null);
    }
  };

  const handleAdvancedSubmit = async (reference: string, ayahVibes: CompleteAdvancedInput["ayahVibes"]) => {
    setPending("complete-adv");
    try {
      await storage.markPlanCompletedAdvanced({ reference, ayahVibes });
      setInlineVibeRef(null);
      setAdvancedMode(null);
      await reload();
    } finally {
      setPending(null);
    }
  };

  const handleAddMore = async () => {
    setPending("add");
    try {
      await storage.addMoreItems({ count: 1 });
      await reload();
    } finally {
      setPending(null);
    }
  };

  const handleRemoveItem = async (reference: string) => {
    await storage.removePlanItem({ reference });
    await reload();
  };

  const handleClearPlan = async () => {
    setPending("clear");
    try {
      await storage.clearPlan();
      await reload();
    } finally {
      setPending(null);
    }
  };

  const handleOpenFullLogger = (reference: string) => {
    setSelectedReference(reference);
    setLogModalOpen(true);
  };

  const handleAddPerfectlyKnown = async () => {
    setPending("perfectly-known");
    try {
      await storage.addPerfectlyKnownToSession();
      await reload();
    } finally {
      setPending(null);
    }
  };

  const handleRetireSurah = async (reference: string) => {
    setPending("retire");
    try {
      await storage.retireSurah(reference);
      setInlineVibeRef(null);
      await reload();
    } finally {
      setPending(null);
    }
  };

  const handleUnretireSurah = async (reference: string) => {
    setPending("retire");
    try {
      await storage.unretireSurah(reference);
      await reload();
    } finally {
      setPending(null);
    }
  };

  if (isLoadingPlan || onboardingNeeded === null) {
    return (
      <AppShell>
        <div className="p-4 max-w-6xl mx-auto">
          <div className="animate-pulse"><div className="h-2 bg-secondary rounded" /></div>
        </div>
      </AppShell>
    );
  }

  if (onboardingNeeded) {
    return (
      <AppShell>
        <GuestBanner />
        <PriorKnowledgeSetup
          onComplete={handleOnboardingComplete}
          onSkip={handleOnboardingSkip}
        />
      </AppShell>
    );
  }

  const showConfig = isConfiguring || !plan;
  const plannedItems = plan?.plannedItems || [];
  const completedItems = plan?.completedItems || [];
  const totalPlanPages = getTotalPages(plannedItems);
  const completedPages = getTotalPages(completedItems);
  const hasUncompleted = plannedItems.some((r) => !completedItems.includes(r));

  const isMarking = pending === "complete";
  const isMarkingAdvanced = pending === "complete-adv";
  const isAddingMore = pending === "add";
  const isClearing = pending === "clear";
  const isUpdatingPlan = pending === "create";
  const isAddingPerfectlyKnown = pending === "perfectly-known";

  const retiredItems = srsItems.filter((s) => s.retired);
  const retiredNotInPlan = retiredItems.filter((s) => !plannedItems.includes(s.reference));

  return (
    <AppShell>
      <GuestBanner />
      <div className="p-4 max-w-6xl mx-auto">
      {showConfig ? (
        <div className="max-w-xl mx-auto mt-10">
          <div className="bg-card rounded-3xl p-8 border border-border/50 text-center">
            <div className="w-20 h-20 bg-primary/10 text-primary rounded-full flex items-center justify-center mx-auto mb-6">
              <BrainCircuit size={40} />
            </div>
            <h2 className="text-3xl font-serif text-foreground font-semibold mb-4">Dynamic Shuffler</h2>
            <p className="text-muted-foreground mb-8">
              Set your daily page bandwidth. We'll prioritize weak items and schedule reviews based on spaced repetition.
            </p>

            <div className="mb-8 text-left">
              <label className="block text-sm font-medium text-foreground mb-4 text-center">How many pages can you review today?</label>
              <div className="flex items-center justify-center gap-6">
                <button onClick={() => setBandwidth(Math.max(1, bandwidth - 1))} className="w-12 h-12 rounded-full border border-border flex items-center justify-center text-xl hover:bg-secondary/50" data-testid="button-bandwidth-minus">-</button>
                <div className="text-center" data-testid="text-bandwidth">
                  <input
                    type="number" min="1" max="604" value={bandwidth}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      if (!isNaN(val) && val >= 1 && val <= 604) setBandwidth(val);
                      else if (e.target.value === "") setBandwidth(1);
                    }}
                    data-testid="input-bandwidth"
                    className="text-5xl font-serif font-bold text-primary w-24 text-center bg-transparent border-b-2 border-primary/30 focus:border-primary focus:outline-none"
                  />
                  <div className="text-xs text-muted-foreground mt-1 uppercase tracking-wider font-medium">pages</div>
                </div>
                <button onClick={() => setBandwidth(Math.min(604, bandwidth + 1))} className="w-12 h-12 rounded-full border border-border flex items-center justify-center text-xl hover:bg-secondary/50" data-testid="button-bandwidth-plus">+</button>
              </div>
            </div>

            <button onClick={handleCreatePlan} disabled={isUpdatingPlan} data-testid="button-generate-plan" className="w-full py-4 rounded-xl font-bold bg-primary text-primary-foreground shadow-lg shadow-primary/25 hover:shadow-xl hover:-translate-y-0.5 transition-all">
              {isUpdatingPlan ? "Generating Plan..." : "Generate Today's Plan"}
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <div className="flex justify-between items-end mb-6">
              <div>
                <h2 className="text-2xl font-serif text-foreground font-semibold flex items-center gap-2">
                  <ListTodo className="text-primary" /> Today's Plan
                </h2>
                <p className="text-muted-foreground text-sm mt-1" data-testid="text-plan-summary">
                  {completedItems.length}/{plannedItems.length} items ({formatPageCount(completedPages)}/{formatPageCount(totalPlanPages)}) completed
                </p>
              </div>
              <div className="flex items-center gap-2">
                {hasUncompleted && (
                  <button onClick={handleClearPlan} disabled={isClearing} data-testid="button-clear-plan" className="text-muted-foreground hover:text-destructive flex items-center gap-1.5 text-sm bg-secondary/50 px-3 py-1.5 rounded-lg transition-colors">
                    <Trash2 size={14} /> {isClearing ? "Clearing..." : "Clear"}
                  </button>
                )}
                <button onClick={() => setIsConfiguring(true)} data-testid="button-reconfigure" className="text-muted-foreground hover:text-foreground flex items-center gap-2 text-sm bg-secondary/50 px-3 py-1.5 rounded-lg transition-colors">
                  <Settings2 size={16} /> Reconfigure
                </button>
              </div>
            </div>

            <div className="space-y-3">
              {plannedItems.map((ref, idx) => {
                const isCompleted = completedItems.includes(ref);
                const isFirst = !isCompleted && !plannedItems.slice(0, idx).some((r) => !completedItems.includes(r));
                const isExpanded = inlineVibeRef === ref;
                const pageCount = getPageCountForReference(ref);
                const isInlineSurah = /^surah:\d+$/.test(ref);
                const refSrsItem = isInlineSurah ? srsItems.find((s) => s.reference === ref) : undefined;
                const isRefRetired = refSrsItem?.retired ?? false;

                return (
                  <div key={`${ref}-${idx}`} data-testid={`plan-item-${idx}`}>
                    <div
                      onClick={() => !isCompleted && handleItemClick(ref)}
                      className={cn(
                        "bg-card rounded-2xl p-5 border transition-all group",
                        isCompleted ? "opacity-60 border-border/50" : "border-border hover:border-primary/50 cursor-pointer hover:-translate-y-0.5",
                        isFirst && !isCompleted && "border-primary/30 ring-1 ring-primary/20",
                      )}
                    >
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-4">
                          <div className={cn(
                            "w-12 h-12 rounded-xl flex items-center justify-center transition-colors",
                            isCompleted ? "bg-primary/15 text-primary" :
                            isFirst ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary group-hover:bg-primary/20",
                          )}>
                            {isCompleted ? <CheckCircle2 size={24} /> : <Play size={20} className={isFirst ? "ml-0.5" : ""} />}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className={cn("font-semibold text-lg", isCompleted ? "text-muted-foreground line-through" : "text-foreground")}>
                                {formatReference(ref)}
                              </h3>
                              {isRefRetired && !isCompleted && (
                                <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400 flex-shrink-0" aria-label="Perfectly Known" />
                              )}
                              {isFirst && !isCompleted && (
                                <span className="text-[10px] uppercase tracking-wider font-bold bg-accent text-accent-foreground px-2 py-0.5 rounded-full">Up Next</span>
                              )}
                              {isCompleted && (
                                <span className="text-[10px] uppercase tracking-wider font-bold bg-primary/10 text-primary px-2 py-0.5 rounded-full">Done</span>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground mt-0.5">{formatPageCount(pageCount)}</p>
                          </div>
                        </div>

                        {!isCompleted && (
                          <div className="flex items-center gap-2">
                            <span className="hidden sm:block text-sm font-medium text-primary bg-primary/5 px-4 py-2 rounded-lg group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                              Review & Rate
                            </span>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleRemoveItem(ref); }}
                              data-testid={`button-remove-item-${idx}`}
                              className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                              title="Remove from plan"
                            >
                              <X size={16} />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {isExpanded && !isCompleted && (
                      <div className="mt-2 bg-card rounded-2xl p-5 border border-primary/20 animate-in slide-in-from-top-2 duration-200">
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-sm font-medium text-foreground">How well did you know <strong>{formatReference(ref)}</strong>?</p>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={(e) => { e.stopPropagation(); setAdvancedMode(advancedMode === ref ? null : ref); }}
                              data-testid="button-toggle-advanced"
                              className={cn(
                                "text-xs flex items-center gap-1 px-2 py-1 rounded-lg transition-colors",
                                advancedMode === ref
                                  ? "bg-primary/10 text-primary font-semibold"
                                  : "text-muted-foreground hover:text-foreground hover:bg-secondary/50",
                              )}
                            >
                              <Layers size={12} />
                              {advancedMode === ref ? "Simple" : "Advanced"}
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleOpenFullLogger(ref); }}
                              className="text-xs text-primary hover:underline"
                              data-testid="button-open-full-logger"
                            >
                              Open full logger
                            </button>
                          </div>
                        </div>

                        {advancedMode === ref ? (
                          <AdvancedVibeGrid reference={ref} onSubmit={(v) => handleAdvancedSubmit(ref, v)} isPending={isMarkingAdvanced} />
                        ) : (
                          <>
                            <VibeScale
                              value={inlineVibe}
                              onChange={setInlineVibe}
                              disabled={isMarking || pending === "retire"}
                              onRetire={isInlineSurah && !isRefRetired ? () => handleRetireSurah(ref) : undefined}
                              onUnretire={isInlineSurah && isRefRetired ? () => handleUnretireSurah(ref) : undefined}
                              isRetired={isRefRetired}
                            />
                            <button
                              onClick={(e) => { e.stopPropagation(); if (inlineVibe > 0) handleVibeSubmit(ref, inlineVibe); }}
                              disabled={inlineVibe === 0 || isMarking}
                              data-testid="button-submit-vibe"
                              className="mt-4 w-full py-3 rounded-xl font-bold bg-primary text-primary-foreground hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                            >
                              {isMarking ? "Saving..." : "Mark Complete"}
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {plannedItems.length === 0 && (
                <div className="bg-card rounded-2xl p-12 text-center border border-border/50">
                  <CheckCircle2 size={48} className="mx-auto text-primary mb-4" />
                  <h3 className="text-xl font-serif text-foreground font-semibold">No tasks generated</h3>
                  <p className="text-muted-foreground mt-2">Try increasing your bandwidth or adding some memorization logs first.</p>
                </div>
              )}

              {plannedItems.length > 0 && completedItems.length >= plannedItems.length && (
                <div className="bg-card rounded-2xl p-8 text-center border border-primary/20">
                  <CheckCircle2 size={48} className="mx-auto text-primary mb-4" />
                  <h3 className="text-xl font-serif text-foreground font-semibold">All Done for Today!</h3>
                  <p className="text-muted-foreground mt-2">MashaAllah, you've completed your daily plan.</p>
                </div>
              )}

              <div className="flex gap-3">
                <button onClick={handleAddMore} disabled={isAddingMore} data-testid="button-add-more" className="flex-1 py-4 rounded-2xl border-2 border-dashed border-border hover:border-primary/40 text-muted-foreground hover:text-primary font-medium transition-all hover:bg-primary/5">
                  {isAddingMore ? "Adding..." : "+ Add 1 Page"}
                </button>
                <button onClick={() => setExtraModalOpen(true)} data-testid="button-extra-revision" className="flex-1 py-4 rounded-2xl border-2 border-dashed border-border hover:border-accent/40 text-muted-foreground hover:text-accent font-medium transition-all hover:bg-accent/5 flex items-center justify-center gap-2">
                  <BookOpen size={16} /> Extra Revision
                </button>
              </div>

              {retiredItems.length > 0 && (
                <button
                  onClick={handleAddPerfectlyKnown}
                  disabled={isAddingPerfectlyKnown}
                  data-testid="button-perfectly-known"
                  className="w-full py-4 rounded-2xl border-2 border-dashed border-amber-300/50 hover:border-amber-400 text-muted-foreground hover:text-amber-600 font-medium transition-all hover:bg-amber-50 dark:hover:bg-amber-900/10 flex items-center justify-center gap-2"
                >
                  <Star className="w-4 h-4 fill-amber-400 text-amber-400 flex-shrink-0" />
                  {isAddingPerfectlyKnown
                    ? "Adding..."
                    : `Review ${retiredNotInPlan.length} Perfectly Known Surah${retiredNotInPlan.length !== 1 ? "s" : ""}`}
                </button>
              )}
            </div>
          </div>

          <div>
            <PlanCalendar plans={allPlans} />
          </div>
        </div>
      )}

      <LogModal isOpen={logModalOpen} onClose={() => { setLogModalOpen(false); reload(); }} {...parseReference(selectedReference)} />
      <LogModal isOpen={extraModalOpen} onClose={() => { setExtraModalOpen(false); reload(); }} mode="extra" />
      </div>
    </AppShell>
  );
}
