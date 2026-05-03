import type {
  AudioDataMap,
  SurahAudioEntry,
  QuranAyah,
  QuranWord,
  SurahData,
  MushafApiResponse,
  MushafApiVerse,
  MushafWord,
  MushafLine,
  MushafPageData,
  ChapterMap,
} from "../types/quran";
import { DEFAULT_RECITER_ID, getReciter } from "../data/reciters";

const QURANCOM_BASE = "https://api.quran.com/api/v4";
const BISMILLAH = "بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ";

// ── Audio data ──────────────────────────────────────────────────────────────────

const audioDataCacheByReciter = new Map<string, AudioDataMap>();
const audioDataPromiseByReciter = new Map<string, Promise<AudioDataMap>>();

interface SegmentEntry {
  segments: [number, number, number][];
  duration_sec: number;
  duration_ms: number;
  timestamp_from: number;
  timestamp_to: number;
}

interface AyahMp3Entry {
  surah_number: number;
  ayah_number: number;
  audio_url: string;
  duration: number | null;
  segments: [number, number, number][];
}

export async function loadAudioData(
  reciterId: string = DEFAULT_RECITER_ID
): Promise<AudioDataMap> {
  const cached = audioDataCacheByReciter.get(reciterId);
  if (cached) return cached;

  // Coalesce concurrent loads for the same reciter so we only fetch once.
  const inFlight = audioDataPromiseByReciter.get(reciterId);
  if (inFlight) return inFlight;

  const reciter = getReciter(reciterId);
  const base = import.meta.env.BASE_URL;
  const fix = (path: string) => `${base}${path}`.replace(/\/\//g, "/");

  const promise = (async (): Promise<AudioDataMap> => {
    let map: AudioDataMap;

    if (reciter.dataFormat === "surah-mp3") {
      if (!reciter.audioManifestPath) {
        throw new Error(
          `Reciter "${reciter.id}" has dataFormat "surah-mp3" but no audioManifestPath`
        );
      }
      const [segRes, surahRes] = await Promise.all([
        fetch(fix(reciter.dataPath)),
        fetch(fix(reciter.audioManifestPath)),
      ]);
      if (!segRes.ok)
        throw new Error(`Failed to load segments for reciter ${reciter.id}`);
      if (!surahRes.ok)
        throw new Error(
          `Failed to load surah audio manifest for reciter ${reciter.id}`
        );

      const segments: Record<string, SegmentEntry> = await segRes.json();
      const surahAudio: Record<string, SurahAudioEntry> = await surahRes.json();

      map = {};
      for (const [key, seg] of Object.entries(segments)) {
        const [surahStr, ayahStr] = key.split(":");
        const surahEntry = surahAudio[surahStr];
        map[key] = {
          surah_number: Number(surahStr),
          ayah_number: Number(ayahStr),
          audio_url: surahEntry?.audio_url ?? "",
          duration: seg.duration_ms,
          segments: seg.segments,
          timestamp_from: seg.timestamp_from,
          timestamp_to: seg.timestamp_to,
        };
      }
    } else {
      // ayah-mp3 format: one MP3 per ayah, segments relative to that MP3.
      const res = await fetch(fix(reciter.dataPath));
      if (!res.ok)
        throw new Error(`Failed to load reciter audio data for ${reciter.id}`);

      const raw: Record<string, AyahMp3Entry> = await res.json();
      map = {};
      for (const [key, entry] of Object.entries(raw)) {
        const segments = entry.segments ?? [];
        const maxSegEnd = segments.reduce((m, s) => Math.max(m, s[2]), 0);
        const durationMs = entry.duration != null ? entry.duration * 1000 : null;
        // Use the larger of (max segment end ms) and (duration*1000) so we never
        // truncate audio that extends past the last word's end timestamp.
        const timestampTo = Math.max(maxSegEnd, durationMs ?? 0);
        map[key] = {
          surah_number: entry.surah_number,
          ayah_number: entry.ayah_number,
          audio_url: entry.audio_url,
          duration: durationMs,
          segments,
          timestamp_from: 0,
          timestamp_to: timestampTo,
        };
      }
    }

    audioDataCacheByReciter.set(reciterId, map);
    return map;
  })();

  audioDataPromiseByReciter.set(reciterId, promise);
  try {
    return await promise;
  } finally {
    audioDataPromiseByReciter.delete(reciterId);
  }
}

// ── Chapters cache ──────────────────────────────────────────────────────────────

let chaptersCache: ChapterMap | null = null;

export async function loadChapters(): Promise<ChapterMap> {
  if (chaptersCache) return chaptersCache;
  const res = await fetch(`${QURANCOM_BASE}/chapters?language=en`);
  if (!res.ok) throw new Error("Failed to load chapters");
  const data = await res.json();
  const map: ChapterMap = {};
  for (const ch of data.chapters) {
    const pages = ch.pages;
    const mushafStartPage = Array.isArray(pages) ? pages[0] : (pages?.first ?? 1);
    map[ch.id] = {
      id: ch.id,
      nameArabic: ch.name_arabic,
      nameSimple: ch.name_simple,
      nameTranslation: ch.translated_name?.name ?? "",
      versesCount: ch.verses_count,
      revelationPlace: ch.revelation_place ?? "makkah",
      mushafStartPage,
    };
  }
  chaptersCache = map;
  return map;
}

// ── Helpers ─────────────────────────────────────────────────────────────────────

function parseLocation(location: string): [number, number, number] {
  const parts = location.split(":").map(Number);
  return [parts[0], parts[1], parts[2]];
}

// ── Surah reading mode (Quran.com verses by chapter) ────────────────────────────

interface QuranComSurahWord {
  id: number;
  position: number;
  char_type_name: "word" | "end";
  text_uthmani: string;
  code_v2: string;
  location: string;
  page_number?: number;
  transliteration?: { text: string | null; language_name: string };
}

interface QuranComSurahVerse {
  id: number;
  verse_number: number;
  verse_key: string;
  page_number: number;
  juz_number: number;
  hizb_number?: number;
  words: QuranComSurahWord[];
}

interface QuranComSurahResponse {
  verses: QuranComSurahVerse[];
  pagination: {
    per_page: number;
    current_page: number;
    next_page: number | null;
    total_pages: number;
    total_records: number;
  };
}

export async function fetchSurahVerses(surahNumber: number): Promise<SurahData> {
  const [audioData, chapters] = await Promise.all([loadAudioData(), loadChapters()]);

  const allVerses: QuranComSurahVerse[] = [];
  let apiPage = 1;

  while (true) {
    const url =
      `${QURANCOM_BASE}/verses/by_chapter/${surahNumber}` +
      `?words=true&word_fields=text_uthmani,code_v2,location,page_number,transliteration&per_page=50&page=${apiPage}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Quran.com API error: ${res.status}`);
    const data: QuranComSurahResponse = await res.json();
    allVerses.push(...data.verses);
    if (data.pagination.next_page === null) break;
    apiPage++;
  }

  const chapter = chapters[surahNumber];
  const revelationType =
    chapter?.revelationPlace === "madinah" ? "Medinan" : "Meccan";

  const ayahs: QuranAyah[] = allVerses.map((verse) => {
    const [s, a] = verse.verse_key.split(":").map(Number);
    const audioKey = `${s}:${a}`;
    const ayahAudio = audioData[audioKey];

    const endWord = verse.words.find((w) => w.char_type_name === "end");

    const words: QuranWord[] = verse.words
      .filter((w) => w.char_type_name === "word")
      .map((w) => {
        const [, , wordIndex] = parseLocation(w.location);
        const spanId = `${s}:${a}:${wordIndex}`;
        const hasAudio = !!(
          ayahAudio && ayahAudio.segments.some((seg) => seg[0] === wordIndex)
        );
        return {
          text: w.text_uthmani,
          codeV2: w.code_v2 ?? w.text_uthmani,
          pageNumber: w.page_number ?? verse.page_number,
          wordIndex,
          surahNumber: s,
          ayahNumber: a,
          spanId,
          hasAudio,
          transliteration: w.transliteration?.text ?? undefined,
        };
      });

    const transliteration =
      words.map((w) => w.transliteration ?? "").filter(Boolean).join(" ").trim() || undefined;

    return {
      number: verse.id,
      numberInSurah: verse.verse_number,
      text: words.map((w) => w.text).join(" "),
      surah: {
        number: surahNumber,
        name: chapter?.nameArabic ?? "",
        englishName: chapter?.nameSimple ?? "",
        englishNameTranslation: chapter?.nameTranslation ?? "",
        revelationType,
      },
      juz: verse.juz_number,
      hizb: verse.hizb_number ?? 0,
      page: verse.page_number,
      words,
      endMarkerCodeV2: endWord?.code_v2 ?? "",
      endMarkerPageNumber: endWord?.page_number ?? verse.page_number,
      transliteration,
    };
  });

  return { surahNumber, ayahs };
}

