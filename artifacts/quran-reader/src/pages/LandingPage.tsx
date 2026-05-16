import { useState } from "react";
import { BookOpen, BarChart3, Brain, CalendarDays, Trophy, Flame, CheckCircle2, Play, ListMusic, Layers, ChevronDown, GripVertical } from "lucide-react";

export const LANDING_SEEN_KEY = "hafith_landing_seen";

const HERO_PILLS = [
  "Spaced Repetition Revision Planner",
  "Visual Memorization Tracker",
  "Fine-Tuned Word Level Quranic Audio Selection",
  "Queue Creation For Automated Playback",
];


const AYAH_201_WORDS = [
  { id: "w0",  text: "وَمِنْهُم",   line: 0 },
  { id: "w1",  text: "مَّن",        line: 0 },
  { id: "w2",  text: "يَقُولُ",     line: 0 },
  { id: "w3",  text: "رَبَّنَا",    line: 0 },
  { id: "w4",  text: "آتِنَا",      line: 0 },
  { id: "w5",  text: "فِي",         line: 1 },
  { id: "w6",  text: "الدُّنْيَا",  line: 1 },
  { id: "w7",  text: "حَسَنَةً",    line: 1 },
  { id: "w8",  text: "وَفِي",       line: 1 },
  { id: "w9",  text: "الْآخِرَةِ", line: 1 },
  { id: "w10", text: "حَسَنَةً",    line: 1 },
  { id: "w11", text: "وَقِنَا",     line: 2 },
  { id: "w12", text: "عَذَابَ",     line: 2 },
  { id: "w13", text: "النَّارِ",    line: 2 },
];

