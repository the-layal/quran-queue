import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { SurahData, MushafPageData, Settings, ViewMode, BrushFineness } from "../types/quran";

export type PlaybackHighlightMode = "line" | "ayah";

export interface ReviewQueueItem {
  id: string;
  selectedWordIds: string[];
  brushFineness: BrushFineness;
  label: string;
  repeatCount: number;
}

interface QuranStore {
  currentSurah: number;
  currentPage: number;
  viewMode: ViewMode;
  surahCache: Map<number, SurahData>;
  mushafPageCache: Map<number, MushafPageData>;
  settings: Settings;
  isLoading: boolean;
  error: string | null;

  selectedWordIds: string[];
  brushFineness: BrushFineness;

  playbackHighlightMode: PlaybackHighlightMode;
  playbackHighlightEnabled: boolean;
  playbackActiveIds: string[];
  playbackCurrentWordId: string | null;

  svgToJsonWordMap: Record<string, Record<number, number>>;
  jsonToSvgWordsMap: Record<string, Record<number, number[]>>;
  setSvgWordAlignmentMaps: (
    svgToJson: Record<string, Record<number, number>>,
    jsonToSvg: Record<string, Record<number, number[]>>
  ) => void;

  // Maps "S:A" → sorted ascending list of selectable SVG word indices for each
  // ayah on loaded pages.  Populated by MushafSvgPage from the real SVG DOM
  // when each page renders.  Drives cross-page adjacency checks in useSmartBrush:
  //   first selectable  = indices[0]
  //   last  selectable  = indices[indices.length - 1]
  //   next  neighbor    = indices[indexOf(w) + 1]
  // Handles ayahs with waw al-atf, waqf marks, or leading juz-star/hizb markers
  // where SVG word indices diverge from JSON segment counts or have gaps.
  ayahSelectableIndices: Record<string, number[]>;
  setAyahSelectableIndices: (map: Record<string, number[]>) => void;

  reviewQueue: ReviewQueueItem[];
  activeQueueItemId: string | null;
  queuePanelOpen: boolean;
  queueRepeatAll: number;
  queueLoopCount: number;
  isSharedQueue: boolean;

  setCurrentSurah: (surah: number) => void;
  setCurrentPage: (page: number) => void;
  setViewMode: (mode: ViewMode) => void;
  setSurahData: (surah: number, data: SurahData) => void;
  setMushafPageData: (page: number, data: MushafPageData) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  updateSettings: (settings: Partial<Settings>) => void;
  setSelectedWordIds: (ids: string[]) => void;
  setBrushFineness: (fineness: BrushFineness) => void;
  clearSelection: () => void;
  confirmSelection: () => void;
  setPlaybackHighlightMode: (mode: PlaybackHighlightMode) => void;
  setPlaybackHighlightEnabled: (enabled: boolean) => void;
  setPlaybackActiveIds: (ids: string[]) => void;
  setPlaybackCurrentWordId: (id: string | null) => void;

  addToQueue: (item: Omit<ReviewQueueItem, "id">) => void;
  removeFromQueue: (id: string) => void;
  reorderQueue: (fromIndex: number, toIndex: number) => void;
  clearReviewQueue: () => void;
  setActiveQueueItemId: (id: string | null) => void;
  setQueuePanelOpen: (open: boolean) => void;
  setQueueItemRepeat: (id: string, count: number) => void;
  setQueueRepeatAll: (count: number) => void;
  setQueueLoopCount: (count: number) => void;
  setReviewQueue: (items: ReviewQueueItem[]) => void;
  setIsSharedQueue: (shared: boolean) => void;
}

