import { useState, useMemo } from "react";
import { X, ChevronRight, ChevronLeft, AlertTriangle } from "lucide-react";
import { SURAHS } from "@/lib/quran-data";
import {
  getTotalPagesForAyahRange,
  LINES_PER_PAGE,
  ayahsToPages,
  pagesToAyahs,
  ayahsToLines,
  linesToAyahs,
} from "@/lib/page-utils";
import type { CreateGoalInput } from "@/hooks/useGoals";

interface GoalModalProps {
  open: boolean;
  onClose: () => void;
  onCreate: (input: CreateGoalInput) => Promise<void>;
}

type PaceUnit = "lines" | "pages";

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysUntil(dateStr: string): number {
  const target = new Date(dateStr + "T00:00:00");
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - now.getTime()) / 86400000);
}

function ayahsToUnit(ayahs: number, unit: PaceUnit, totalAyahs: number, totalPages: number): number {
  if (unit === "pages") return ayahsToPages(ayahs, totalAyahs, totalPages);
  return ayahsToLines(ayahs, totalAyahs, totalPages);
}

function unitToAyahs(val: number, unit: PaceUnit, totalAyahs: number, totalPages: number): number {
  if (unit === "pages") return pagesToAyahs(val, totalAyahs, totalPages);
  return linesToAyahs(val, totalAyahs, totalPages);
}

function formatPaceLabel(val: number, unit: PaceUnit): string {
  if (unit === "pages") return `${val} page${val !== 1 ? "s" : ""}/day`;
  return `${val} line${val !== 1 ? "s" : ""}/day`;
}

function clampDailyTarget(target: number, totalAyahs: number, totalPages: number): number {
  const maxPages = Math.min(5, totalPages > 0 ? totalPages : 5);
  const maxAyahs = totalPages > 0 ? Math.round(maxPages * totalAyahs / totalPages) : totalAyahs;
  return Math.max(1, Math.min(maxAyahs, Math.round(target)));
}

