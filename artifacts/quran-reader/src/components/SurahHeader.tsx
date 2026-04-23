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
    <div className="surah-header text-center py-5 my-4">
      <div className="inline-flex items-center gap-3 mb-1">
        <div className="surah-ornament" aria-hidden="true">﴿</div>
        <div>
          <div className="surah-arabic-name font-quran text-2xl leading-relaxed" dir="rtl">
            {surah.name}
          </div>
          <div className="text-xs text-muted-foreground mt-1 tracking-wide uppercase">
            {surah.englishName} — {surah.englishNameTranslation}
            <span className="mx-2 opacity-40">·</span>
            {surah.revelationType}
          </div>
        </div>
        <div className="surah-ornament" aria-hidden="true">﴾</div>
      </div>
      {showBismillah && (
        <div
          className="font-quran text-xl text-primary mt-3 bismillah"
          dir="rtl"
          aria-label="Bismillah"
        >
          {BISMILLAH}
        </div>
      )}
    </div>
  );
}
