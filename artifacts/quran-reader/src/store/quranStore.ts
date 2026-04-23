import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { QuranPage, Settings } from "../types/quran";

interface QuranStore {
  currentPage: number;
  pageCache: Map<number, QuranPage>;
  settings: Settings;
  isLoading: boolean;
  error: string | null;

  setCurrentPage: (page: number) => void;
  setPageData: (page: number, data: QuranPage) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  updateSettings: (settings: Partial<Settings>) => void;
}

export const useQuranStore = create<QuranStore>()(
  persist(
    (set) => ({
      currentPage: 1,
      pageCache: new Map(),
      settings: {
        fontSize: 28,
        showTranslation: false,
      },
      isLoading: false,
      error: null,

      setCurrentPage: (page) =>
        set((state) => ({
          currentPage: Math.max(1, Math.min(604, page)),
          pageCache: state.pageCache,
        })),

      setPageData: (page, data) =>
        set((state) => {
          const newCache = new Map(state.pageCache);
          newCache.set(page, data);
          return { pageCache: newCache };
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
        settings: state.settings,
      }),
    }
  )
);
