import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ChevronRight, ChevronLeft, X, BookOpen } from "lucide-react";

export const TOUR_STORAGE_KEY = "hafith_tour_seen";
export const TOUR_START_EVENT = "hafith:start-tour";

interface TourStep {
  selector: string;
  title: string;
  description: string;
}

const STEPS: TourStep[] = [
  {
    selector: '[data-tour="surah-picker"]',
    title: "Navigate the Quran",
    description:
      "Tap here to jump to any of the 114 surahs. Search by name or number and navigate instantly.",
  },
  {
    selector: '[data-tour="highlight-controls"]',
    title: "Highlight to memorize",
    description:
      "Brush across the text to select words, lines, or full ayahs. Switch granularity with Word · Line · Ayah.",
  },
  {
    selector: '[data-tour="audio-bar"]',
    title: "Listen with recitation",
    description:
      "Play professional recitation with real-time word highlighting. Choose your reciter and adjust playback speed.",
  },
  {
    selector: '[data-tour="bookmarks"]',
    title: "Save your favourite ayahs",
    description:
      "Tap the bookmark icon on any verse to save it for later. Access all your saved verses in the upper toolbar.",
  },
  {
    selector: '[data-tour="queue-button"]',
    title: "Review queue",
    description:
      "Add highlighted passages to a review queue for focused memorization sessions with customisable repeat counts.",
  },
];

const PAD = 8;
const NAV_DELAY_MS = 600;

interface SpotlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

function measureElement(selector: string): SpotlightRect | null {
  const el = document.querySelector<HTMLElement>(selector);
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return null;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (rect.bottom < 0 || rect.top > vh || rect.right < 0 || rect.left > vw) return null;
  return {
    top: rect.top - PAD,
    left: rect.left - PAD,
    width: rect.width + PAD * 2,
    height: rect.height + PAD * 2,
  };
}

function TourTooltipContent({
  step,
  index,
  total,
  isLast,
  onBack,
  onNext,
}: {
  step: TourStep;
  index: number;
  total: number;
  isLast: boolean;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <>
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="text-sm font-semibold leading-snug">{step.title}</h3>
        <span className="text-xs text-muted-foreground tabular-nums flex-shrink-0 mt-0.5">
          {index + 1} / {total}
        </span>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed mb-4">
        {step.description}
      </p>
      <div className="flex items-center justify-between gap-2">
        <button
          onClick={onBack}
          disabled={index === 0}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          Back
        </button>
        <div className="flex gap-1">
          {Array.from({ length: total }).map((_, i) => (
            <div
              key={i}
              className={`w-1.5 h-1.5 rounded-full transition-colors ${
                i === index ? "bg-primary" : "bg-muted"
              }`}
            />
          ))}
        </div>
        <button
          onClick={onNext}
          className="flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
        >
          {isLast ? "Finish" : "Next"}
          {!isLast && <ChevronRight className="w-3.5 h-3.5" />}
        </button>
      </div>
    </>
  );
}

