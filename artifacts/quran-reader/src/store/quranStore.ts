import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { SurahData, MushafPageData, Settings, ViewMode } from "../types/quran";

interface QuranStore {
  currentSurah: number;
  currentPage: number;
  viewMode: ViewMode;
  surahCache: Map<number, SurahData>;
  mushafPageCache: Map<number, MushafPageData>;
  settings: Settings;
  isLoading: boolean;
  error: string | null;

  setCurrentSurah: (surah: number) => void;
  setCurrentPage: (page: number) => void;
  setViewMode: (mode: ViewMode) => void;
  setSurahData: (surah: number, data: SurahData) => void;
  setMushafPageData: (page: number, data: MushafPageData) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  updateSettings: (settings: Partial<Settings>) => void;
}

export const useQuranStore = create<QuranStore>()(
  persist(
    (set) => ({
      currentSurah: 1,
      currentPage: 1,
      viewMode: "reading",
      surahCache: new Map(),
      mushafPageCache: new Map(),
      settings: {
        fontSize: 28,
        showTranslation: false,
      },
      isLoading: false,
      error: null,

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
    }),
    {
      name: "quran-reader-store",
      partialize: (state) => ({
        currentSurah: state.currentSurah,
        currentPage: state.currentPage,
        viewMode: state.viewMode,
        settings: state.settings,
      }),
    }
  )
);
