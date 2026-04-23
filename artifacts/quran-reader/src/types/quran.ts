export interface AudioSegment {
  wordIndex: number;
  startMs: number;
  endMs: number;
}

export interface AyahAudioData {
  surah_number: number;
  ayah_number: number;
  audio_url: string;
  duration: number | null;
  segments: [number, number, number][];
}

export type AudioDataMap = Record<string, AyahAudioData>;

export interface QuranWord {
  text: string;
  wordIndex: number;
  surahNumber: number;
  ayahNumber: number;
  spanId: string;
  hasAudio: boolean;
}

export interface QuranAyah {
  number: number;
  numberInSurah: number;
  text: string;
  surah: {
    number: number;
    name: string;
    englishName: string;
    englishNameTranslation: string;
    revelationType: string;
  };
  juz: number;
  hizb: number;
  page: number;
  words: QuranWord[];
}

export interface QuranPage {
  pageNumber: number;
  ayahs: QuranAyah[];
}

export interface SurahData {
  surahNumber: number;
  ayahs: QuranAyah[];
}

export interface AlQuranApiAyah {
  number: number;
  text: string;
  surah: {
    number: number;
    name: string;
    englishName: string;
    englishNameTranslation: string;
    numberOfAyahs: number;
    revelationType: string;
  };
  numberInSurah: number;
  juz: number;
  manzil: number;
  page: number;
  ruku: number;
  hizbQuarter: number;
  sajda: boolean | { id: number; recommended: boolean; obligatory: boolean };
}

export interface AlQuranPageResponse {
  code: number;
  status: string;
  data: {
    ayahs: AlQuranApiAyah[];
    edition: {
      identifier: string;
      language: string;
      name: string;
      englishName: string;
      format: string;
      type: string;
      direction: string;
    };
  };
}

export interface Settings {
  fontSize: number;
  showTranslation: boolean;
}

export interface ChapterInfo {
  id: number;
  nameArabic: string;
  nameSimple: string;
  nameTranslation: string;
  versesCount: number;
  revelationPlace: string;
  mushafStartPage: number;
}

export type ChapterMap = Record<number, ChapterInfo>;

export type ViewMode = "reading" | "mushaf";

export interface MushafApiWord {
  id: number;
  position: number;
  char_type_name: "word" | "end";
  text_uthmani: string;
  line_number: number;
  location: string;
  page_number: number;
}

export interface MushafApiVerse {
  id: number;
  verse_number: number;
  verse_key: string;
  page_number: number;
  juz_number: number;
  words: MushafApiWord[];
}

export interface MushafApiResponse {
  verses: MushafApiVerse[];
  pagination: {
    per_page: number;
    current_page: number;
    next_page: number | null;
    total_pages: number;
    total_records: number;
  };
}

export interface MushafWord {
  text: string;
  charType: "word" | "end";
  surahNumber: number;
  ayahNumber: number;
  wordIndex: number;
  spanId: string;
  lineNumber: number;
}

export type MushafHeaderType = "surah-name" | "bismillah";

export interface MushafLine {
  lineNumber: number;
  words: MushafWord[];
  headerType?: MushafHeaderType;
  surahName?: string;
  surahEnglishName?: string;
}

export interface MushafPageData {
  pageNumber: number;
  lines: MushafLine[];
}
