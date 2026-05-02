export type ReciterDataFormat = "surah-mp3" | "ayah-mp3";

export interface Reciter {
  id: string;
  nameEn: string;
  nameAr: string;
  style: "murattal";
  dataFormat: ReciterDataFormat;
  dataPath: string;
  audioManifestPath?: string;
}

export const DEFAULT_RECITER_ID = "husary";

export const RECITERS: Reciter[] = [
  {
    id: "husary",
    nameEn: "Mahmoud Khalil Al-Husary",
    nameAr: "محمود خليل الحصري",
    style: "murattal",
    dataFormat: "ayah-mp3",
    dataPath: "reciters/husary.json",
  },
  {
    id: "alafasy",
    nameEn: "Mishary Rashid Alafasy",
    nameAr: "مشاري راشد العفاسي",
    style: "murattal",
    dataFormat: "surah-mp3",
    dataPath: "quran-segments-data.json",
    audioManifestPath: "quran-surah-audio.json",
  },
  {
    id: "abdul-basit",
    nameEn: "Abdul Basit Abd us-Samad",
    nameAr: "عبد الباسط عبد الصمد",
    style: "murattal",
    dataFormat: "ayah-mp3",
    dataPath: "reciters/abdul-basit.json",
  },
  {
    id: "maher-muaiqly",
    nameEn: "Maher Al-Mu'aiqly",
    nameAr: "ماهر المعيقلي",
    style: "murattal",
    dataFormat: "ayah-mp3",
    dataPath: "reciters/maher-muaiqly.json",
  },
  {
    id: "hani-rifai",
    nameEn: "Hani Ar-Rifai",
    nameAr: "هاني الرفاعي",
    style: "murattal",
    dataFormat: "ayah-mp3",
    dataPath: "reciters/hani-rifai.json",
  },
  {
    id: "ghamdi",
    nameEn: "Saad Al-Ghamdi",
    nameAr: "سعد الغامدي",
    style: "murattal",
    dataFormat: "ayah-mp3",
    dataPath: "reciters/ghamdi.json",
  },
];

const RECITERS_BY_ID = new Map(RECITERS.map((r) => [r.id, r]));

export function getReciter(id: string): Reciter {
  return RECITERS_BY_ID.get(id) ?? RECITERS_BY_ID.get(DEFAULT_RECITER_ID)!;
}
