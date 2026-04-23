import type {
  AlQuranPageResponse,
  QuranPage,
  AudioDataMap,
  QuranAyah,
  QuranWord,
  MushafApiResponse,
  MushafApiVerse,
  MushafWord,
  MushafLine,
  MushafPageData,
  ChapterMap,
} from "../types/quran";

const ALQURAN_BASE = "https://api.alquran.cloud/v1";
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
    map[ch.id] = {
      id: ch.id,
      nameArabic: ch.name_arabic,
      nameSimple: ch.name_simple,
      nameTranslation: ch.translated_name?.name ?? "",
      versesCount: ch.verses_count,
    };
  }
  chaptersCache = map;
  return map;
}

// ── Reading mode (AlQuran.cloud) ────────────────────────────────────────────────

function splitAyahIntoWords(
  text: string,
  surahNumber: number,
  ayahNumber: number,
  audioData: AudioDataMap
): QuranWord[] {
  const key = `${surahNumber}:${ayahNumber}`;
  const ayahAudio = audioData[key];
  const rawWords = text.split(" ").filter((w) => w.trim().length > 0);

  return rawWords.map((wordText, index) => {
    const wordIndex = index + 1;
    const spanId = `${surahNumber}:${ayahNumber}:${wordIndex}`;
    const hasAudio = !!(
      ayahAudio && ayahAudio.segments.some((seg) => seg[0] === wordIndex)
    );
    return { text: wordText, wordIndex, surahNumber, ayahNumber, spanId, hasAudio };
  });
}

export async function fetchQuranPage(pageNumber: number): Promise<QuranPage> {
  const [apiRes, audioData] = await Promise.all([
    fetch(`${ALQURAN_BASE}/page/${pageNumber}/quran-uthmani`).then(
      (r) => r.json() as Promise<AlQuranPageResponse>
    ),
    loadAudioData(),
  ]);

  if (apiRes.code !== 200) {
    throw new Error(`AlQuran.cloud API error: ${apiRes.status}`);
  }

  const ayahs: QuranAyah[] = apiRes.data.ayahs.map((a) => {
    const words = splitAyahIntoWords(a.text, a.surah.number, a.numberInSurah, audioData);
    return {
      number: a.number,
      numberInSurah: a.numberInSurah,
      text: a.text,
      surah: {
        number: a.surah.number,
        name: a.surah.name,
        englishName: a.surah.englishName,
        englishNameTranslation: a.surah.englishNameTranslation,
        revelationType: a.surah.revelationType,
      },
      juz: a.juz,
      page: a.page,
      words,
    };
  });

  return { pageNumber, ayahs };
}

// ── Mushaf mode (Quran.com) ─────────────────────────────────────────────────────

async function fetchMushafVerses(pageNumber: number): Promise<MushafApiVerse[]> {
  const fields = "text_uthmani,line_number,page_number,location,char_type_name";
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

function parseLocation(location: string): [number, number, number] {
  const parts = location.split(":").map(Number);
  return [parts[0], parts[1], parts[2]];
}

export async function fetchMushafPage(pageNumber: number): Promise<MushafPageData> {
  const [verses, chapters] = await Promise.all([
    fetchMushafVerses(pageNumber),
    loadChapters(),
  ]);

  // Map words into a line → words structure
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

  // Determine the first line number that has actual content
  const usedLineNumbers = Array.from(lineMap.keys()).sort((a, b) => a - b);
  const firstContentLine = usedLineNumbers[0] ?? 1;

  // Determine if this page starts a new surah (empty header lines before content)
  const firstVerse = verses[0];
  const [firstSurahNum, firstVerseNum] = firstVerse
    ? parseSurahAyah(firstVerse.verse_key)
    : [1, 1];

  const emptyHeaderLineCount = firstContentLine - 1;
  // Show surah header only when there are empty leading lines AND the page starts a surah
  const hasSurahHeader = emptyHeaderLineCount > 0 && firstVerseNum <= 2;

  const chapter = chapters[firstSurahNum];
  const surahName = chapter?.nameArabic ?? "";
  const surahEnglishName = chapter?.nameSimple ?? "";
  const showBismillah = firstSurahNum !== 9 && firstSurahNum !== 1;

  // Build the 15 lines
  const lines: MushafLine[] = [];

  for (let ln = 1; ln <= 15; ln++) {
    if (hasSurahHeader && ln <= emptyHeaderLineCount) {
      // Distribute header content across empty lines
      if (emptyHeaderLineCount === 1) {
        // Single header line: surah name only
        lines.push({
          lineNumber: ln,
          words: [],
          headerType: "surah-name",
          surahName,
          surahEnglishName,
        });
      } else {
        // Multiple header lines: name on first line(s), bismillah on last
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
