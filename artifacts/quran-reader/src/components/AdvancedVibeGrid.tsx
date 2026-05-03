import { useState, useMemo, useCallback, useEffect } from "react";
import { cn } from "@/lib/utils";
import { getAyahsForReference } from "@/lib/page-utils";

interface AyahVibe {
  surah: number;
  ayah: number;
  vibe: number;
}

interface AdvancedVibeGridProps {
  reference: string;
  onSubmit: (ayahVibes: AyahVibe[]) => void;
  isPending?: boolean;
}

const VIBE_COLORS: Record<number, string> = {
  0: "bg-secondary/10 border-border text-muted-foreground",
  1: "bg-primary/20 border-primary/20 text-foreground",
  2: "bg-primary/40 border-primary/40 text-foreground",
  3: "bg-primary/60 border-primary/60 text-primary-foreground",
  4: "bg-primary/80 border-primary/80 text-primary-foreground",
  5: "bg-primary border-primary text-primary-foreground",
};

const VIBE_LABELS: Record<number, string> = {
  1: "Forgetful",
  2: "Needs Work",
  3: "Familiar",
  4: "Solid",
  5: "Mastered",
};

const VIBE_DOT_COLORS: Record<number, string> = {
  1: "bg-primary/20",
  2: "bg-primary/40",
  3: "bg-primary/60",
  4: "bg-primary/80",
  5: "bg-primary",
};

