import { BookOpen, BarChart3, Brain, CalendarDays, Trophy, Flame, CheckCircle2, Play } from "lucide-react";

export const LANDING_SEEN_KEY = "hafith_landing_seen";

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
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Dynamic Tracker</p>
            </div>
          </div>
          <button
            onClick={onEnter}
            data-testid="button-login"
            className="px-6 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold shadow-md shadow-primary/20 hover:shadow-lg hover:-translate-y-0.5 transition-all"
          >
            Sign In
          </button>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-20 px-6">
        <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-16 items-center">
          <div>
            <div className="inline-block mb-6 px-4 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-semibold">
              Spaced Repetition for Quran
            </div>
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-serif text-foreground leading-[1.0] mb-6">
              Your Quran memorization,{" "}
              <span className="text-primary">beautifully tracked</span>
            </h2>
            <p className="text-lg text-muted-foreground leading-relaxed mb-10 max-w-lg">
              Hafith uses a smart spaced repetition algorithm to schedule your reviews,
              track your progress, and keep your memorization strong — all with a calm,
              focused interface.
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
            <div className="relative z-10 overflow-hidden" style={{ height: "420px" }}>
              <div className="absolute inset-0 origin-top-left scale-[0.72] w-[138%] space-y-3">

                {/* Total Progress card */}
                <div className="bg-card rounded-3xl p-6 border border-border/50 shadow-2xl shadow-primary/5 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-48 h-48 bg-primary/5 rounded-full blur-3xl -mr-12 -mt-12 pointer-events-none" />
                  <div className="flex items-center justify-between gap-6 relative z-10">
                    {/* Left: text + stat tiles */}
                    <div className="flex-1 min-w-0">
                      <h3 className="text-xs font-bold tracking-widest text-accent uppercase mb-1">Total Progress</h3>
                      <p className="text-4xl font-serif text-foreground leading-none mb-0.5">
                        127 <span className="text-xl text-muted-foreground">/ 604 pages</span>
                      </p>
                      <p className="text-sm text-muted-foreground mb-4 leading-snug">
                        MashaAllah, you've memorized 21% of the Quran.
                      </p>
                      <div className="flex gap-3">
                        <div className="bg-background rounded-2xl px-4 py-3 flex-1 border border-border/50 text-center">
                          <Trophy className="w-5 h-5 text-accent mx-auto mb-1" />
                          <p className="text-xl font-bold text-foreground">8</p>
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Due Today</p>
                        </div>
                        <div className="bg-background rounded-2xl px-4 py-3 flex-1 border border-border/50 text-center">
                          <Flame className="w-5 h-5 text-primary mx-auto mb-1" />
                          <p className="text-xl font-bold text-foreground">14</p>
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Day Streak</p>
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
                        <span className="text-2xl font-serif font-bold text-foreground">21%</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Daily Plan card */}
                <div className="bg-card rounded-2xl p-5 border border-border/50 shadow-md shadow-primary/5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-serif font-bold text-lg text-foreground">Daily Plan</h3>
                    <span className="text-xs text-muted-foreground font-medium">2 / 4 completed</span>
                  </div>
                  <div className="space-y-1.5">
                    {[
                      { label: "Al-Fatiha", done: true },
                      { label: "Al-Baqarah — Ayah 255", done: true },
                      { label: "Al-Mulk", done: false },
                      { label: "Al-Kahf — Ayahs 1–10", done: false },
                    ].map((item) => (
                      <div
                        key={item.label}
                        className={`flex items-center gap-3 p-2.5 rounded-xl border border-transparent${item.done ? " opacity-50" : ""}`}
                      >
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${item.done ? "bg-primary/15 text-primary" : "bg-primary/10 text-primary"}`}>
                          {item.done ? <CheckCircle2 size={14} /> : <Play size={12} className="ml-0.5" />}
                        </div>
                        <p className={`text-sm font-semibold flex-1 truncate ${item.done ? "line-through text-muted-foreground" : "text-foreground"}`}>
                          {item.label}
                        </p>
                        {item.done && (
                          <span className="text-[9px] uppercase tracking-wider font-bold bg-primary/10 text-primary px-2 py-0.5 rounded-full">Done</span>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-secondary/50 text-foreground text-sm font-medium border border-border/50">
                    Continue Session
                  </div>
                </div>

              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Listen · Queue · Memorize pillar strip */}
      <section className="py-16 px-6">
        <div className="max-w-6xl mx-auto grid md:grid-cols-3 gap-6">

          {/* Listen */}
          <div className="bg-card rounded-2xl border border-border/50 shadow-md shadow-primary/5 p-6 flex flex-col gap-5">
            {/* Mini audio bar mock */}
            <div className="bg-background rounded-xl border border-border/50 px-4 py-3 space-y-2.5">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-semibold text-primary bg-primary/10 rounded-full px-2 py-0.5">
                  Al-Minshawi
                </span>
                <div className="ml-auto w-6 h-6 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                  <svg viewBox="0 0 10 12" className="w-2.5 h-2.5 text-primary-foreground fill-current ml-0.5">
                    <path d="M1 1l8 5-8 5V1z" />
                  </svg>
                </div>
              </div>
              <div className="h-1 rounded-full bg-border/60 w-full relative">
                <div className="h-1 rounded-full bg-primary w-[55%]" />
                <div className="absolute top-1/2 left-[55%] -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-primary border-2 border-background -ml-[5px]" />
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[9px] text-muted-foreground">Al-Fatiha · 1:4</span>
                <span className="text-[9px] font-bold text-muted-foreground bg-secondary rounded px-1.5 py-0.5">0.75×</span>
              </div>
            </div>
            <div>
              <h4 className="font-serif font-bold text-foreground mb-1">Listen</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">Any reciter, any verse — fine-grained audio control.</p>
            </div>
          </div>

          {/* Queue */}
          <div className="bg-card rounded-2xl border border-border/50 shadow-md shadow-primary/5 p-6 flex flex-col gap-5">
            {/* Mini queue panel mock */}
            <div className="bg-background rounded-xl border border-border/50 px-3 py-2.5 space-y-1.5">
              {[
                { surah: "Al-Fatiha", range: "1–7", reps: "×3" },
                { surah: "Al-Baqarah", range: "255", reps: "×5" },
                { surah: "Al-Ikhlas", range: "1–4", reps: "×10" },
                { surah: "Al-Falaq", range: "1–5", reps: "×4" },
              ].map((item) => (
                <div key={item.surah} className="flex items-center gap-2 py-0.5">
                  {/* Drag handle */}
                  <div className="flex flex-col gap-0.5 flex-shrink-0 opacity-30">
                    <div className="w-3 h-px bg-foreground" />
                    <div className="w-3 h-px bg-foreground" />
                    <div className="w-3 h-px bg-foreground" />
                  </div>
                  <span className="text-[10px] font-medium text-foreground flex-1 truncate">{item.surah}</span>
                  <span className="text-[9px] text-muted-foreground bg-secondary rounded px-1.5 py-0.5">{item.range}</span>
                  <span className="text-[9px] font-bold text-primary bg-primary/10 rounded px-1.5 py-0.5">{item.reps}</span>
                </div>
              ))}
            </div>
            <div>
              <h4 className="font-serif font-bold text-foreground mb-1">Queue</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">Build custom playlists of any verses to loop and review.</p>
            </div>
          </div>

          {/* Memorize */}
          <div className="bg-card rounded-2xl border border-border/50 shadow-md shadow-primary/5 p-6 flex flex-col gap-5">
            {/* Mini memorization tracker mock */}
            <div className="bg-background rounded-xl border border-border/50 px-4 py-3 flex flex-col items-center gap-2">
              {/* Circular progress arc */}
              <div className="relative w-16 h-16">
                <svg viewBox="0 0 64 64" className="w-full h-full -rotate-90">
                  <circle cx="32" cy="32" r="26" fill="none" stroke="currentColor" strokeWidth="6" className="text-border/50" />
                  <circle
                    cx="32" cy="32" r="26"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="6"
                    strokeLinecap="round"
                    strokeDasharray={`${Math.PI * 52 * 0.21} ${Math.PI * 52 * 0.79}`}
                    className="text-primary"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-xs font-bold text-foreground">21%</span>
                </div>
              </div>
              <p className="text-[11px] font-semibold text-foreground">127 / 604 pages</p>
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <span className="text-sm">🔥</span>
                <span className="font-medium">14 day streak</span>
              </div>
            </div>
            <div>
              <h4 className="font-serif font-bold text-foreground mb-1">Memorize</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">Track every page with spaced repetition scheduling.</p>
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
