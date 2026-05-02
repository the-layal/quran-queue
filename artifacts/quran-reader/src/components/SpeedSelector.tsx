import { useState, useRef, useEffect } from "react";
import { useQuranStore } from "../store/quranStore";

const SPEED_OPTIONS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;

function formatRate(rate: number): string {
  return Number.isInteger(rate) ? `${rate}×` : `${rate}×`;
}

interface SpeedSelectorProps {
  style?: React.CSSProperties;
}

export default function SpeedSelector({ style }: SpeedSelectorProps) {
  const playbackRate = useQuranStore((s) => s.playbackRate);
  const setPlaybackRate = useQuranStore((s) => s.setPlaybackRate);
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        !buttonRef.current?.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="relative flex-shrink-0" style={style}>
      <button
        ref={buttonRef}
        onClick={() => setOpen((v) => !v)}
        style={{ pointerEvents: "auto" }}
        className={`h-7 rounded-lg flex items-center justify-center transition-colors border px-2 ${
          playbackRate !== 1
            ? "bg-primary/15 border-primary text-primary"
            : "border-border text-muted-foreground hover:bg-muted"
        }`}
        aria-label={`Playback speed: ${formatRate(playbackRate)}`}
        title="Playback speed"
      >
        <span className="text-[10px] font-bold tabular-nums leading-none">
          {formatRate(playbackRate)}
        </span>
      </button>

      {open && (
        <div
          ref={popoverRef}
          className="absolute bottom-full mb-2 right-0 z-[70] bg-card border border-border rounded-xl shadow-xl p-1.5 flex flex-col gap-0.5 min-w-[4.5rem]"
        >
          {SPEED_OPTIONS.map((rate) => (
            <button
              key={rate}
              onClick={() => {
                setPlaybackRate(rate);
                setOpen(false);
              }}
              style={{ pointerEvents: "auto" }}
              className={`w-full text-center text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
                playbackRate === rate
                  ? "bg-primary/15 text-primary"
                  : "text-foreground hover:bg-muted"
              }`}
            >
              {formatRate(rate)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
