import type {
  AudioDataMap,
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

const QURANCOM_BASE = "https://api.quran.com/api/v4";
const BISMILLAH = "بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ";

// ── Audio data ──────────────────────────────────────────────────────────────────

let audioDataCache: AudioDataMap | null = null;

export async function loadAudioData(): Promise<AudioDataMap> {
  if (audioDataCache) return audioDataCache;
  const base = import.meta.env.BASE_URL;
  const url = `${base}quran-audio-data.json`.replace(/\/\//g, "/");
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to load audio data");
  audioDataCache = await res.json();
  return audioDataCache!;
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
  location: string;
  page_number?: number;
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
      `?words=true&word_fields=text_uthmani,location,page_number&per_page=50&page=${apiPage}`;
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
          wordIndex,
          surahNumber: s,
          ayahNumber: a,
          spanId,
          hasAudio,
        };
      });

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
      page: verse.page_number,
      words,
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
