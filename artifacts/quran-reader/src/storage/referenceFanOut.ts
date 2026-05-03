import { findPage, getSurahMeta } from "quran-meta/hafs";

export interface PageAyahGroup {
  surah: number;
  page: number;
  ayahs: number[];
}

const SURAH_AYAH_COUNT: Record<number, number> = {};
for (let s = 1; s <= 114; s++) {
  const sm = getSurahMeta(s as never) as unknown as { ayahCount?: number; numAyah?: number; numberOfAyahs?: number };
  SURAH_AYAH_COUNT[s] = Number(sm.ayahCount ?? sm.numAyah ?? sm.numberOfAyahs ?? 0) || 0;
}

function pageOf(surah: number, ayah: number): number {
  const m = findPage(surah as never, ayah as never);
  return typeof m === "number" ? m : (m as { page: number }).page;
}

function pushAyah(groups: PageAyahGroup[], surah: number, ayah: number) {
  const page = pageOf(surah, ayah);
  const last = groups[groups.length - 1];
  if (last && last.surah === surah && last.page === page) last.ayahs.push(ayah);
  else groups.push({ surah, page, ayahs: [ayah] });
}

export function getAyahsForReference(reference: string): PageAyahGroup[] {
  const parts = reference.split(":");
  const type = parts[0];
  const groups: PageAyahGroup[] = [];

  if (type === "ayah") {
    const surah = parseInt(parts[1] || "1", 10);
    const ayahPart = parts[2] || "1";
    const rangeParts = ayahPart.split("-");
    const from = parseInt(rangeParts[0], 10) || 1;
    const to = rangeParts.length > 1 ? (parseInt(rangeParts[1], 10) || from) : from;
    for (let a = from; a <= to; a++) pushAyah(groups, surah, a);
    return groups;
  }

  if (type === "surah") {
    const surahVal = parts[1] || "1";
    const sParts = surahVal.split("-");
    const sFrom = parseInt(sParts[0], 10) || 1;
    const sTo = sParts.length > 1 ? (parseInt(sParts[1], 10) || sFrom) : sFrom;
    if (parts[2]) {
      const ayahRangeParts = parts[2].split("-");
      const aFrom = parseInt(ayahRangeParts[0], 10) || 1;
      const aTo = ayahRangeParts.length > 1 ? (parseInt(ayahRangeParts[1], 10) || aFrom) : aFrom;
      for (let a = aFrom; a <= aTo; a++) pushAyah(groups, sFrom, a);
      return groups;
    }
    for (let s = sFrom; s <= Math.min(sTo, 114); s++) {
      const cnt = SURAH_AYAH_COUNT[s] || 0;
      for (let a = 1; a <= cnt; a++) pushAyah(groups, s, a);
    }
    return groups;
  }

  if (type === "page") {
    const val = parts[1] || "1";
    const rangeParts = val.split("-");
    const from = parseInt(rangeParts[0], 10) || 1;
    const to = rangeParts.length > 1 ? (parseInt(rangeParts[1], 10) || from) : from;
    const pageSet = new Set<number>();
    for (let p = from; p <= to; p++) pageSet.add(p);
    for (let s = 1; s <= 114; s++) {
      const cnt = SURAH_AYAH_COUNT[s] || 0;
      for (let a = 1; a <= cnt; a++) {
        const p = pageOf(s, a);
        if (pageSet.has(p)) pushAyah(groups, s, a);
      }
    }
    return groups;
  }

  return groups;
}