// ── Mushaf mode (Quran.com) ─────────────────────────────────────────────────────

async function fetchMushafVerses(pageNumber: number): Promise<MushafApiVerse[]> {
  const fields = "text_uthmani,line_number,page_number,location,char_type_name,code_v2";
  const allVerses: MushafApiVerse[] = [];
  let page = 1;

  while (true) {
    const url =
      `${QURANCOM_BASE}/verses/by_page/${pageNumber}` +
      `?words=true&word_fields=${fields}&per_page=50&page=${page}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Quran.com API error: ${res.status}`);
    const data: MushafApiResponse = await res.json();
    allVerses.push(...data.verses);
    if (data.pagination.next_page === null) break;
    page++;
  }

  return allVerses;
}

function parseSurahAyah(verseKey: string): [number, number] {
  const [s, a] = verseKey.split(":").map(Number);
  return [s, a];
}

export async function fetchMushafPage(pageNumber: number): Promise<MushafPageData> {
  const [verses, chapters] = await Promise.all([
    fetchMushafVerses(pageNumber),
    loadChapters(),
  ]);

  const lineMap = new Map<number, MushafWord[]>();

  for (const verse of verses) {
    for (const word of verse.words) {
      const [s, a, wp] = parseLocation(word.location);
      const mushafWord: MushafWord = {
        text: word.text_uthmani,
        charType: word.char_type_name,
        surahNumber: s,
        ayahNumber: a,
        wordIndex: wp,
        spanId: `${s}:${a}:${wp}`,
        lineNumber: word.line_number,
      };
      if (!lineMap.has(word.line_number)) lineMap.set(word.line_number, []);
      lineMap.get(word.line_number)!.push(mushafWord);
    }
  }

  const usedLineNumbers = Array.from(lineMap.keys()).sort((a, b) => a - b);
  const firstContentLine = usedLineNumbers[0] ?? 1;

  const firstVerse = verses[0];
  const [firstSurahNum, firstVerseNum] = firstVerse
    ? parseSurahAyah(firstVerse.verse_key)
    : [1, 1];

  const emptyHeaderLineCount = firstContentLine - 1;
  const hasSurahHeader = emptyHeaderLineCount > 0 && firstVerseNum <= 2;

  const chapter = chapters[firstSurahNum];
  const surahName = chapter?.nameArabic ?? "";
  const surahEnglishName = chapter?.nameSimple ?? "";
  const showBismillah = firstSurahNum !== 9 && firstSurahNum !== 1;

  const lines: MushafLine[] = [];

  for (let ln = 1; ln <= 15; ln++) {
    if (hasSurahHeader && ln <= emptyHeaderLineCount) {
      if (emptyHeaderLineCount === 1) {
        lines.push({
          lineNumber: ln,
          words: [],
          headerType: "surah-name",
          surahName,
          surahEnglishName,
        });
      } else {
        if (ln < emptyHeaderLineCount) {
          lines.push({
            lineNumber: ln,
            words: [],
            headerType: "surah-name",
            surahName,
            surahEnglishName,
          });
        } else {
          lines.push({
            lineNumber: ln,
            words: [],
            headerType: "bismillah",
            surahName: showBismillah ? BISMILLAH : surahName,
            surahEnglishName: showBismillah ? "" : surahEnglishName,
          });
        }
      }
    } else {
      lines.push({
        lineNumber: ln,
        words: lineMap.get(ln) ?? [],
      });
    }
  }

  return { pageNumber, lines };
}

