import { useState } from "react";
import { cn } from "@/lib/utils";

interface VibeScaleProps {
  value?: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}

const VIBE_LABELS = ["Forgetful", "Needs Work", "Familiar", "Solid", "Mastered"];

export function VibeScale({ value, onChange, disabled }: VibeScaleProps) {
  const [hovered, setHovered] = useState<number | null>(null);

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
    </div>
  );
}
