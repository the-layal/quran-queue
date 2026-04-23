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
  page: number;
  words: QuranWord[];
}

export interface QuranPage {
  pageNumber: number;
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
