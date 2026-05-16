import { useState } from "react";
import { X, AlertTriangle } from "lucide-react";
import { SURAHS } from "@/lib/quran-data";
import {
  getTotalPagesForAyahRange,
  LINES_PER_PAGE,
  ayahsToPages,
  pagesToAyahs,
  ayahsToLines,
  linesToAyahs,
} from "@/lib/page-utils";
import type { Goal } from "@/hooks/useGoals";

interface EditGoalModalProps {
  open: boolean;
  goal: Goal;
  onClose: () => void;
  onSave: (id: number, data: { targetDate: string; dailyTarget: number }) => Promise<void>;
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

export default function EditGoalModal({ open, goal, onClose, onSave }: EditGoalModalProps) {
  const [targetDate, setTargetDate] = useState(goal.targetDate);
  const [dailyTarget, setDailyTarget] = useState(goal.dailyTarget);
  const [paceUnit, setPaceUnit] = useState<PaceUnit>("pages");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const surah = SURAHS.find((s) => s.id === goal.surahNumber);
  const totalAyahs = goal.ayahEnd - goal.ayahStart + 1;
  const totalPages = getTotalPagesForAyahRange(goal.surahNumber, goal.ayahStart, goal.ayahEnd);
  const totalLines = Math.round(totalPages * LINES_PER_PAGE);

  const daysRemaining = daysUntil(targetDate);
  const paceNeeded = daysRemaining > 0 ? Math.ceil(totalAyahs / daysRemaining) : totalAyahs;
  const paceTooSlow = dailyTarget < paceNeeded;

  const sliderStep = paceUnit === "pages" ? 0.25 : 1;
  const sliderMin = paceUnit === "pages" ? Math.min(0.25, totalPages) : 1;
  const sliderMax = paceUnit === "pages"
    ? Math.min(5, Math.max(sliderMin, totalPages))
    : Math.max(1, Math.min(15, totalLines));
  const rawSliderValue = ayahsToUnit(dailyTarget, paceUnit, totalAyahs, totalPages);
  const sliderValue = Math.max(
    sliderMin,
    Math.min(sliderMax, Math.round(rawSliderValue / sliderStep) * sliderStep),
  );

  const isDateValid = !!targetDate && !Number.isNaN(daysRemaining);

  async function handleSave() {
    if (!isDateValid || daysRemaining <= 0) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(goal.id, {
        targetDate,
        dailyTarget: clampDailyTarget(dailyTarget, totalAyahs, totalPages),
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save goal");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 bg-card rounded-2xl border border-border shadow-2xl max-w-md mx-auto flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h2 className="text-base font-semibold">Edit Goal</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-muted text-muted-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 pb-5 space-y-5">
          {/* Goal info (read-only) */}
          <div className="p-3 rounded-xl bg-muted/50 text-sm">
            <span className="font-medium">{surah?.englishName ?? `Surah ${goal.surahNumber}`}</span>
            <span className="text-muted-foreground ml-1">
              {goal.ayahStart === 1 && goal.ayahEnd === surah?.ayahCount
                ? "(full surah)"
                : `(ayahs ${goal.ayahStart}–${goal.ayahEnd})`}
            </span>
            <span className="text-muted-foreground ml-1">· {totalAyahs} ayahs</span>
          </div>

          {/* Target Date */}
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

          {/* Daily Pace */}
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
                const newDailyTarget = unitToAyahs(raw, paceUnit, totalAyahs, totalPages);
                setDailyTarget(newDailyTarget);
                setTargetDate(addDays(Math.ceil(totalAyahs / Math.max(1, newDailyTarget))));
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
                  At this pace you won&apos;t meet your deadline. Need at least{" "}
                  {formatPaceLabel(
                    ayahsToUnit(paceNeeded, paceUnit, totalAyahs, totalPages),
                    paceUnit,
                  )}.
                </span>
              </div>
            )}
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !isDateValid || daysRemaining <= 0}
              className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