export function AdvancedVibeGrid({ reference, onSubmit, isPending }: AdvancedVibeGridProps) {
  const groups = useMemo(() => getAyahsForReference(reference), [reference]);

  const allAyahs = useMemo(() => {
    const list: { surah: number; ayah: number }[] = [];
    for (const g of groups) {
      for (const a of g.ayahs) list.push({ surah: g.surah, ayah: a });
    }
    return list;
  }, [groups]);

  const [vibeMap, setVibeMap] = useState<Record<string, number>>({});
  const [activeBrush, setActiveBrush] = useState<number>(0);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    setVibeMap({});
    setActiveBrush(0);
  }, [reference]);

  const getKey = (surah: number, ayah: number) => `${surah}:${ayah}`;
  const getVibe = (surah: number, ayah: number) => vibeMap[getKey(surah, ayah)] || 0;

  const setAllVibe = (vibe: number) => {
    const newMap: Record<string, number> = {};
    for (const a of allAyahs) newMap[getKey(a.surah, a.ayah)] = vibe;
    setVibeMap(newMap);
  };

  const paintAyah = useCallback(
    (surah: number, ayah: number) => {
      if (activeBrush === 0) return;
      setVibeMap((prev) => ({ ...prev, [getKey(surah, ayah)]: activeBrush }));
    },
    [activeBrush],
  );

  const handleMouseDown = (surah: number, ayah: number) => {
    if (activeBrush === 0) return;
    setIsDragging(true);
    paintAyah(surah, ayah);
  };

  const handleMouseEnter = (surah: number, ayah: number) => {
    if (isDragging && activeBrush > 0) paintAyah(surah, ayah);
  };

  const handleMouseUp = () => setIsDragging(false);

  const handleSubmit = () => {
    const result: AyahVibe[] = [];
    for (const a of allAyahs) {
      const v = getVibe(a.surah, a.ayah);
      if (v > 0) result.push({ surah: a.surah, ayah: a.ayah, vibe: v });
    }
    onSubmit(result);
  };

  const allRated = allAyahs.every((a) => getVibe(a.surah, a.ayah) > 0);

  const surahHeaders = useMemo(() => {
    const seen = new Set<number>();
    const headers: { surah: number; name: string; arabic: string; groupIndices: number[] }[] = [];
    groups.forEach((g, idx) => {
      if (!seen.has(g.surah)) {
        seen.add(g.surah);
        headers.push({ surah: g.surah, name: g.surahName, arabic: g.surahArabicName, groupIndices: [idx] });
      } else {
        const h = headers.find((h) => h.surah === g.surah);
        if (h) h.groupIndices.push(idx);
      }
    });
    return headers;
  }, [groups]);

  if (groups.length === 0) {
    return <div className="text-center text-muted-foreground py-4">No ayahs found for this reference.</div>;
  }

  return (
    <div className="space-y-4 select-none" onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-foreground">Select a rating, then tap or drag across ayahs</label>
        </div>

        <div className="flex gap-1.5 items-center">
          {[1, 2, 3, 4, 5].map((v) => (
            <button
              key={v}
              type="button"
              data-testid={`brush-vibe-${v}`}
              onClick={() => setActiveBrush(activeBrush === v ? 0 : v)}
              className={cn(
                "flex-1 py-2 rounded-lg text-sm font-bold border-2 transition-all",
                activeBrush === v
                  ? VIBE_COLORS[v] + " ring-2 ring-offset-1 ring-current shadow-md scale-105"
                  : "border-border bg-card text-muted-foreground hover:border-primary/30",
              )}
            >
              {v}
            </button>
          ))}
        </div>
        <div className="text-center h-4">
          {activeBrush > 0 && (
            <span className="text-xs text-muted-foreground">
              Painting: <strong>{VIBE_LABELS[activeBrush]}</strong>
            </span>
          )}
        </div>
      </div>

      <div className="flex gap-2 items-center">
        <span className="text-xs font-medium text-muted-foreground">Set All:</span>
        {[1, 2, 3, 4, 5].map((v) => (
          <button
            key={v}
            type="button"
            data-testid={`set-all-vibe-${v}`}
            onClick={() => setAllVibe(v)}
            className={cn(
              "w-7 h-7 rounded-md text-xs font-bold border transition-all",
              VIBE_COLORS[v],
              "hover:scale-110",
            )}
          >
            {v}
          </button>
        ))}
      </div>

      <div className="max-h-[50vh] overflow-y-auto rounded-xl border border-border/50 bg-card/50 p-3 space-y-4">
        {surahHeaders.map((header) => (
          <div key={header.surah}>
            <div className="flex items-center gap-2 mb-2 sticky top-0 bg-card/90 backdrop-blur-sm py-1 z-10 border-b border-border/30 pb-2">
              <span className="text-sm font-serif font-semibold text-foreground">{header.name}</span>
              <span className="text-sm text-muted-foreground font-arabic">({header.arabic})</span>
            </div>

            {header.groupIndices.map((gi) => {
              const group = groups[gi];
              return (
                <div key={`${group.surah}-${group.page}`} className="mb-3">
                  <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5 pl-1">
                    Page {group.page}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {group.ayahs.map((ayah) => {
                      const vibe = getVibe(group.surah, ayah);
                      return (
                        <button
                          key={ayah}
                          type="button"
                          data-testid={`ayah-block-${group.surah}-${ayah}`}
                          onMouseDown={() => handleMouseDown(group.surah, ayah)}
                          onMouseEnter={() => handleMouseEnter(group.surah, ayah)}
                          onTouchStart={() => paintAyah(group.surah, ayah)}
                          className={cn(
                            "w-9 h-9 rounded-lg text-xs font-semibold border transition-all cursor-pointer flex items-center justify-center",
                            VIBE_COLORS[vibe],
                            activeBrush > 0 && "hover:scale-110 hover:shadow-md",
                          )}
                        >
                          {ayah}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div className="flex gap-2 justify-center text-[10px] text-muted-foreground flex-wrap">
        {[1, 2, 3, 4, 5].map((v) => (
          <div key={v} className="flex items-center gap-1">
            <div className={cn("w-2.5 h-2.5 rounded-full", VIBE_DOT_COLORS[v])} />
            <span>
              {v} - {VIBE_LABELS[v]}
            </span>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={handleSubmit}
        disabled={!allRated || isPending}
        data-testid="button-submit-advanced"
        className="w-full py-3 rounded-xl font-bold bg-primary text-primary-foreground shadow-md shadow-primary/20 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all"
      >
        {isPending ? "Saving..." : allRated ? "Submit Detailed Ratings" : `Rate all ${allAyahs.length} ayahs to submit`}
      </button>
    </div>
  );
}