export default function GoalModal({ open, onClose, onCreate }: GoalModalProps) {
  const [step, setStep] = useState(1);
  const [surahId, setSurahId] = useState<number | null>(null);
  const [ayahStart, setAyahStart] = useState(1);
  const [ayahEnd, setAyahEnd] = useState(1);
  const [targetDate, setTargetDate] = useState(addDays(30));
  const [dailyTarget, setDailyTarget] = useState(1);
  const [paceUnit, setPaceUnit] = useState<PaceUnit>("pages");
  const [surahQuery, setSurahQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedSurah = SURAHS.find((s) => s.id === surahId);
  const totalAyahs = selectedSurah ? ayahEnd - ayahStart + 1 : 0;
  const totalPages = selectedSurah && surahId
    ? getTotalPagesForAyahRange(surahId, ayahStart, ayahEnd)
    : 1;
  const totalLines = Math.round(totalPages * LINES_PER_PAGE);

  const daysRemaining = daysUntil(targetDate);
  const paceNeeded = daysRemaining > 0 ? Math.ceil(totalAyahs / daysRemaining) : totalAyahs;
  const paceTooSlow = dailyTarget < paceNeeded;

  const sliderStep = paceUnit === "pages" ? 0.5 : 1;
  const sliderMin = paceUnit === "pages"
    ? Math.min(0.5, totalPages)
    : 1;
  const sliderMax = paceUnit === "pages"
    ? Math.min(5, Math.max(sliderMin, totalPages))
    : Math.max(1, Math.min(15, totalLines));
  const rawSliderValue = ayahsToUnit(dailyTarget, paceUnit, totalAyahs, totalPages);
  const sliderValue = Math.max(
    sliderMin,
    Math.min(sliderMax, Math.round(rawSliderValue / sliderStep) * sliderStep)
  );

  const filteredSurahs = useMemo(() => {
    const q = surahQuery.trim().toLowerCase();
    if (!q) return SURAHS;
    return SURAHS.filter(
      (s) =>
        String(s.id).startsWith(q) ||
        s.englishName.toLowerCase().includes(q) ||
        s.name.includes(surahQuery)
    );
  }, [surahQuery]);

  function selectSurah(id: number) {
    const s = SURAHS.find((x) => x.id === id)!;
    setSurahId(id);
    setAyahStart(1);
    setAyahEnd(s.ayahCount);
    const sTotalPages = getTotalPagesForAyahRange(id, 1, s.ayahCount);
    const raw = Math.ceil(s.ayahCount / Math.max(1, daysUntil(targetDate)));
    setDailyTarget(clampDailyTarget(raw, s.ayahCount, sTotalPages));
    setStep(2);
  }

  async function handleCreate() {
    if (!surahId) return;
    setCreating(true);
    setError(null);
    try {
      await onCreate({
        surahNumber: surahId,
        ayahStart,
        ayahEnd,
        targetDate,
        dailyTarget,
      });
      handleClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create goal");
    } finally {
      setCreating(false);
    }
  }

  function handleClose() {
    setStep(1);
    setSurahId(null);
    setAyahStart(1);
    setAyahEnd(1);
    setTargetDate(addDays(30));
    setDailyTarget(1);
    setPaceUnit("pages");
    setSurahQuery("");
    setError(null);
    onClose();
  }

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" onClick={handleClose} />
      <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 bg-card rounded-2xl border border-border shadow-2xl max-w-md mx-auto max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 pt-5 pb-3 flex-shrink-0">
          <div className="flex items-center gap-2">
            {step > 1 && (
              <button onClick={() => setStep(step - 1)} className="p-1 rounded-lg hover:bg-muted text-muted-foreground">
                <ChevronLeft className="w-4 h-4" />
              </button>
            )}
            <h2 className="text-base font-semibold">
              {step === 1 && "Choose Surah"}
              {step === 2 && "Set Ayah Range"}
              {step === 3 && "Set Target"}
            </h2>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex gap-1">
              {[1, 2, 3].map((s) => (
                <div key={s} className={`w-1.5 h-1.5 rounded-full transition-colors ${s <= step ? "bg-primary" : "bg-muted"}`} />
              ))}
            </div>
            <button onClick={handleClose} className="p-1 rounded-lg hover:bg-muted text-muted-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {step === 1 && (
          <div className="flex flex-col flex-1 min-h-0 px-5 pb-5">
            <input
              type="text"
              placeholder="Search surah name or number…"
              value={surahQuery}
              onChange={(e) => setSurahQuery(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-muted text-sm focus:outline-none focus:ring-2 focus:ring-primary mb-3 flex-shrink-0"
              autoFocus
            />
            <div className="overflow-y-auto flex-1 -mx-1 px-1">
              {filteredSurahs.map((s) => (
                <button
                  key={s.id}
                  onClick={() => selectSurah(s.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-muted/60 transition-colors text-left mb-0.5 ${surahId === s.id ? "bg-accent/40" : ""}`}
                >
                  <div className="w-7 h-7 rounded-full border border-border flex items-center justify-center text-xs font-medium text-muted-foreground flex-shrink-0">
                    {s.id}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium leading-tight">{s.englishName}</div>
                    <div className="text-xs text-muted-foreground">{s.ayahCount} ayahs</div>
                  </div>
                  <span className="font-quran text-base text-foreground/70 flex-shrink-0" dir="rtl" lang="ar">
                    {s.name}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 2 && selectedSurah && (
          <div className="px-5 pb-5 space-y-5">
            <div className="p-3 rounded-xl bg-muted/50 text-sm">
              <span className="font-medium">{selectedSurah.englishName}</span>
              <span className="text-muted-foreground ml-1">({selectedSurah.ayahCount} ayahs)</span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1.5">First Ayah</label>
                <input
                  type="number"
                  min={1}
                  max={selectedSurah.ayahCount}
                  value={ayahStart}
                  onChange={(e) => {
                    const v = Math.max(1, Math.min(selectedSurah.ayahCount, parseInt(e.target.value) || 1));
                    setAyahStart(v);
                    if (ayahEnd < v) setAyahEnd(v);
                  }}
                  className="w-full px-3 py-2 rounded-xl bg-muted text-sm focus:outline-none focus:ring-2 focus:ring-primary text-center"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1.5">Last Ayah</label>
                <input
                  type="number"
                  min={ayahStart}
                  max={selectedSurah.ayahCount}
                  value={ayahEnd}
                  onChange={(e) => {
                    const v = Math.max(ayahStart, Math.min(selectedSurah.ayahCount, parseInt(e.target.value) || ayahStart));
                    setAyahEnd(v);
                  }}
                  className="w-full px-3 py-2 rounded-xl bg-muted text-sm focus:outline-none focus:ring-2 focus:ring-primary text-center"
                />
              </div>
            </div>

            <p className="text-xs text-muted-foreground text-center">
              {ayahEnd - ayahStart + 1} ayah{ayahEnd - ayahStart + 1 !== 1 ? "s" : ""} selected
            </p>

            <button
              onClick={() => setStep(3)}
              className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {step === 3 && selectedSurah && (
          <div className="px-5 pb-5 space-y-5">
            <div className="p-3 rounded-xl bg-muted/50 text-sm">
              <span className="font-medium">{selectedSurah.englishName}</span>
              <span className="text-muted-foreground ml-1">
                {ayahStart === 1 && ayahEnd === selectedSurah.ayahCount
                  ? "(full surah)"
                  : `(ayahs ${ayahStart}–${ayahEnd})`}
              </span>
              <span className="text-muted-foreground ml-1">· {totalAyahs} ayahs</span>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1.5">Target Date</label>
              <input
                type="date"
                min={todayStr()}
                value={targetDate}
                onChange={(e) => {
                  setTargetDate(e.target.value);
                  const d = daysUntil(e.target.value);
                  if (d > 0) setDailyTarget(clampDailyTarget(Math.ceil(totalAyahs / d), totalAyahs, totalPages));
                }}
                className="w-full px-3 py-2 rounded-xl bg-muted text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-medium text-muted-foreground">Daily Pace</label>
                <div className="flex items-center gap-2">
                  <div className="flex rounded-lg bg-muted p-0.5 text-xs">
                    {(["lines", "pages"] as PaceUnit[]).map((unit) => (
                      <button
                        key={unit}
                        onClick={() => setPaceUnit(unit)}
                        className={`px-2 py-0.5 rounded-md capitalize transition-colors ${
                          paceUnit === unit
                            ? "bg-background text-foreground shadow-sm font-medium"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {unit}
                      </button>
                    ))}
                  </div>
                  <span className="text-xs tabular-nums text-muted-foreground min-w-[80px] text-right">
                    {formatPaceLabel(sliderValue, paceUnit)}
                  </span>
                </div>
              </div>

              <input
                type="range"
                min={sliderMin}
                max={sliderMax}
                step={sliderStep}
                value={sliderValue}
                onChange={(e) => {
                  const raw = parseFloat(e.target.value);
                  setDailyTarget(unitToAyahs(raw, paceUnit, totalAyahs, totalPages));
                }}
                className="w-full accent-primary cursor-pointer"
              />

              <div className="mt-2 p-2.5 rounded-lg bg-muted/60 text-xs">
                {daysRemaining <= 0 ? (
                  <span className="text-destructive">Target date has already passed</span>
                ) : (
                  <span>
                    At {formatPaceLabel(sliderValue, paceUnit)}{" "}
                    <span className="text-muted-foreground">(~{dailyTarget} ayah{dailyTarget !== 1 ? "s" : ""})</span>{" "}
                    you&apos;ll finish in{" "}
                    <strong>{Math.ceil(totalAyahs / dailyTarget)} day{Math.ceil(totalAyahs / dailyTarget) !== 1 ? "s" : ""}</strong>
                    {" "}(target: {daysRemaining} day{daysRemaining !== 1 ? "s" : ""})
                  </span>
                )}
              </div>

              {paceTooSlow && daysRemaining > 0 && (
                <div className="mt-2 flex items-start gap-2 p-2.5 rounded-lg bg-amber-500/10 text-xs text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                  <span>
                    You need at least {formatPaceLabel(
                      ayahsToUnit(paceNeeded, paceUnit, totalAyahs, totalPages),
                      paceUnit
                    )} to meet your deadline.
                  </span>
                </div>
              )}
            </div>

            {error && <p className="text-xs text-destructive">{error}</p>}

            <button
              onClick={handleCreate}
              disabled={creating || daysRemaining <= 0}
              className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {creating ? "Creating…" : "Create Goal"}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
