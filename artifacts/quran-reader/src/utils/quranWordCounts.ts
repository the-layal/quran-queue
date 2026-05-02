/**
 * Lazy-loaded cache of the maximum (last) word index for every ayah.
 * Derived from the same quran-segments-data.json used by audio playback.
 * Each entry is the count of words in that ayah (= max segment word index).
 *
 * The data is fetched once on first call to preloadWordCounts() and cached
 * for the lifetime of the page.  Callers that need synchronous access should
 * call preloadWordCounts() early (e.g. at module level) and handle the null
 * fallback for the brief window before the data arrives.
 */

let wordCountCache: Map<string, number> | null = null;
let loadPromise: Promise<void> | null = null;

function doLoad(): Promise<void> {
  const base = import.meta.env.BASE_URL;
  const url = `${base}quran-segments-data.json`.replace(/\/\//g, "/");
  return fetch(url)
    .then((r) => r.json())
    .then(
      (data: Record<string, { segments: [number, number, number][] }>) => {
        const map = new Map<string, number>();
        for (const [key, val] of Object.entries(data)) {
          if (val.segments && val.segments.length > 0) {
            const maxWi = val.segments.reduce(
              (m: number, s: [number, number, number]) => Math.max(m, s[0]),
              0
            );
            map.set(key, maxWi);
          }
        }
        wordCountCache = map;
      }
    )
    .catch(() => {
      // Silently fail — callers fall back safely when cache is null.
    });
}

/** Kick off the background load (idempotent — safe to call multiple times). */
export function preloadWordCounts(): void {
  if (!loadPromise) loadPromise = doLoad();
}

/**
 * Returns the number of words in the given ayah, or null if the data has not
 * finished loading yet.  Callers should treat null as "unknown" and fall back
 * to a conservative (non-merging) default.
 */
export function getAyahWordCount(surah: number, ayah: number): number | null {
  return wordCountCache?.get(`${surah}:${ayah}`) ?? null;
}
