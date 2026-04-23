import type { AlQuranPageResponse, QuranPage, AudioDataMap, QuranAyah, QuranWord } from "../types/quran";

const ALQURAN_BASE = "https://api.alquran.cloud/v1";

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
    const hasAudio = !!(ayahAudio && ayahAudio.segments.some((seg) => seg[0] === wordIndex));
    return {
      text: wordText,
      wordIndex,
      surahNumber,
      ayahNumber,
      spanId,
      hasAudio,
    };
  });
}

export async function fetchQuranPage(pageNumber: number): Promise<QuranPage> {
  const [apiRes, audioData] = await Promise.all([
    fetch(`${ALQURAN_BASE}/page/${pageNumber}/quran-uthmani`).then((r) => r.json() as Promise<AlQuranPageResponse>),
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

export const TOTAL_PAGES = 604;
