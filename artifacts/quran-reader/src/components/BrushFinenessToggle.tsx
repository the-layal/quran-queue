import { useQuranStore } from "../store/quranStore";
import type { BrushFineness } from "../types/quran";

const TIERS: { value: BrushFineness; label: string; title: string }[] = [
  { value: "word",  label: "Word",  title: "Highlight individual words" },
  { value: "line",  label: "Line",  title: "Highlight the whole visual line" },
  { value: "ayah",  label: "Ayah",  title: "Highlight the complete verse" },
];

export default function BrushFinenessToggle() {
  const brushFineness = useQuranStore((s) => s.brushFineness);
  const setBrushFineness = useQuranStore((s) => s.setBrushFineness);
  const selectedWordIds = useQuranStore((s) => s.selectedWordIds);
  const clearSelection = useQuranStore((s) => s.clearSelection);

  return (
    <div className="flex items-center gap-2">
      {/* Fineness pill toggle */}
      <div className="flex items-center rounded-lg border border-border bg-muted/50 p-0.5 gap-0.5">
        {TIERS.map(({ value, label, title }) => (
          <button
            key={value}
            onClick={() => setBrushFineness(value)}
            title={title}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
              brushFineness === value
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Clear button — only shown when something is selected */}
      {selectedWordIds.length > 0 && (
        <button
          onClick={clearSelection}
          title="Clear selection"
          className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md hover:bg-muted"
        >
          ✕ {selectedWordIds.length}
        </button>
      )}
    </div>
  );
}
