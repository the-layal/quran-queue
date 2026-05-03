import { useState, useEffect } from "react";
import { X, Book } from "lucide-react";
import { useCreateLog, useLogExtraRevision } from "@/hooks/useTracker";
import { VibeScale } from "./ui/VibeScale";
import { cn } from "@/lib/utils";
import { SURAHS } from "@/lib/quran-data";

type LogType = "page" | "ayah_range" | "surah";

interface LogModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialFrom?: string;
  initialTo?: string;
  initialSurahId?: number;
  initialType?: LogType;
  mode?: "log" | "extra";
}

export function LogModal({
  isOpen,
  onClose,
  initialFrom = "",
  initialTo = "",
  initialSurahId,
  initialType = "page",
  mode = "log",
}: LogModalProps) {
  const [type, setType] = useState<LogType>(initialType);
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [surahId, setSurahId] = useState<number>(initialSurahId || 1);
  const [surahFromId, setSurahFromId] = useState<number>(parseInt(initialFrom, 10) || 1);
  const [surahToId, setSurahToId] = useState<number>(parseInt(initialTo, 10) || 0);
  const [vibeScale, setVibeScale] = useState(0);

  const { mutate: createLog, isPending: isLogPending } = useCreateLog();
  const { mutate: logExtra, isPending: isExtraPending } = useLogExtraRevision();
  const isPending = mode === "extra" ? isExtraPending : isLogPending;

  useEffect(() => {
    if (isOpen) {
      setType(initialType);
      setFrom(initialFrom);
      setTo(initialTo);
      setSurahId(initialSurahId || 1);
      setSurahFromId(parseInt(initialFrom, 10) || 1);
      setSurahToId(parseInt(initialTo, 10) || 0);
      setVibeScale(0);
    }
  }, [isOpen, initialType, initialFrom, initialTo, initialSurahId]);

  if (!isOpen) return null;

  const buildReference = (): string => {
    switch (type) {
      case "page": {
        const fromVal = from.trim();
        const toVal = to.trim();
        return toVal && toVal !== fromVal ? `page:${fromVal}-${toVal}` : `page:${fromVal}`;
      }
      case "ayah_range": {
        const fromVal = from.trim();
        const toVal = to.trim();
        return toVal && toVal !== fromVal
          ? `ayah:${surahId}:${fromVal}-${toVal}`
          : `ayah:${surahId}:${fromVal}`;
      }
      case "surah":
        return surahToId && surahToId !== surahFromId ? `surah:${surahFromId}-${surahToId}` : `surah:${surahFromId}`;
      default:
        return from.trim();
    }
  };

  const isValid = () => {
    if (!vibeScale) return false;
    if (type === "surah") {
      if (!surahFromId) return false;
      if (surahToId && surahToId < surahFromId) return false;
      return true;
    }
    if (!from.trim()) return false;
    const fromNum = parseInt(from, 10);
    if (isNaN(fromNum) || fromNum < 1) return false;
    if (to.trim()) {
      const toNum = parseInt(to, 10);
      if (isNaN(toNum) || toNum < fromNum) return false;
    }
    return true;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid()) return;
    const reference = buildReference();
    const payload = { type, reference, vibeScale };
    const opts = {
      onSuccess: () => {
        setVibeScale(0);
        onClose();
      },
    };
    if (mode === "extra") logExtra(payload, opts);
    else createLog(payload, opts);
  };

  const handleTypeChange = (newType: LogType) => {
    setType(newType);
    setFrom("");
    setTo("");
    setSurahFromId(1);
    setSurahToId(0);
  };

  const typeOptions: LogType[] = ["ayah_range", "page", "surah"];
  const typeLabels: Record<LogType, string> = { page: "Page", ayah_range: "Ayah", surah: "Surah" };

  const getFromLabel = () => {
    switch (type) {
      case "page": return "Page";
      case "ayah_range": return "Ayah";
      case "surah": return "Surah";
    }
  };

  const getPlaceholder = () => {
    switch (type) {
      case "page": return "e.g. 45";
      case "ayah_range": return "e.g. 1";
      case "surah": return "e.g. 67";
    }
  };

  const inputClass =
    "w-full px-4 py-3 rounded-xl bg-background border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/20 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-card w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
        <div className="px-6 py-4 border-b border-border/50 flex justify-between items-center bg-primary/5">
          <div className="flex items-center gap-2">
            <Book className="text-primary w-5 h-5" />
            <h3 className="font-serif font-semibold text-lg text-foreground">
              {mode === "extra" ? "Extra Revision" : "Log Revision"}
            </h3>
          </div>
          <button
            onClick={onClose}
            data-testid="button-close-log-modal"
            className="p-2 rounded-full hover:bg-black/5 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="space-y-3">
            <label className="text-sm font-medium text-foreground">What did you revise?</label>
            <div className="flex bg-secondary/50 p-1 rounded-xl">
              {typeOptions.map((t) => (
                <button
                  key={t}
                  type="button"
                  data-testid={`button-type-${t}`}
                  onClick={() => handleTypeChange(t)}
                  className={cn(
                    "flex-1 py-2 text-sm font-medium rounded-lg transition-all",
                    type === t ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {typeLabels[t]}
                </button>
              ))}
            </div>
          </div>

          {type === "ayah_range" && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Surah</label>
              <select
                data-testid="select-surah"
                value={surahId}
                onChange={(e) => setSurahId(parseInt(e.target.value, 10))}
                className={inputClass}
              >
                {SURAHS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.id}. {s.englishName} ({s.name})
                  </option>
                ))}
              </select>
            </div>
          )}

          {type === "surah" ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">From (Surah)</label>
                <select
                  data-testid="select-surah-from"
                  value={surahFromId}
                  onChange={(e) => setSurahFromId(parseInt(e.target.value, 10))}
                  className={inputClass}
                >
                  {SURAHS.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.id}. {s.englishName} ({s.name})
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">To (Surah) — optional</label>
                <select
                  data-testid="select-surah-to"
                  value={surahToId}
                  onChange={(e) => setSurahToId(parseInt(e.target.value, 10))}
                  className={inputClass}
                >
                  <option value={0}>Same as From</option>
                  {SURAHS.filter((s) => s.id >= surahFromId).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.id}. {s.englishName} ({s.name})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex gap-3">
                <div className="flex-1 space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">From ({getFromLabel()})</label>
                  <input
                    type="number"
                    min="1"
                    data-testid="input-from"
                    placeholder={getPlaceholder()}
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                    className={inputClass}
                    required
                  />
                </div>
                <div className="flex-1 space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">To ({getFromLabel()})</label>
                  <input
                    type="number"
                    min="1"
                    data-testid="input-to"
                    placeholder="optional"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Leave "To" empty to log a single {getFromLabel()?.toLowerCase()}
              </p>
            </div>
          )}

          <div className="space-y-3">
            <label className="text-sm font-medium text-foreground">How well did you know it?</label>
            <VibeScale value={vibeScale} onChange={setVibeScale} disabled={isPending} />
          </div>

          <button
            type="submit"
            data-testid="button-save-log"
            disabled={!isValid() || isPending}
            className="w-full py-4 rounded-xl font-bold bg-primary text-primary-foreground shadow-lg shadow-primary/25 hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
          >
            {isPending ? "Logging..." : "Save Progress"}
          </button>
        </form>
      </div>
    </div>
  );
}
