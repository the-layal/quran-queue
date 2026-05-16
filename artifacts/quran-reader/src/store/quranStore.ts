import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { SurahData, MushafPageData, Settings, ViewMode, BrushFineness } from "../types/quran";
import { clampRepeat } from "../utils/repeatOptions";
import { DEFAULT_RECITER_ID, getReciter } from "../data/reciters";

export type PlaybackHighlightMode = "line" | "ayah";
export type BlindReviewMode = "default" | "word-by-word" | "blind" | "context-only";

export interface ReviewQueueItem {
  id: string;
  selectedWordIds: string[];
  brushFineness: BrushFineness;
  label: string;
  repeatCount: number;
}

export interface SubQueue {
  isSubQueue: true;
  id: string;
  label: string;
  repeatCount: number;
  items: ReviewQueueItem[];
  collapsed?: boolean;
}

export type QueueEntry = ReviewQueueItem | SubQueue;

export function isSubQueue(entry: QueueEntry): entry is SubQueue {
  return (entry as SubQueue).isSubQueue === true;
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

  darkMode: boolean;
  setDarkMode: (dark: boolean) => void;

  bookmarksPanelOpen: boolean;
  setBookmarksPanelOpen: (open: boolean) => void;

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

  ayahSelectableIndices: Record<string, number[]>;
  setAyahSelectableIndices: (map: Record<string, number[]>) => void;

  reviewQueue: QueueEntry[];
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
  setSubQueueRepeatAll: (count: number) => void;
  setQueueLoopCount: (count: number) => void;
  setReviewQueue: (items: ReviewQueueItem[]) => void;
  setQueueEntries: (entries: QueueEntry[]) => void;
  setIsSharedQueue: (shared: boolean) => void;

  // SubQueue actions
  addSubQueue: (sq: Omit<SubQueue, "isSubQueue" | "id">) => void;
  dissolveSubQueue: (id: string) => void;
  setSubQueueRepeat: (id: string, count: number) => void;
  toggleSubQueueCollapsed: (id: string) => void;
  reorderItemInSubQueue: (subQueueId: string, fromIndex: number, toIndex: number) => void;
  promoteToSubQueue: (topLevelIndices: number[], label: string) => void;
  moveQueueItem: (
    from: { type: "top"; index: number } | { type: "sub"; subQueueId: string; index: number },
    to: { type: "top"; index: number } | { type: "sub"; subQueueId: string; index: number; append?: boolean }
  ) => void;
  renameSubQueue: (id: string, label: string) => void;

  playbackRate: number;
  setPlaybackRate: (rate: number) => void;

  selectedReciterId: string;
  setSelectedReciterId: (id: string) => void;

  targetScrollAyah: { surahNumber: number; ayahNumber: number } | null;
  setTargetScrollAyah: (target: { surahNumber: number; ayahNumber: number } | null) => void;

  blindReviewMode: BlindReviewMode;
  manuallyRevealedIds: string[];
  lockedContextIds: string[];
  setBlindReviewMode: (mode: BlindReviewMode) => void;
  revealWords: (ids: string[]) => void;
  clearManualReveals: () => void;
  clearLockedContext: () => void;
}