function HighlightCard() {
  const [selected, setSelected] = useState<Set<string>>(new Set(["w0", "w1", "w2"]));
  const [fineness, setFineness] = useState<"word" | "line" | "ayah">("word");

  function toggle(wordId: string, line: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      let ids: string[];
      if (fineness === "word") {
        ids = [wordId];
      } else if (fineness === "line") {
        ids = AYAH_201_WORDS.filter((w) => w.line === line).map((w) => w.id);
      } else {
        ids = AYAH_201_WORDS.map((w) => w.id);
      }
      const allSelected = ids.every((id) => next.has(id));
      if (allSelected) {
        ids.forEach((id) => next.delete(id));
      } else {
        ids.forEach((id) => next.add(id));
      }
      return next;
    });
  }

  return (
    <div className="bg-card rounded-2xl border border-border/50 shadow-md shadow-primary/5 p-6 flex flex-col gap-5">
      <div className="bg-background rounded-xl border border-border/50 px-4 py-3 space-y-2.5">
        {[0, 1, 2].map((lineIdx) => (
          <div key={lineIdx} className="flex flex-wrap justify-end gap-x-1 gap-y-1" dir="rtl">
            {AYAH_201_WORDS.filter((w) => w.line === lineIdx).map((w) => (
              <span
                key={w.id}
                onClick={() => toggle(w.id, w.line)}
                className={`font-quran text-[1.05rem] leading-relaxed cursor-pointer rounded px-0.5 transition-colors select-none ${
                  selected.has(w.id)
                    ? "bg-primary/20 text-primary"
                    : "text-foreground hover:bg-muted"
                }`}
              >
                {w.text}
              </span>
            ))}
            {lineIdx === 2 && (
              <span className="font-quran text-sm text-muted-foreground/70 select-none">٢٠١</span>
            )}
          </div>
        ))}
        <div className="flex gap-1.5 pt-1.5 border-t border-border/40">
          {(["word", "line", "ayah"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFineness(f)}
              className={`text-[9px] font-semibold rounded-full px-2.5 py-0.5 transition-colors ${
                fineness === f
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground hover:bg-muted"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>
      <div>
        <h4 className="font-serif font-bold text-foreground mb-1">Highlight</h4>
        <p className="text-sm text-muted-foreground leading-relaxed">Select and deselect words, lines, or whole ayahs to listen to. Try it out.</p>
      </div>
    </div>
  );
}

interface LandingPageProps {
  onEnter: () => void;
}

export default function LandingPage({ onEnter }: LandingPageProps) {
  return (
    <div className="min-h-screen bg-background">
      <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md bg-background/80 border-b border-border/50">
        <div className="max-w-6xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center text-primary-foreground">
              <BookOpen size={20} />
            </div>
            <div>
              <h1 className="font-serif font-bold text-lg text-foreground leading-none">Hafith</h1>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Memorization Companion</p>
            </div>
          </div>
          <button
            onClick={onEnter}
            data-testid="button-login"
            className="px-6 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold shadow-md shadow-primary/20 hover:shadow-lg hover:-translate-y-0.5 transition-all"
          >
            Begin
          </button>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-20 px-6">
        <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-16 items-center">
          <div>
            <div className="flex flex-wrap gap-2 mb-6 max-w-lg">
              {HERO_PILLS.map((label) => (
                <span key={label} className="px-4 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-semibold">
                  {label}
                </span>
              ))}
            </div>
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-serif text-foreground leading-[1.0] mb-6">
              Your Quran memorization,{" "}
              <span className="text-primary">beautifully tracked</span>
            </h2>
            <p className="text-lg text-muted-foreground leading-relaxed mb-10 max-w-lg">
              Hafith uses a smart spaced repetition algorithm to schedule your Quran reviews,
              track your progress, and keep your memorization strong — all with a calm,
              focused interface.
            </p>
            <p className="text-lg text-muted-foreground leading-relaxed mb-10 max-w-lg">
              The embedded Quran reader allows for word- and line-level highlighting for specific audio playback and repetition.
            </p>  
            <div className="flex flex-col sm:flex-row gap-4">
              <button
                onClick={onEnter}
                data-testid="button-get-started"
                className="px-8 py-4 rounded-xl bg-primary text-primary-foreground font-bold text-lg shadow-lg shadow-primary/25 hover:shadow-xl hover:-translate-y-0.5 transition-all text-center"
              >
                Get Started Free
              </button>
            </div>
            <div className="flex items-center gap-6 mt-8 text-sm text-muted-foreground">
              <span className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-primary" />
                Free forever
              </span>
            </div>
          </div>

          {/* Hero right-side visual: Dashboard replica */}
          <div className="relative hidden lg:block">
            {/* Decorative background shadow */}
            <div className="absolute -bottom-4 -right-4 w-full h-full bg-primary/5 rounded-3xl -z-0" />

            {/* Scaled dashboard mockup */}
            <div className="relative z-10 overflow-hidden" style={{ height: "430px" }}>
              <div className="absolute inset-0 origin-top-left scale-[0.72] w-[138%] space-y-3">

                {/* Total Progress card */}
                <div className="bg-card rounded-3xl p-6 border border-border/50 shadow-2xl shadow-primary/5 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-48 h-48 bg-primary/5 rounded-full blur-3xl -mr-12 -mt-12 pointer-events-none" />
                  <div className="flex items-center justify-between gap-6 relative z-10">
                    {/* Left: text + stat tiles */}
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base font-bold tracking-widest text-foreground uppercase mb-1">Total Progress</h3>
                      <p className="text-5xl font-serif text-foreground leading-none mb-0.5">
                        127 <span className="text-3xl text-muted-foreground">/ 604 pages</span>
                      </p>
                      <p className="text-lg text-muted-foreground mb-4 leading-snug">
                        MashaAllah, you've memorized 21% of the Quran.
                      </p>
                      <div className="flex gap-3">
                        <div className="bg-background rounded-2xl px-4 py-3 flex-1 border border-border/50 text-center">
                          <Trophy className="w-5 h-5 text-primary mx-auto mb-1" />
                          <p className="text-3xl font-bold text-foreground">4</p>
                          <p className="text-[20px] text-muted-foreground uppercase tracking-wider">Due Today</p>
                        </div>
                        <div className="bg-background rounded-2xl px-4 py-3 flex-1 border border-border/50 text-center">
                          <Flame className="w-5 h-5 text-primary mx-auto mb-1" />
                          <p className="text-3xl font-bold text-foreground">14</p>
                          <p className="text-[20px] text-muted-foreground uppercase tracking-wider">Day Streak</p>
                        </div>
                      </div>
                    </div>

                    {/* Right: donut chart */}
                    <div className="w-40 h-40 relative flex-shrink-0">
                      <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
                        <circle cx="60" cy="60" r="48" fill="none" stroke="currentColor" strokeWidth="10" className="text-border/40" />
                        <circle
                          cx="60" cy="60" r="48"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="10"
                          strokeLinecap="round"
                          strokeDasharray={`${Math.PI * 96 * 0.21} ${Math.PI * 96 * 0.79}`}
                          className="text-primary"
                        />
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center flex-col">
                        <span className="text-4xl font-serif font-bold text-foreground">21%</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Daily Plan card */}
                <div className="bg-card rounded-3xl p-5 border border-border/50 shadow-md shadow-primary/5 relative overflow-hidden">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-serif font-bold text-2xl text-foreground">Daily Plan</h3>
                    <span className="text-xl text-muted-foreground font-medium">2 / 4 completed</span>
                  </div>
                  <div className="space-y-1">
                    {[
                      { label: "Al-Qalam", done: true },
                      { label: "Ali Imran — Ayahs 1-22", done: true },
                      { label: "Luqman", done: false },
                      { label: "Al-Kahf — Ayahs 1–10", done: false },
                    ].map((item) => (
                      <div
                        key={item.label}
                        className={`flex items-center gap-3 p-2.5 rounded-xl border border-transparent${item.done ? " opacity-50" : ""}`}
                      >
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${item.done ? "bg-primary/15 text-primary" : "bg-primary/10 text-primary"}`}>
                          {item.done ? <CheckCircle2 size={20} /> : <Play size={20} className="ml-0.5" />}
                        </div>
                        <p className={`text-xl font-semibold flex-1 truncate ${item.done ? "line-through text-muted-foreground" : "text-foreground"}`}>
                          {item.label}
                        </p>
                        {item.done && (
                          <span className="text-[15px] uppercase tracking-wider font-bold bg-primary/10 text-primary px-2 py-0.5 rounded-full">Done</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Highlight · Listen · Queue pillar strip */}
      <section className="py-16 px-6">
        <div className="max-w-6xl mx-auto grid md:grid-cols-3 gap-6">

          <HighlightCard />

          {/* Listen */}
          <div className="bg-card rounded-2xl border border-border/50 shadow-md shadow-primary/5 p-6 flex flex-col gap-5">
            {/* Mini audio bar mock — mirrors real AudioControlBar layout */}
            <div className="bg-background rounded-xl border border-border/50 px-3 py-3 space-y-2">
              {/* Top row: skip-back · play · skip-forward · ayah label */}
              <div className="flex items-center gap-2">
                {/* Skip back */}
                <div className="w-6 h-6 rounded-lg border border-border flex items-center justify-center flex-shrink-0 text-muted-foreground">
                  <svg viewBox="0 0 14 14" className="w-3 h-3 fill-current">
                    <path d="M2 2h1.5v10H2V2zm1.5 5L12 2v10L3.5 7z" />
                  </svg>
                </div>
                {/* Play button */}
                <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                  <svg viewBox="0 0 10 12" className="w-2.5 h-2.5 text-primary-foreground fill-current ml-0.5">
                    <path d="M1 1l8 5-8 5V1z" />
                  </svg>
                </div>
                {/* Skip forward */}
                <div className="w-6 h-6 rounded-lg border border-border flex items-center justify-center flex-shrink-0 text-muted-foreground">
                  <svg viewBox="0 0 14 14" className="w-3 h-3 fill-current">
                    <path d="M12 2h-1.5v10H12V2zM10.5 7L2 2v10l8.5-5z" />
                  </svg>
                </div>
                {/* Ayah label */}
                <span className="text-[10px] font-medium text-foreground truncate flex-1 min-w-0">Taha · 20:39-42</span>
              </div>

              {/* Progress bar with tick marks and timestamps */}
              <div className="space-y-1">
                <div className="relative h-3 flex items-center">
                  {/* Track */}
                  <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1 rounded-full bg-border/60 overflow-hidden">
                    <div className="h-1 rounded-full bg-primary w-[38%]" />
                  </div>
                  {/* Ayah boundary tick marks */}
                  <div className="absolute top-1/2 -translate-y-1/2 w-px h-2.5 bg-foreground/40" style={{ left: "25%" }} />
                  <div className="absolute top-1/2 -translate-y-1/2 w-px h-2.5 bg-foreground/40" style={{ left: "62%" }} />
                  <div className="absolute top-1/2 -translate-y-1/2 w-px h-2.5 bg-foreground/40" style={{ left: "84%" }} />
                  {/* Scrubber thumb */}
                  <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full bg-primary shadow-sm" style={{ left: "38%" }} />
                </div>
                {/* Timestamps */}
                <div className="flex justify-between">
                  <span className="text-[9px] text-muted-foreground tabular-nums">0:32</span>
                  <span className="text-[9px] text-muted-foreground tabular-nums">1:14</span>
                </div>
              </div>

              {/* Bottom row: reciter pill · speed badge · repeat badge */}
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] font-semibold text-primary bg-primary/10 rounded-full px-2 py-0.5">Minshawi</span>
                <span className="text-[9px] font-bold text-muted-foreground bg-secondary rounded px-1.5 py-0.5">1×</span>
                <span className="text-[9px] font-bold text-muted-foreground bg-secondary rounded px-1.5 py-0.5">×2</span>
              </div>
            </div>
            <div>
              <h4 className="font-serif font-bold text-foreground mb-1">Listen</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">Any reciter, any verse — fine-grained audio control and playback highlighting.</p>
            </div>
          </div>

          {/* Queue */}
          <div className="bg-card rounded-2xl border border-border/50 shadow-md shadow-primary/5 p-6 flex flex-col gap-5">
            {/* Mini queue panel mock — mirrors ReviewQueuePanel */}
            <div className="bg-background rounded-xl border border-border/50 overflow-hidden flex flex-col">
              {/* Panel header */}
              <div className="flex items-center gap-1.5 px-2.5 py-2 border-b border-border">
                <ListMusic className="w-3 h-3 text-primary flex-shrink-0" />
                <span className="text-[11px] font-semibold flex-1">Review Queue</span>
                <span className="text-[10px] text-muted-foreground tabular-nums">(5)</span>
              </div>
              {/* Sub-queues */}
              {[
                {
                  id: "sq1",
                  label: "Page 47",
                  reps: "×3",
                  items: [
                    { surah: "Al-Baqarah", range: "2:280", reps: "×5" },
                    { surah: "Al-Baqarah", range: "2:281", reps: "×5" },
                  ],
                },
                {
                  id: "sq2",
                  label: "Page 48",
                  reps: "×3",
                  items: [
                    { surah: "Al-Baqarah", range: "2:282 Line 1", reps: "×5" },
                    { surah: "Al-Baqarah", range: "2:282 Line 2", reps: "×5" },
                    { surah: "Al-Baqarah", range: "2:282 Line 3", reps: "×5" },
                  ],
                },
              ].map((sq, gi) => (
                <div key={sq.id}>
                  {/* Inter-group divider */}
                  {gi > 0 && <div className="mx-2 my-1 border-t border-border/50" />}
                  {/* Sub-queue header row */}
                  <div className="flex items-center gap-1.5 px-2 py-1.5 border-l-2 border-primary/60 bg-primary/5">
                    <GripVertical className="w-2.5 h-2.5 text-muted-foreground/30 flex-shrink-0" />
                    <ChevronDown className="w-2.5 h-2.5 text-muted-foreground/50 flex-shrink-0" />
                    <Layers className="w-2.5 h-2.5 text-muted-foreground/50 flex-shrink-0" />
                    <span className="flex-1 text-[10px] font-semibold text-foreground truncate">{sq.label}</span>
                    <span className="min-w-[22px] h-[16px] rounded-full border border-border text-[8px] font-bold tabular-nums text-muted-foreground flex items-center justify-center px-1">{sq.reps}</span>
                  </div>
                  {/* Sub-queue items */}
                  {sq.items.map((item, i) => (
                    <div key={item.surah + item.range} className="flex items-center gap-1.5 pl-7 pr-2 py-1 border-l-2 border-transparent">
                      <GripVertical className="w-2.5 h-2.5 text-muted-foreground/25 flex-shrink-0" />
                      <span className="w-3 flex-shrink-0 text-[9px] tabular-nums text-muted-foreground/40 text-center">{i + 1}</span>
                      <span className="flex-1 text-[10px] text-foreground truncate">{item.surah}</span>
                      <span className="text-[9px] text-muted-foreground bg-secondary rounded px-1 py-px flex-shrink-0">{item.range}</span>
                      <span className="min-w-[22px] h-[16px] rounded-full border border-border text-[8px] font-bold tabular-nums text-muted-foreground flex items-center justify-center px-1 flex-shrink-0">{item.reps}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
            <div>
              <h4 className="font-serif font-bold text-foreground mb-1">Queue</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">Build custom playlists of lines or verses to loop and review. Share your queues with anyone.</p>
            </div>
          </div>

        </div>
      </section>

      {/* Features grid */}
      <section className="py-20 px-6 bg-secondary/30">
        <div className="max-w-6xl mx-auto">
          <h3 className="text-3xl font-serif text-foreground text-center mb-4">Everything you need to memorize the Quran</h3>
          <p className="text-muted-foreground text-center mb-12 max-w-xl mx-auto">
            A complete toolkit designed around how your memory actually works.
          </p>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { icon: BarChart3, title: "Visual Progress", desc: "Track your memorization with a beautiful dashboard and donut chart showing your journey" },
              { icon: Brain, title: "Smart Scheduling", desc: "SuperMemo-2 algorithm schedules reviews at the perfect time for long-term retention" },
              { icon: CalendarDays, title: "Daily Plans", desc: "Get a personalized daily plan based on your bandwidth and what needs review" },
              { icon: BookOpen, title: "Flexible Logging", desc: "Log by page, ayah range, or surah — however you prefer to track" },
            ].map((feature) => (
              <div key={feature.title} className="bg-card rounded-2xl p-6 border border-border/50 hover:border-primary/30 hover:-translate-y-1 transition-all group">
                <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-4 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                  <feature.icon size={24} />
                </div>
                <h4 className="font-serif font-bold text-foreground mb-2">{feature.title}</h4>
                <p className="text-sm text-muted-foreground leading-relaxed">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="py-8 px-6 border-t border-border/50">
        <div className="max-w-6xl mx-auto flex justify-between items-center text-sm text-muted-foreground">
          <p>Hafith Dynamic Tracker</p>
          <p>Bismillah</p>
        </div>
      </footer>
    </div>
  );
}
