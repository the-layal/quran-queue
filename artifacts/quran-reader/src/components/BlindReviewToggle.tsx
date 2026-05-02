import { useQuranStore, type BlindReviewMode } from "../store/quranStore";

const MODES: { mode: BlindReviewMode; label: string; title: string }[] = [
  { mode: "default",      label: "A", title: "Mode A — all text visible" },
  { mode: "word-by-word", label: "B", title: "Mode B — word-by-word (audio reveals each word)" },
  { mode: "blind",        label: "C", title: "Mode C — blind (all hidden, reveal manually)" },
  { mode: "context-only", label: "D", title: "Mode D — context only (active segment hidden)" },
];

export default function BlindReviewToggle() {
  const blindReviewMode = useQuranStore((s) => s.blindReviewMode);
  const setBlindReviewMode = useQuranStore((s) => s.setBlindReviewMode);

  return (
    <div
      className="flex items-center rounded-lg border border-border overflow-hidden flex-shrink-0"
      role="group"
      aria-label="Visibility mode"
    >
      {MODES.map(({ mode, label, title }) => (
        <button
          key={mode}
          onClick={() => setBlindReviewMode(mode)}
          className={`w-6 h-6 text-xs font-bold transition-colors ${
            blindReviewMode === mode
              ? "bg-primary/15 text-primary"
              : "text-muted-foreground hover:bg-muted"
          }`}
          aria-pressed={blindReviewMode === mode}
          title={title}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
