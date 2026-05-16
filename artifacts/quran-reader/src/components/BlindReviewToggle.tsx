import { Eye, EyeOff, EyeClosed } from "lucide-react";
import type { LucideProps } from "lucide-react";
import { useQuranStore, type BlindReviewMode } from "../store/quranStore";

type IconComponent = React.ComponentType<LucideProps>;

interface ModeConfig {
  icon: IconComponent;
  label: string;
  title: string;
  active: boolean;
}

const MODES: BlindReviewMode[] = ["default", "word-by-word", "context-only", "blind"];

function getModeConfig(mode: BlindReviewMode): ModeConfig {
  switch (mode) {
    case "default":
      return {
        icon: Eye,
        label: "Visible",
        title: "All text visible — click to cycle",
        active: false,
      };
    case "word-by-word":
      return {
        icon: Eye,
        label: "Word by word",
        title: "Word by word — audio reveals each word — click to cycle",
        active: true,
      };
    case "blind":
      return {
        icon: EyeOff,
        label: "Blind",
        title: "Blind mode — all hidden, reveal manually — click to cycle",
        active: true,
      };
    case "context-only":
      return {
        icon: EyeClosed,
        label: "Context only",
        title: "Context only — active segment hidden — click to cycle",
        active: true,
      };
  }
}

export default function BlindReviewToggle() {
  const blindReviewMode = useQuranStore((s) => s.blindReviewMode);
  const setBlindReviewMode = useQuranStore((s) => s.setBlindReviewMode);

  function cycleMode() {
    const idx = MODES.indexOf(blindReviewMode);
    setBlindReviewMode(MODES[(idx + 1) % MODES.length]);
  }

  const { icon: Icon, label, title, active } = getModeConfig(blindReviewMode);

  return (
    <button
      onClick={cycleMode}
      title={title}
      aria-label={`Visibility: ${label}`}
      className={`flex items-center gap-1.5 px-2 py-1 rounded-lg transition-colors ${
        active
          ? "text-primary hover:bg-primary/10"
          : "text-muted-foreground hover:bg-muted"
      }`}
    >
      <Icon className="w-4 h-4 flex-shrink-0" />
      <span className="text-[10px] font-medium leading-none whitespace-nowrap">{label}</span>
    </button>
  );
}
