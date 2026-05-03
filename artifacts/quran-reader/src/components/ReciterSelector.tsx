import { useState, useRef, useEffect } from "react";
import { User2, Check } from "lucide-react";
import { useQuranStore } from "../store/quranStore";
import { RECITERS, getReciter } from "../data/reciters";

const POPOVER_WIDTH = 256; // 16rem
const MARGIN = 8; // min gap from viewport edge in px

interface PopoverPos {
  bottom: number;
  left: number;
  width: number;
}

function computePopoverPos(button: HTMLButtonElement): PopoverPos {
  const rect = button.getBoundingClientRect();
  const vw = window.innerWidth;
  const width = Math.min(POPOVER_WIDTH, vw - MARGIN * 2);

  // Prefer right-aligned to button; clamp so it never clips left or right edge.
  let left = rect.right - width;
  left = Math.max(MARGIN, Math.min(left, vw - width - MARGIN));

  const bottom = window.innerHeight - rect.top + MARGIN;

  return { bottom, left, width };
}

interface ReciterSelectorProps {
  style?: React.CSSProperties;
}

export default function ReciterSelector({ style }: ReciterSelectorProps) {
  const selectedReciterId = useQuranStore((s) => s.selectedReciterId);
  const setSelectedReciterId = useQuranStore((s) => s.setSelectedReciterId);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<PopoverPos | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const selected = getReciter(selectedReciterId);

  const handleOpen = () => {
    if (open) {
      setOpen(false);
      return;
    }
    if (buttonRef.current) {
      setPos(computePopoverPos(buttonRef.current));
    }
    setOpen(true);
  };

  // Recompute position on resize/scroll while open.
  useEffect(() => {
    if (!open || !buttonRef.current) return;
    const update = () => {
      if (buttonRef.current) setPos(computePopoverPos(buttonRef.current));
    };
    window.addEventListener("resize", update, { passive: true });
    window.addEventListener("scroll", update, { passive: true, capture: true });
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open]);

  // Close on outside click.
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
        onClick={handleOpen}
        style={{ pointerEvents: "auto" }}
        className="h-7 rounded-lg flex items-center justify-center transition-colors border border-border text-muted-foreground hover:bg-muted px-2 gap-1"
        aria-label={`Reciter: ${selected.nameEn}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={`Reciter: ${selected.nameEn}`}
      >
        <User2 className="w-3.5 h-3.5" />
        <span className="hidden sm:inline text-[10px] font-bold tabular-nums leading-none max-w-[5.5rem] truncate">
          {shortLabel(selected.nameEn)}
        </span>
      </button>

      {open && pos && (
        <div
          ref={popoverRef}
          style={{
            position: "fixed",
            bottom: pos.bottom,
            left: pos.left,
            width: pos.width,
          }}
          className="z-[70] bg-card border border-border rounded-xl shadow-xl p-1.5 flex flex-col gap-0.5 max-h-[60vh] overflow-y-auto overscroll-contain"
          role="listbox"
          aria-label="Choose reciter"
        >
          {RECITERS.map((r) => {
            const isActive = r.id === selectedReciterId;
            return (
              <button
                key={r.id}
                onClick={() => {
                  setSelectedReciterId(r.id);
                  setOpen(false);
                }}
                style={{ pointerEvents: "auto" }}
                role="option"
                aria-selected={isActive}
                className={`w-full text-left px-3 py-2 rounded-lg transition-colors flex items-start gap-2 ${
                  isActive
                    ? "bg-primary/15 text-primary"
                    : "text-foreground hover:bg-muted"
                }`}
              >
                <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                  <span className="text-xs font-medium leading-tight truncate">
                    {r.nameEn}
                  </span>
                  <span
                    className="text-[11px] leading-tight text-muted-foreground truncate"
                    dir="rtl"
                    lang="ar"
                  >
                    {r.nameAr}
                  </span>
                </span>
                {isActive && (
                  <Check className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-primary" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function shortLabel(nameEn: string): string {
  // First word + initial of next word — keeps the bar compact.
  const parts = nameEn.split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[1][0]}.`;
}