function genId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function clampEntry(entry: QueueEntry): QueueEntry {
  if (isSubQueue(entry)) {
    return {
      ...entry,
      repeatCount: clampRepeat(entry.repeatCount),
      items: entry.items.map((item) => ({ ...item, repeatCount: clampRepeat(item.repeatCount) })),
    };
  }
  return { ...entry, repeatCount: clampRepeat(entry.repeatCount) };
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
        showTransliteration: false,
        mushafScale: 1,
      },
      isLoading: false,
      error: null,

      darkMode: typeof window !== "undefined" && document.documentElement.classList.contains("dark"),
      setDarkMode: (dark) => {
        document.documentElement.classList.toggle("dark", dark);
        set({ darkMode: dark });
      },

      bookmarksPanelOpen: false,
      setBookmarksPanelOpen: (open) => set({ bookmarksPanelOpen: open }),

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

      playbackRate: 1,

      selectedReciterId: DEFAULT_RECITER_ID,

      blindReviewMode: "default",
      manuallyRevealedIds: [],
      lockedContextIds: [],
      setBlindReviewMode: (blindReviewMode) =>
        set((state) => ({
          blindReviewMode,
          lockedContextIds: blindReviewMode === "context-only" ? state.lockedContextIds : [],
        })),
      revealWords: (ids) =>
        set((state) => ({
          manuallyRevealedIds: Array.from(new Set([...state.manuallyRevealedIds, ...ids])),
        })),
      clearManualReveals: () => set({ manuallyRevealedIds: [] }),
      clearLockedContext: () => set({ lockedContextIds: [] }),

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
      clearSelection: () => set({ selectedWordIds: [], lockedContextIds: [] }),
      confirmSelection: () =>
        set((state) => {
          if (state.blindReviewMode === "context-only") {
            return {
              lockedContextIds: state.selectedWordIds,
              selectedWordIds: [],
            };
          }
          return { selectedWordIds: [] };
        }),

      setPlaybackHighlightMode: (playbackHighlightMode) => set({ playbackHighlightMode }),
      setPlaybackHighlightEnabled: (playbackHighlightEnabled) => set({ playbackHighlightEnabled }),
      setPlaybackActiveIds: (playbackActiveIds) => set({ playbackActiveIds }),
      setPlaybackCurrentWordId: (playbackCurrentWordId) => set({ playbackCurrentWordId }),

      addToQueue: (item) =>
        set((state) => ({
          reviewQueue: [...state.reviewQueue, { ...item, id: genId() }],
        })),

      removeFromQueue: (id) =>
        set((state) => {
          const newQueue: QueueEntry[] = [];
          let activeCleared = false;
          for (const entry of state.reviewQueue) {
            if (isSubQueue(entry)) {
              if (entry.id === id) {
                // If the active leaf item is inside this subqueue, clear it
                if (
                  state.activeQueueItemId &&
                  entry.items.some((item) => item.id === state.activeQueueItemId)
                ) {
                  activeCleared = true;
                }
                continue; // remove the whole subqueue
              }
              const filteredItems = entry.items.filter((item) => item.id !== id);
              if (filteredItems.length === 0) continue; // dissolve empty subqueue
              newQueue.push({ ...entry, items: filteredItems });
            } else {
              if (entry.id !== id) newQueue.push(entry);
            }
          }
          return {
            reviewQueue: newQueue,
            activeQueueItemId:
              activeCleared || state.activeQueueItemId === id
                ? null
                : state.activeQueueItemId,
          };
        }),

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
          reviewQueue: state.reviewQueue.map((entry) => {
            if (isSubQueue(entry)) {
              return {
                ...entry,
                items: entry.items.map((item) =>
                  item.id === id ? { ...item, repeatCount: count } : item
                ),
              };
            }
            return entry.id === id ? { ...entry, repeatCount: count } : entry;
          }),
        })),

      setQueueRepeatAll: (count) =>
        set((state) => ({
          queueRepeatAll: count,
          reviewQueue: state.reviewQueue.map((entry) => {
            if (isSubQueue(entry)) {
              return {
                ...entry,
                items: entry.items.map((item) => ({ ...item, repeatCount: count })),
              };
            }
            return { ...entry, repeatCount: count };
          }),
        })),

      setSubQueueRepeatAll: (count) =>
        set((state) => ({
          reviewQueue: state.reviewQueue.map((entry) => {
            if (isSubQueue(entry)) return { ...entry, repeatCount: count };
            return entry;
          }),
        })),

      setQueueLoopCount: (count) => set({ queueLoopCount: count }),

      setReviewQueue: (items) =>
        set({
          reviewQueue: items.map((item) => ({
            ...item,
            repeatCount: clampRepeat(item.repeatCount),
          })),
          activeQueueItemId: null,
          isSharedQueue: false,
        }),

      setQueueEntries: (entries) =>
        set({
          reviewQueue: entries.map((entry) => clampEntry(entry)),
          activeQueueItemId: null,
          isSharedQueue: false,
        }),

      setIsSharedQueue: (shared) => set({ isSharedQueue: shared }),

      // SubQueue actions

      addSubQueue: (sq) =>
        set((state) => ({
          reviewQueue: [
            ...state.reviewQueue,
            { ...sq, isSubQueue: true as const, id: genId() },
          ],
        })),

      dissolveSubQueue: (id) =>
        set((state) => {
          const newQueue: QueueEntry[] = [];
          for (const entry of state.reviewQueue) {
            if (isSubQueue(entry) && entry.id === id) {
              newQueue.push(...entry.items);
            } else {
              newQueue.push(entry);
            }
          }
          return { reviewQueue: newQueue };
        }),

      setSubQueueRepeat: (id, count) =>
        set((state) => ({
          reviewQueue: state.reviewQueue.map((entry) =>
            isSubQueue(entry) && entry.id === id
              ? { ...entry, repeatCount: count }
              : entry
          ),
        })),

      toggleSubQueueCollapsed: (id) =>
        set((state) => ({
          reviewQueue: state.reviewQueue.map((entry) =>
            isSubQueue(entry) && entry.id === id
              ? { ...entry, collapsed: !entry.collapsed }
              : entry
          ),
        })),

      reorderItemInSubQueue: (subQueueId, fromIndex, toIndex) =>
        set((state) => ({
          reviewQueue: state.reviewQueue.map((entry) => {
            if (!isSubQueue(entry) || entry.id !== subQueueId) return entry;
            const items = [...entry.items];
            if (
              fromIndex < 0 || fromIndex >= items.length ||
              toIndex < 0 || toIndex >= items.length ||
              fromIndex === toIndex
            ) return entry;
            const [moved] = items.splice(fromIndex, 1);
            items.splice(toIndex, 0, moved);
            return { ...entry, items };
          }),
        })),

      promoteToSubQueue: (topLevelIndices, label) =>
        set((state) => {
          const indices = new Set(topLevelIndices);
          const promoted: ReviewQueueItem[] = [];
          const remaining: QueueEntry[] = [];
          state.reviewQueue.forEach((entry, i) => {
            if (indices.has(i) && !isSubQueue(entry)) {
              promoted.push(entry);
            } else {
              remaining.push(entry);
            }
          });
          if (promoted.length === 0) return state;
          const firstIdx = Math.min(...topLevelIndices);
          const newSubQueue: SubQueue = {
            isSubQueue: true,
            id: genId(),
            label,
            repeatCount: 1,
            items: promoted,
            collapsed: false,
          };
          const result = [...remaining];
          result.splice(Math.min(firstIdx, result.length), 0, newSubQueue);
          return { reviewQueue: result };
        }),

      moveQueueItem: (from, to) =>
        set((state) => {
          // 1. Extract the item from its source
          let item: ReviewQueueItem | null = null;
          let queue: QueueEntry[];

          if (from.type === "top") {
            const entry = state.reviewQueue[from.index];
            if (!entry || isSubQueue(entry)) return state;
            item = entry as ReviewQueueItem;
            queue = state.reviewQueue.filter((_, i) => i !== from.index);
          } else {
            const sq = state.reviewQueue.find(
              (e) => isSubQueue(e) && (e as SubQueue).id === from.subQueueId
            ) as SubQueue | undefined;
            if (!sq || from.index < 0 || from.index >= sq.items.length) return state;
            item = sq.items[from.index];
            queue = state.reviewQueue.map((e) => {
              if (!isSubQueue(e) || (e as SubQueue).id !== from.subQueueId) return e;
              return { ...(e as SubQueue), items: (e as SubQueue).items.filter((_, i) => i !== from.index) };
            });
          }

          if (!item) return state;

          // 2. Insert at the destination
          if (to.type === "top") {
            let idx = to.index;
            if (from.type === "top" && from.index < to.index) idx = Math.max(0, idx - 1);
            idx = Math.max(0, Math.min(idx, queue.length));
            const result = [...queue];
            result.splice(idx, 0, item);
            return { reviewQueue: result };
          } else {
            return {
              reviewQueue: queue.map((e) => {
                if (!isSubQueue(e) || (e as SubQueue).id !== to.subQueueId) return e;
                const sq = e as SubQueue;
                const items = [...sq.items];
                let idx = to.append ? items.length : to.index;
                idx = Math.max(0, Math.min(idx, items.length));
                items.splice(idx, 0, item!);
                return { ...sq, items };
              }),
            };
          }
        }),

      renameSubQueue: (id, label) =>
        set((state) => ({
          reviewQueue: state.reviewQueue.map((e) =>
            isSubQueue(e) && (e as SubQueue).id === id ? { ...e, label } : e
          ),
        })),

      setPlaybackRate: (rate) => set({ playbackRate: rate }),

      setSelectedReciterId: (id) =>
        set({ selectedReciterId: getReciter(id).id }),

      targetScrollAyah: null,
      setTargetScrollAyah: (targetScrollAyah) => set({ targetScrollAyah }),
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
        playbackRate: state.playbackRate,
        selectedReciterId: state.selectedReciterId,
        darkMode: state.darkMode,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        state.queueRepeatAll = clampRepeat(state.queueRepeatAll);
        state.reviewQueue = state.reviewQueue.map((entry) => clampEntry(entry as QueueEntry));
        state.selectedReciterId = getReciter(state.selectedReciterId).id;
        document.documentElement.classList.toggle("dark", !!state.darkMode);
      },
    }
  )
);