export const TOTAL_PAGES = 604;
export const TOTAL_SURAHS = 114;

// ── Page transliterations (mushaf popover) ───────────────────────────────────
// Lazy fetch + module-level cache, separate from SVG rendering.
// Returns a map "S:A" → concatenated transliteration string for every ayah on
// the requested page.
//
// Source: Quran.com `verses/by_page` with `word_fields=transliteration`. We
// concatenate per-word transliterations (filtering null end-marker words) into
// a single ayah string. This is the same source used by Quran.com itself
// (community-maintained, free to use) and matches the per-word transliteration
// already returned by `fetchSurahVerses` for reading mode, so the two surfaces
// stay text-consistent.

const pageTransliterationsCache = new Map<number, Record<string, string>>();
const pageTransliterationsPromise = new Map<number, Promise<Record<string, string>>>();

interface QuranComTransliterationWord {
  char_type_name: "word" | "end";
  location: string;
  transliteration?: { text: string | null; language_name: string };
}

interface QuranComTransliterationVerse {
  verse_key: string;
  words: QuranComTransliterationWord[];
}

interface QuranComTransliterationResponse {
  verses: QuranComTransliterationVerse[];
  pagination: { next_page: number | null };
}

export async function fetchPageTransliterations(
  pageNumber: number
): Promise<Record<string, string>> {
  const cached = pageTransliterationsCache.get(pageNumber);
  if (cached) return cached;
  const inFlight = pageTransliterationsPromise.get(pageNumber);
  if (inFlight) return inFlight;

  const promise = (async () => {
    const result: Record<string, string> = {};
    let page = 1;
    while (true) {
      const url =
        `${QURANCOM_BASE}/verses/by_page/${pageNumber}` +
        `?words=true&word_fields=transliteration,location&per_page=50&page=${page}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Quran.com API error: ${res.status}`);
      const data: QuranComTransliterationResponse = await res.json();
      for (const verse of data.verses) {
        const parts: string[] = [];
        for (const w of verse.words) {
          if (w.char_type_name === "word" && w.transliteration?.text) {
            parts.push(w.transliteration.text);
          }
        }
        if (parts.length) result[verse.verse_key] = parts.join(" ");
      }
      if (data.pagination.next_page === null) break;
      page++;
    }
    pageTransliterationsCache.set(pageNumber, result);
    return result;
  })();

  pageTransliterationsPromise.set(pageNumber, promise);
  try {
    return await promise;
  } finally {
    pageTransliterationsPromise.delete(pageNumber);
  }
}
