import { findPage as qmFindPage, getSurahMeta as qmGetSurahMeta } from "quran-meta/hafs";

const AYAHS_ON_PAGE: Record<number, number> = {};
const SURAH_PAGE_SPANS: Record<number, { ayahCount: number; startPage: number; endPage: number; pages: number }> = {};

function findPage(surah: number, ayah: number): number {
  const m = qmFindPage(surah as never, ayah as never);
  return typeof m === "number" ? m : (m as { page: number }).page;
}

function surahAyahCount(s: number): number {
  const sm = qmGetSurahMeta(s as never) as unknown as { ayahCount?: number; numAyah?: number; numberOfAyahs?: number; [k: string]: unknown };
  return Number(sm.ayahCount ?? sm.numAyah ?? sm.numberOfAyahs ?? 0) || 0;
}

for (let s = 1; s <= 114; s++) {
  const ayahCount = surahAyahCount(s);
  for (let a = 1; a <= ayahCount; a++) {
    try {
      const p = findPage(s, a);
      AYAHS_ON_PAGE[p] = (AYAHS_ON_PAGE[p] || 0) + 1;
    } catch {
      // ignore
    }
  }
}

for (let s = 1; s <= 114; s++) {
  const ayahCount = surahAyahCount(s);
  const sm = { ayahCount };
  let startPage: number;
  let endPage: number;
  try {
    startPage = findPage(s, 1);
    endPage = findPage(s, sm.ayahCount);
  } catch {
    startPage = 1;
    endPage = 1;
  }
  const ayahsByPage: Record<number, number> = {};
  for (let a = 1; a <= sm.ayahCount; a++) {
    try {
      const p = findPage(s, a);
      ayahsByPage[p] = (ayahsByPage[p] || 0) + 1;
    } catch {
      // ignore
    }
  }
  let fractionalPages = 0;
  for (const [pageStr, count] of Object.entries(ayahsByPage)) {
    const page = parseInt(pageStr, 10);
    const totalOnPage = AYAHS_ON_PAGE[page] || count;
    fractionalPages += count / totalOnPage;
  }
  fractionalPages = Math.round(fractionalPages * 100) / 100;
  SURAH_PAGE_SPANS[s] = { ayahCount: sm.ayahCount, startPage, endPage, pages: fractionalPages };
}

export function getPageForAyah(surah: number, ayah: number): number {
  try {
    return findPage(surah, ayah);
  } catch {
    return SURAH_PAGE_SPANS[surah]?.startPage || 1;
  }
}

function ayahFraction(surah: number, ayah: number): number {
  const page = getPageForAyah(surah, ayah);
  const totalOnPage = AYAHS_ON_PAGE[page] || 15;
  return 1 / totalOnPage;
}

function sumAyahFractions(surah: number, fromAyah: number, toAyah: number): number {
  let sum = 0;
  for (let a = fromAyah; a <= toAyah; a++) sum += ayahFraction(surah, a);
  return sum;
}

export function getPageEquivalent(reference: string): number {
  if (!reference) return 1;
  const parts = reference.split(":");
  const type = parts[0];

  if (type === "page") {
    const val = parts[1] || "1";
    const rangeParts = val.split("-");
    const from = parseInt(rangeParts[0], 10) || 1;
    const to = rangeParts.length > 1 ? (parseInt(rangeParts[1], 10) || from) : from;
    return Math.max(1, to - from + 1);
  }

  if (type === "ayah") {
    const surahId = parseInt(parts[1], 10);
    const rangePart = parts[2] || "";
    if (!surahId || !rangePart) return 0;
    const rangeParts = rangePart.split("-");
    const fromAyah = parseInt(rangeParts[0], 10);
    const toAyah = rangeParts.length > 1 ? (parseInt(rangeParts[1], 10) || fromAyah) : fromAyah;
    if (!fromAyah || fromAyah < 1) return 0;
    return Math.round(sumAyahFractions(surahId, fromAyah, toAyah) * 1000) / 1000;
  }

  if (type === "surah") {
    const surahVal = parts[1] || "";
    const surahRangeParts = surahVal.split("-");
    const fromSurah = parseInt(surahRangeParts[0], 10);
    const toSurah = surahRangeParts.length > 1 ? parseInt(surahRangeParts[1], 10) : fromSurah;

    if (!fromSurah || fromSurah < 1 || fromSurah > 114) return 1;

    if (parts[2]) {
      const rangeParts = parts[2].split("-");
      const fromAyah = parseInt(rangeParts[0], 10);
      const toAyah = rangeParts.length > 1 ? (parseInt(rangeParts[1], 10) || fromAyah) : fromAyah;
      if (!fromAyah || fromAyah < 1) return 0;
      return Math.round(sumAyahFractions(fromSurah, fromAyah, toAyah) * 1000) / 1000;
    }

    let total = 0;
    for (let s = fromSurah; s <= Math.min(toSurah, 114); s++) {
      const data = SURAH_PAGE_SPANS[s];
      total += data ? data.pages : 1;
    }
    return total;
  }

  return 1;
}

