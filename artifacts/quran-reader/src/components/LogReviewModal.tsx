import { useState } from "react";
import { X, Loader2 } from "lucide-react";

interface LogReviewModalProps {
  onClose: () => void;
  onSuccess: () => void;
  defaultSurah?: number;
}

const QUALITY_OPTIONS = [
  { q: 0, label: "Blackout", desc: "No memory at all" },
  { q: 1, label: "Wrong", desc: "Incorrect, felt familiar" },
  { q: 2, label: "Wrong (easy)", desc: "Incorrect but easy recall" },
  { q: 3, label: "Difficult", desc: "Correct after much effort" },
  { q: 4, label: "Hesitated", desc: "Correct with small hesitation" },
  { q: 5, label: "Perfect", desc: "Perfect recall" },
];

const QUALITY_COLORS: Record<number, string> = {
  0: "border-red-500 bg-red-500 text-white",
  1: "border-red-400 bg-red-400 text-white",
  2: "border-orange-400 bg-orange-400 text-white",
  3: "border-yellow-500 bg-yellow-500 text-white",
  4: "border-emerald-500 bg-emerald-500 text-white",
  5: "border-green-500 bg-green-500 text-white",
};

export default function LogReviewModal({ onClose, onSuccess, defaultSurah }: LogReviewModalProps) {
  const [surah, setSurah] = useState(defaultSurah ?? 1);
  const [ayahStart, setAyahStart] = useState(1);
  const [ayahEnd, setAyahEnd] = useState(1);
  const [quality, setQuality] = useState(4);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (surah < 1 || surah > 114) { setError("Surah must be between 1 and 114"); return; }
    if (ayahStart < 1) { setError("Ayah start must be at least 1"); return; }
    if (ayahEnd < ayahStart) { setError("Ayah end must be ≥ ayah start"); return; }

    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/logs", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ surah, ayahStart, ayahEnd, quality, notes: notes || undefined }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as Record<string, unknown>;
        throw new Error((data.error as string) ?? `HTTP ${res.status}`);
      }
      onSuccess();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 bg-card border border-border rounded-2xl p-5 shadow-2xl max-w-sm mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold">Log a Review</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="mb-3 text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        {/* Surah + Ayah range */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Surah</label>
            <input
              type="number"
              min={1}
              max={114}
              value={surah}
              onChange={(e) => setSurah(Number(e.target.value))}
              className="w-full text-sm bg-muted rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary tabular-nums"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Ayah from</label>
            <input
              type="number"
              min={1}
              value={ayahStart}
              onChange={(e) => {
                const v = Number(e.target.value);
                setAyahStart(v);
                if (v > ayahEnd) setAyahEnd(v);
              }}
              className="w-full text-sm bg-muted rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary tabular-nums"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Ayah to</label>
            <input
              type="number"
              min={ayahStart}
              value={ayahEnd}
              onChange={(e) => setAyahEnd(Number(e.target.value))}
              className="w-full text-sm bg-muted rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary tabular-nums"
            />
          </div>
        </div>

        {/* Quality selector */}
        <div className="mb-4">
          <label className="text-xs font-medium text-muted-foreground block mb-2">
            How well did you recall it?
          </label>
          <div className="grid grid-cols-3 gap-1.5">
            {QUALITY_OPTIONS.map(({ q, label }) => (
              <button
                key={q}
                onClick={() => setQuality(q)}
                className={`px-2 py-2 rounded-xl text-xs font-semibold transition-colors border-2 ${
                  quality === q
                    ? QUALITY_COLORS[q]
                    : "border-border text-muted-foreground hover:bg-muted"
                }`}
              >
                <div className="text-sm font-bold">{q}</div>
                <div className="truncate">{label}</div>
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-1.5">
            {QUALITY_OPTIONS.find((o) => o.q === quality)?.desc}
          </p>
        </div>

        {/* Notes */}
        <div className="mb-5">
          <label className="text-xs font-medium text-muted-foreground block mb-1.5">
            Notes (optional)
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full text-sm bg-muted rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary resize-none"
            placeholder="Any notes about this review…"
          />
        </div>

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {submitting ? "Saving…" : "Save Review"}
          </button>
        </div>
      </div>
    </>
  );
}