function genId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export const useQuranStore = create<QuranStore>()(
  persist(
    (set) => ({
      currentSurah: 1,
      currentPage: 1,
      viewMode: "mushaf",
      surahCache: new Map(),
      mushafPageCache: new Map(),
      settings: {
        fontSize: 26,
        showTranslation: false,
        mushafScale: 1,
      },
      isLoading: false,
      error: null,

      selectedWordIds: [],
      brushFineness: "word",

      playbackHighlightMode: "ayah",
      playbackHighlightEnabled: true,
      playbackActiveIds: [],
      playbackCurrentWordId: null,

      svgToJsonWordMap: {},
      jsonToSvgWordsMap: {},
      setSvgWordAlignmentMaps: (svgToJson, jsonToSvg) =>
        set((state) => ({
          svgToJsonWordMap:  { ...state.svgToJsonWordMap,  ...svgToJson  },
          jsonToSvgWordsMap: { ...state.jsonToSvgWordsMap, ...jsonToSvg  },
        })),

      ayahSelectableIndices: {},
      setAyahSelectableIndices: (map) =>
        set((state) => ({
          ayahSelectableIndices: { ...state.ayahSelectableIndices, ...map },
        })),

      reviewQueue: [],
      activeQueueItemId: null,
      queuePanelOpen: false,
      queueRepeatAll: 1,
      queueLoopCount: 1,
      isSharedQueue: false,

      setCurrentSurah: (surah) =>
        set({ currentSurah: Math.max(1, Math.min(114, surah)) }),

      setCurrentPage: (page) =>
        set({ currentPage: Math.max(1, Math.min(604, page)) }),

      setViewMode: (viewMode) => set({ viewMode }),

      setSurahData: (surah, data) =>
        set((state) => {
          const newCache = new Map(state.surahCache);
          newCache.set(surah, data);
          return { surahCache: newCache };
        }),

      setMushafPageData: (page, data) =>
        set((state) => {
          const newCache = new Map(state.mushafPageCache);
          newCache.set(page, data);
          return { mushafPageCache: newCache };
        }),

      setLoading: (isLoading) => set({ isLoading }),
      setError: (error) => set({ error }),

      updateSettings: (settings) =>
        set((state) => ({
          settings: { ...state.settings, ...settings },
        })),

      setSelectedWordIds: (ids) => set({ selectedWordIds: ids }),
      setBrushFineness: (brushFineness) => set({ brushFineness }),
      clearSelection: () => set({ selectedWordIds: [] }),
      confirmSelection: () => {
        set({ selectedWordIds: [] });
      },

      setPlaybackHighlightMode: (playbackHighlightMode) => set({ playbackHighlightMode }),
      setPlaybackHighlightEnabled: (playbackHighlightEnabled) => set({ playbackHighlightEnabled }),
      setPlaybackActiveIds: (playbackActiveIds) => set({ playbackActiveIds }),
      setPlaybackCurrentWordId: (playbackCurrentWordId) => set({ playbackCurrentWordId }),

      addToQueue: (item) =>
        set((state) => ({
          reviewQueue: [...state.reviewQueue, { ...item, id: genId() }],
        })),

      removeFromQueue: (id) =>
        set((state) => ({
          reviewQueue: state.reviewQueue.filter((item) => item.id !== id),
          activeQueueItemId:
            state.activeQueueItemId === id ? null : state.activeQueueItemId,
        })),

      reorderQueue: (fromIndex, toIndex) =>
        set((state) => {
          const q = [...state.reviewQueue];
          if (
            fromIndex < 0 ||
            fromIndex >= q.length ||
            toIndex < 0 ||
            toIndex >= q.length ||
            fromIndex === toIndex
          ) {
            return state;
          }
          const [moved] = q.splice(fromIndex, 1);
          q.splice(toIndex, 0, moved);
          return { reviewQueue: q };
        }),

      clearReviewQueue: () =>
        set({ reviewQueue: [], activeQueueItemId: null, isSharedQueue: false }),

      setActiveQueueItemId: (id) => set({ activeQueueItemId: id }),

      setQueuePanelOpen: (open) => set({ queuePanelOpen: open }),

      setQueueItemRepeat: (id, count) =>
        set((state) => ({
          reviewQueue: state.reviewQueue.map((item) =>
            item.id === id ? { ...item, repeatCount: count } : item
          ),
        })),

      setQueueRepeatAll: (count) =>
        set((state) => ({
          queueRepeatAll: count,
          reviewQueue: state.reviewQueue.map((item) => ({ ...item, repeatCount: count })),
        })),

      setQueueLoopCount: (count) => set({ queueLoopCount: count }),

      setReviewQueue: (items) =>
        set({ reviewQueue: items, activeQueueItemId: null, isSharedQueue: false }),

      setIsSharedQueue: (shared) => set({ isSharedQueue: shared }),
    }),
    {
      name: "quran-reader-store",
      partialize: (state) => ({
        currentSurah: state.currentSurah,
        currentPage: state.currentPage,
        viewMode: state.viewMode,
        settings: state.settings,
        brushFineness: state.brushFineness,
        playbackHighlightMode: state.playbackHighlightMode,
        reviewQueue: state.reviewQueue,
        queueRepeatAll: state.queueRepeatAll,
        queueLoopCount: state.queueLoopCount,
        isSharedQueue: state.isSharedQueue,
      }),
    }
  )
);
