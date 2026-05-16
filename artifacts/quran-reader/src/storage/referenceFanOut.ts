import { findPage, getSurahMeta, getAyahCountInSurah } from "quran-meta/hafs";

export interface PageAyahGroup {
  surah: number;
  page: number;
  ayahs: number[];
}

const SURAH_AYAH_COUNT: Record<number, number> = {};
for (let s = 1; s <= 114; s++) {
  try {
    const direct = (getAyahCountInSurah as (s: number) => number)(s);
    if (typeof direct === "number" && direct > 0) {
      SURAH_AYAH_COUNT[s] = direct;
      continue;
    }
  } catch { /* ignore */ }
  try {
    const sm = getSurahMeta(s as never) as unknown as { ayahCount?: number; numAyah?: number; numberOfAyahs?: number };
    SURAH_AYAH_COUNT[s] = Number(sm?.ayahCount ?? sm?.numAyah ?? sm?.numberOfAyahs ?? 0) || 0;
  } catch {
    SURAH_AYAH_COUNT[s] = 0;
  }
}

function pageOf(surah: number, ayah: number): number | null {
  try {
    const m = findPage(surah as never, ayah as never);
    const p = typeof m === "number" ? m : (m as { page: number }).page;
    return typeof p === "number" && isFinite(p) ? p : null;
  } catch {
    return null;
  }
}

function pushAyah(groups: PageAyahGroup[], surah: number, ayah: number) {
  const page = pageOf(surah, ayah);
  if (page === null) return;
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
    const maxAyah = SURAH_AYAH_COUNT[surah] || 0;
    if (maxAyah === 0) return groups;
    const clampedFrom = Math.max(1, from);
    const clampedTo = Math.min(to, maxAyah);
    for (let a = clampedFrom; a <= clampedTo; a++) pushAyah(groups, surah, a);
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
      const maxAyah = SURAH_AYAH_COUNT[sFrom] || 0;
      if (maxAyah === 0) return groups;
      const clampedFrom = Math.max(1, aFrom);
      const clampedTo = Math.min(aTo, maxAyah);
      for (let a = clampedFrom; a <= clampedTo; a++) pushAyah(groups, sFrom, a);
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
        if (p !== null && pageSet.has(p)) pushAyah(groups, s, a);
      }
    }
    return groups;
  }

  return groups;
}
