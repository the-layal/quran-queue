import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { QuranPage, MushafPageData, Settings, ViewMode } from "../types/quran";

interface QuranStore {
  currentPage: number;
  viewMode: ViewMode;
  pageCache: Map<number, QuranPage>;
  mushafPageCache: Map<number, MushafPageData>;
  settings: Settings;
  isLoading: boolean;
  error: string | null;

  setCurrentPage: (page: number) => void;
  setViewMode: (mode: ViewMode) => void;
  setPageData: (page: number, data: QuranPage) => void;
  setMushafPageData: (page: number, data: MushafPageData) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  updateSettings: (settings: Partial<Settings>) => void;
}

export const useQuranStore = create<QuranStore>()(
  persist(
    (set) => ({
      currentPage: 1,
      viewMode: "reading",
      pageCache: new Map(),
      mushafPageCache: new Map(),
      settings: {
        fontSize: 26,
        showTranslation: false,
      },
      isLoading: false,
      error: null,

      setCurrentPage: (page) =>
        set((state) => ({
          currentPage: Math.max(1, Math.min(604, page)),
          pageCache: state.pageCache,
          mushafPageCache: state.mushafPageCache,
        })),

      setViewMode: (viewMode) => set({ viewMode }),

      setPageData: (page, data) =>
        set((state) => {
          const newCache = new Map(state.pageCache);
          newCache.set(page, data);
          return { pageCache: newCache };
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
        currentPage: state.currentPage,
        viewMode: state.viewMode,
        settings: state.settings,
      }),
    }
  )
);
