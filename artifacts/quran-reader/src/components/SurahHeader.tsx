interface SurahInfo {
  number: number;
  name: string;
  englishName: string;
  englishNameTranslation: string;
  revelationType: string;
}

interface SurahHeaderProps {
  surah: SurahInfo;
}

const BISMILLAH = "بِسۡمِ ٱللَّهِ ٱلرَّحۡمَـٰنِ ٱلرَّحِیمِ";

export default function SurahHeader({ surah }: SurahHeaderProps) {
  const showBismillah = surah.number !== 9 && surah.number !== 1;

  return (
    <div className="surah-header text-center py-5 my-5">
      <div className="surah-header-rule" aria-hidden="true" />
      <div className="py-3">
        <div
          className="surah-arabic-name font-quran text-3xl leading-relaxed"
          dir="rtl"
          lang="ar"
        >
          {surah.name}
        </div>
        <div className="text-xs text-muted-foreground mt-1.5 tracking-widest uppercase font-medium">
          {surah.englishName} — {surah.englishNameTranslation}
          <span className="mx-2 opacity-40">·</span>
          {surah.revelationType}
        </div>
      </div>
      <div className="surah-header-rule" aria-hidden="true" />
      {showBismillah && (
        <div
          className="font-quran text-2xl text-primary mt-4 bismillah"
          dir="rtl"
          lang="ar"
          aria-label="Bismillah"
        >
          {BISMILLAH}
        </div>
      )}
    </div>
  );
}
