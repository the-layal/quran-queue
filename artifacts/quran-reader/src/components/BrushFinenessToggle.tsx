import { Check, X } from "lucide-react";
import { useQuranStore } from "../store/quranStore";
import type { BrushFineness } from "../types/quran";

const TIERS: { value: BrushFineness; label: string; short: string; title: string }[] = [
  { value: "word", label: "Word", short: "W", title: "Highlight individual words" },
  { value: "line", label: "Line", short: "L", title: "Highlight the whole visual line" },
  { value: "ayah", label: "Ayah", short: "A", title: "Highlight the complete verse" },
];

interface Props {
  hideActions?: boolean;
  compactLabels?: boolean;
  showTransliterationButton?: boolean;
}

export default function BrushFinenessToggle({
  hideActions = false,
  compactLabels = false,
  showTransliterationButton = false,
}: Props) {
  const brushFineness    = useQuranStore((s) => s.brushFineness);
  const setBrushFineness = useQuranStore((s) => s.setBrushFineness);
  const selectedWordIds  = useQuranStore((s) => s.selectedWordIds);
  const clearSelection   = useQuranStore((s) => s.clearSelection);
  const confirmSelection = useQuranStore((s) => s.confirmSelection);
  const showTransliteration = useQuranStore((s) => s.settings.showTransliteration);
  const updateSettings   = useQuranStore((s) => s.updateSettings);

  const hasSelection = selectedWordIds.length > 0;

  return (
    <div className="flex items-center gap-2">
      {/* Fineness pill toggle */}
      <div className="flex items-center rounded-lg border border-border bg-muted/50 p-0.5 gap-0.5">
        {TIERS.map(({ value, label, short, title }) => (
          <button
            key={value}
            onClick={() => setBrushFineness(value)}
            title={title}
            aria-label={title}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
              brushFineness === value
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {compactLabels ? short : label}
          </button>
        ))}
      </div>

      {/* Transliteration "Aa" toggle — mushaf mode only */}
      {showTransliterationButton && (
        <button
          onClick={() => updateSettings({ showTransliteration: !showTransliteration })}
          title={showTransliteration ? "Hide transliteration popover" : "Show transliteration popover (tap a word)"}
          aria-label="Toggle transliteration"
          aria-pressed={showTransliteration}
          className={`flex items-center justify-center w-7 h-7 rounded-lg text-xs font-semibold border transition-colors flex-shrink-0 ${
            showTransliteration
              ? "bg-primary/15 border-primary text-primary"
              : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
        >
          Aa
        </button>
      )}

      {/* X / ✓ action pair — only visible when words are selected and not suppressed */}
      {!hideActions && hasSelection && (
        <div className="flex items-center gap-1">
          <button
            onClick={clearSelection}
            title="Clear selection"
            className="flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={confirmSelection}
            title="Confirm selection"
            className="flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:text-emerald-600 hover:bg-emerald-500/10 transition-colors"
          >
            <Check className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