export default function FeatureTour() {
  const [, setLocation] = useLocation();
  const [phase, setPhase] = useState<"idle" | "welcome" | "steps">("idle");
  const [stepIndex, setStepIndex] = useState(0);
  const [spotlight, setSpotlight] = useState<SpotlightRect | null>(null);
  const [tooltipAbove, setTooltipAbove] = useState(false);

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(TOUR_STORAGE_KEY, "1");
    } catch {
      /* ignore */
    }
    setPhase("idle");
  }, []);

  const startTour = useCallback(() => {
    setStepIndex(0);
    setLocation("/");
    setTimeout(() => setPhase("steps"), NAV_DELAY_MS);
  }, [setLocation]);

  useEffect(() => {
    let firstRunTimer: ReturnType<typeof setTimeout> | undefined;

    try {
      if (!localStorage.getItem(TOUR_STORAGE_KEY)) {
        firstRunTimer = setTimeout(() => setPhase("welcome"), 800);
      }
    } catch {
      /* ignore */
    }

    const handler = () => {
      try {
        localStorage.removeItem(TOUR_STORAGE_KEY);
      } catch {
        /* ignore */
      }
      setPhase("welcome");
    };

    window.addEventListener(TOUR_START_EVENT, handler);

    return () => {
      clearTimeout(firstRunTimer);
      window.removeEventListener(TOUR_START_EVENT, handler);
    };
  }, []);

  useEffect(() => {
    if (phase !== "steps") {
      setSpotlight(null);
      return;
    }

    function measure() {
      const step = STEPS[stepIndex];
      if (!step) return;
      const sr = measureElement(step.selector);
      setSpotlight(sr);
      if (sr) {
        const vh = window.innerHeight;
        setTooltipAbove(sr.top + sr.height + 200 > vh);
      }
    }

    measure();
    window.addEventListener("scroll", measure, { passive: true, capture: true });
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure, { capture: true });
      window.removeEventListener("resize", measure);
    };
  }, [phase, stepIndex]);

  const goNext = () => {
    if (stepIndex < STEPS.length - 1) {
      setStepIndex((s) => s + 1);
    } else {
      dismiss();
    }
  };

  const goBack = () => {
    if (stepIndex > 0) setStepIndex((s) => s - 1);
  };

  if (phase === "idle") return null;

  if (phase === "welcome") {
    return (
      <Dialog open onOpenChange={(open) => { if (!open) dismiss(); }}>
        <DialogContent className="max-w-sm">
          <div className="flex justify-center mb-2 mt-1">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
              <BookOpen className="w-7 h-7 text-primary" />
            </div>
          </div>
          <DialogHeader className="items-center text-center">
            <DialogTitle className="text-xl">Welcome to Hafith</DialogTitle>
            <DialogDescription className="text-sm leading-relaxed mt-1 text-center">
              Your personal Quran memorization companion — read, listen, highlight, and track your daily progress.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 mt-2">
            <button
              onClick={startTour}
              className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Take the tour
            </button>
            <button
              onClick={dismiss}
              className="w-full py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Skip for now
            </button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const currentStep = STEPS[stepIndex];
  const isLast = stepIndex === STEPS.length - 1;
  const vw = typeof window !== "undefined" ? window.innerWidth : 375;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const tooltipW = Math.min(300, vw - 32);

  let tooltipLeft = 16;
  let tooltipTopOrBottom: { top?: number; bottom?: number } = { top: 0 };

  if (spotlight) {
    tooltipLeft = Math.max(
      16,
      Math.min(vw - tooltipW - 16, spotlight.left + spotlight.width / 2 - tooltipW / 2)
    );
    if (tooltipAbove) {
      tooltipTopOrBottom = { bottom: vh - (spotlight.top - 16) };
    } else {
      tooltipTopOrBottom = { top: spotlight.top + spotlight.height + 16 };
    }
  }

  return (
    <>
      {spotlight ? (
        <div
          style={{
            position: "fixed",
            top: spotlight.top,
            left: spotlight.left,
            width: spotlight.width,
            height: spotlight.height,
            borderRadius: 10,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)",
            zIndex: 9050,
            pointerEvents: "none",
          }}
        />
      ) : (
        <div className="fixed inset-0 bg-black/50" style={{ zIndex: 9000 }} />
      )}

      <button
        onClick={dismiss}
        style={{ position: "fixed", bottom: 16, right: 16, zIndex: 9200 }}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-card border border-border text-xs text-muted-foreground hover:text-foreground transition-colors shadow-sm"
      >
        <X className="w-3.5 h-3.5" />
        Skip tour
      </button>

      {spotlight ? (
        <div
          style={{
            position: "fixed",
            left: tooltipLeft,
            width: tooltipW,
            zIndex: 9100,
            ...tooltipTopOrBottom,
          }}
          className="bg-card border border-border rounded-2xl shadow-xl p-4"
        >
          <TourTooltipContent
            step={currentStep}
            index={stepIndex}
            total={STEPS.length}
            isLast={isLast}
            onBack={goBack}
            onNext={goNext}
          />
        </div>
      ) : (
        <div
          style={{
            position: "fixed",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9100,
            padding: "0 16px",
          }}
        >
          <div className="w-full max-w-sm bg-card border border-border rounded-2xl shadow-xl p-5">
            <TourTooltipContent
              step={currentStep}
              index={stepIndex}
              total={STEPS.length}
              isLast={isLast}
              onBack={goBack}
              onNext={goNext}
            />
          </div>
        </div>
      )}
    </>
  );
}
