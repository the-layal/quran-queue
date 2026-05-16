import { useState } from "react";
import { cn } from "@/lib/utils";
import { Star } from "lucide-react";

interface VibeScaleProps {
  value?: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  onRetire?: () => void;
  onUnretire?: () => void;
  isRetired?: boolean;
}

const VIBE_LABELS = ["Forgetful", "Needs Work", "Familiar", "Solid", "Mastered"];

export function VibeScale({ value, onChange, disabled, onRetire, onUnretire, isRetired }: VibeScaleProps) {
  const [hovered, setHovered] = useState<number | null>(null);
  const [confirmingRetire, setConfirmingRetire] = useState(false);

  return (
    <div className="w-full">
      <div className="flex justify-between items-end mb-2 px-1">
        <span className="text-xs font-medium text-muted-foreground">Struggling</span>
        <span className="text-xs font-medium text-primary">Mastered</span>
      </div>

      <div className="flex justify-between gap-2">
        {[1, 2, 3, 4, 5].map((level) => {
          const isActive = value && value >= level;
          const isHovered = hovered && hovered >= level;
          const isFilled = isHovered || (!hovered && isActive);

          return (
            <button
              key={level}
              type="button"
              disabled={disabled}
              onMouseEnter={() => !disabled && setHovered(level)}
              onMouseLeave={() => !disabled && setHovered(null)}
              onClick={() => onChange(level)}
              className={cn(
                "relative flex-1 h-12 rounded-xl transition-all duration-300 border-2 overflow-hidden group",
                disabled && "opacity-50 cursor-not-allowed",
                !disabled && "hover:border-primary/50",
                isFilled ? "border-primary bg-primary/10" : "border-border bg-card",
              )}
            >
              <div
                className={cn(
                  "absolute inset-0 bg-primary transition-transform duration-300 origin-bottom",
                  isFilled ? "scale-y-100" : "scale-y-0",
                )}
                style={{ opacity: 0.1 + level * 0.15 }}
              />
              <span
                className={cn(
                  "absolute inset-0 flex items-center justify-center font-bold text-lg z-10 transition-colors duration-200",
                  isFilled ? "text-primary" : "text-muted-foreground",
                )}
              >
                {level}
              </span>
            </button>
          );
        })}
      </div>

      <div className="h-4 mt-2 text-center">
        <p className="text-xs text-muted-foreground font-medium animate-in fade-in zoom-in duration-200">
          {hovered || value ? VIBE_LABELS[(hovered || value || 1) - 1] : "Select your retention level"}
        </p>
      </div>

      {(onRetire || isRetired) && (
        <div className="mt-3 flex items-center justify-end min-h-[24px]">
          {isRetired ? (
            <div className="flex items-center gap-2">
              <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400 flex-shrink-0" />
              <span className="text-xs font-medium text-amber-600 dark:text-amber-400">Perfectly Known</span>
              {onUnretire && (
                <button
                  type="button"
                  onClick={onUnretire}
                  className="text-xs text-muted-foreground hover:text-foreground underline transition-colors ml-1"
                >
                  Un-retire
                </button>
              )}
            </div>
          ) : confirmingRetire ? (
            <div className="flex items-center gap-2 animate-in fade-in duration-150">
              <span className="text-xs text-muted-foreground">Won't appear in your review queue.</span>
              <button
                type="button"
                onClick={() => { onRetire?.(); setConfirmingRetire(false); }}
                className="text-xs font-semibold text-amber-600 hover:text-amber-700 transition-colors"
              >
                Retire
              </button>
              <button
                type="button"
                onClick={() => setConfirmingRetire(false)}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingRetire(true)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-amber-600 transition-colors group"
            >
              <Star className="w-3.5 h-3.5 group-hover:fill-amber-400 transition-colors" />
              Retire as Perfectly Known
            </button>
          )}
        </div>
      )}
    </div>
  );
}