export function getPagesForReference(reference: string): number[] {
  if (!reference) return [];
  const parts = reference.split(":");
  const type = parts[0];

  if (type === "page") {
    const val = parts[1] || "1";
    const rangeParts = val.split("-");
    const from = parseInt(rangeParts[0], 10) || 1;
    const to = rangeParts.length > 1 ? (parseInt(rangeParts[1], 10) || from) : from;
    const pages: number[] = [];
    for (let p = from; p <= to; p++) pages.push(p);
    return pages;
  }

  if (type === "ayah") {
    const surahId = parseInt(parts[1] || "1", 10);
    const rangePart = parts[2] || "1";
    const rangeParts = rangePart.split("-");
    const fromAyah = parseInt(rangeParts[0], 10) || 1;
    const toAyah = rangeParts.length > 1 ? (parseInt(rangeParts[1], 10) || fromAyah) : fromAyah;
    const pageSet = new Set<number>();
    for (let a = fromAyah; a <= toAyah; a++) pageSet.add(getPageForAyah(surahId, a));
    return Array.from(pageSet).sort((a, b) => a - b);
  }

  if (type === "surah") {
    const surahVal = parts[1] || "";
    const surahRangeParts = surahVal.split("-");
    const fromSurah = parseInt(surahRangeParts[0], 10);
    const toSurah = surahRangeParts.length > 1 ? parseInt(surahRangeParts[1], 10) : fromSurah;
    if (!fromSurah || fromSurah < 1 || fromSurah > 114) return [];

    if (parts[2]) {
      const rangeParts = parts[2].split("-");
      const fromAyah = parseInt(rangeParts[0], 10) || 1;
      const toAyah = rangeParts.length > 1 ? (parseInt(rangeParts[1], 10) || fromAyah) : fromAyah;
      const pageSet = new Set<number>();
      for (let a = fromAyah; a <= toAyah; a++) pageSet.add(getPageForAyah(fromSurah, a));
      return Array.from(pageSet).sort((a, b) => a - b);
    }

    const pageSet = new Set<number>();
    for (let s = fromSurah; s <= Math.min(toSurah, 114); s++) {
      const span = SURAH_PAGE_SPANS[s];
      if (!span) continue;
      for (let p = span.startPage; p <= span.endPage; p++) pageSet.add(p);
    }
    return Array.from(pageSet).sort((a, b) => a - b);
  }

  return [];
}

export function groupConsecutivePages(pages: number[]): string[] {
  if (pages.length === 0) return [];
  const sorted = Array.from(new Set(pages)).sort((a, b) => a - b);
  const ranges: string[] = [];
  let start = sorted[0];
  let end = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === end + 1) {
      end = sorted[i];
    } else {
      ranges.push(start === end ? `page:${start}` : `page:${start}-${end}`);
      start = sorted[i];
      end = sorted[i];
    }
  }
  ranges.push(start === end ? `page:${start}` : `page:${start}-${end}`);
  return ranges;
}

export function getPageCountForReference(ref: string): number {
  const parts = ref.split(":");
  if (parts[0] !== "page") return getPageEquivalent(ref);
  const val = parts[1] || "1";
  const rangeParts = val.split("-");
  const from = parseInt(rangeParts[0], 10) || 1;
  const to = rangeParts.length > 1 ? (parseInt(rangeParts[1], 10) || from) : from;
  return to - from + 1;
}

export interface PageAyahGroup {
  surah: number;
  page: number;
  ayahs: number[];
}

export function getAyahsForReference(reference: string): PageAyahGroup[] {
  const parts = reference.split(":");
  const type = parts[0];
  const groups: PageAyahGroup[] = [];

  const push = (surah: number, ayah: number) => {
    const page = getPageForAyah(surah, ayah);
    const last = groups[groups.length - 1];
    if (last && last.surah === surah && last.page === page) last.ayahs.push(ayah);
    else groups.push({ surah, page, ayahs: [ayah] });
  };

  if (type === "page") {
    const val = parts[1] || "1";
    const rangeParts = val.split("-");
    const from = parseInt(rangeParts[0], 10) || 1;
    const to = rangeParts.length > 1 ? (parseInt(rangeParts[1], 10) || from) : from;
    const pageSet = new Set<number>();
    for (let p = from; p <= to; p++) pageSet.add(p);
    for (let s = 1; s <= 114; s++) {
      const span = SURAH_PAGE_SPANS[s];
      if (!span) continue;
      let overlap = false;
      for (const p of pageSet) if (p >= span.startPage && p <= span.endPage) { overlap = true; break; }
      if (!overlap) continue;
      for (let a = 1; a <= span.ayahCount; a++) {
        const page = getPageForAyah(s, a);
        if (pageSet.has(page)) push(s, a);
      }
    }
    return groups;
  }

  if (type === "surah") {
    const surahVal = parts[1] || "1";
    const surahRangeParts = surahVal.split("-");
    const fromSurah = parseInt(surahRangeParts[0], 10) || 1;
    const toSurah = surahRangeParts.length > 1 ? (parseInt(surahRangeParts[1], 10) || fromSurah) : fromSurah;
    if (parts[2]) {
      const rangeParts = parts[2].split("-");
      const fromAyah = parseInt(rangeParts[0], 10) || 1;
      const toAyah = rangeParts.length > 1 ? (parseInt(rangeParts[1], 10) || fromAyah) : fromAyah;
      for (let a = fromAyah; a <= toAyah; a++) push(fromSurah, a);
      return groups;
    }
    for (let s = fromSurah; s <= Math.min(toSurah, 114); s++) {
      const span = SURAH_PAGE_SPANS[s];
      if (!span) continue;
      for (let a = 1; a <= span.ayahCount; a++) push(s, a);
    }
    return groups;
  }

  if (type === "ayah") {
    const surahId = parseInt(parts[1] || "1", 10);
    const rangePart = parts[2] || "1";
    const rangeParts = rangePart.split("-");
    const fromAyah = parseInt(rangeParts[0], 10) || 1;
    const toAyah = rangeParts.length > 1 ? (parseInt(rangeParts[1], 10) || fromAyah) : fromAyah;
    for (let a = fromAyah; a <= toAyah; a++) push(surahId, a);
    return groups;
  }

  return [];
}

