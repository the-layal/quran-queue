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
  showTranslationButton?: boolean;
  showTransliterationButton?: boolean;
  showReadingTranslationButton?: boolean;
}

export default function BrushFinenessToggle({
  hideActions = false,
  compactLabels = false,
  showTranslationButton = false,
  showTransliterationButton = false,
  showReadingTranslationButton = false,
}: Props) {
  const brushFineness    = useQuranStore((s) => s.brushFineness);
  const setBrushFineness = useQuranStore((s) => s.setBrushFineness);
  const selectedWordIds  = useQuranStore((s) => s.selectedWordIds);
  const clearSelection   = useQuranStore((s) => s.clearSelection);
  const confirmSelection = useQuranStore((s) => s.confirmSelection);
  const showMushafTranslation = useQuranStore(
    (s) => s.settings.showMushafTranslation ?? false
  );
  const showTransliteration = useQuranStore(
    (s) => s.settings.showTransliteration ?? false
  );
  const showTranslation = useQuranStore(
    (s) => s.settings.showTranslation ?? false
  );
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

      {/* Reading mode: Translation + Transliteration pill buttons */}
      {(showReadingTranslationButton || (showTransliterationButton && !showTranslationButton)) && (
        <div className="flex items-center rounded-lg border border-border bg-muted/50 p-0.5 gap-0.5">
          {showReadingTranslationButton && (
            <button
              onClick={() => updateSettings({ showTranslation: !showTranslation })}
              title={showTranslation ? "Hide translation" : "Show translation"}
              aria-label="Toggle translation"
              aria-pressed={showTranslation}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                showTranslation
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              En
            </button>
          )}
          {showTransliterationButton && !showTranslationButton && (
            <button
              onClick={() => updateSettings({ showTransliteration: !showTransliteration })}
              title={showTransliteration ? "Hide transliteration" : "Show transliteration"}
              aria-label="Toggle transliteration"
              aria-pressed={showTransliteration}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                showTransliteration
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Tr
            </button>
          )}
        </div>
      )}

      {/* Mushaf mode: Translation hover popover toggle ("Aa") */}
      {showTranslationButton && (
        <div className="flex items-center rounded-lg border border-border bg-muted/50 p-0.5 gap-0.5">
          <button
            onClick={() => updateSettings({ showMushafTranslation: !showMushafTranslation })}
            title={
              showMushafTranslation
                ? "Hide translation popover"
                : "Show translation when hovering a word"
            }
            aria-label="Toggle translation popover"
            aria-pressed={showMushafTranslation}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
              showMushafTranslation
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Aa
          </button>
        </div>
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
