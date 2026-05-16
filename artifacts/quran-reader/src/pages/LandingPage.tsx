import { BookOpen, BarChart3, Brain, CalendarDays } from "lucide-react";

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

          <div className="relative hidden lg:block">
            <div className="bg-card rounded-3xl p-8 border border-border/50 shadow-2xl shadow-primary/5 relative z-10">
              <div className="text-center mb-6">
                <h3 className="text-sm font-bold tracking-widest text-accent uppercase mb-2">Total Progress</h3>
                <p className="text-5xl font-serif text-foreground">127 <span className="text-2xl text-muted-foreground">/ 604</span></p>
                <p className="text-xs text-muted-foreground mt-1">pages memorized</p>
              </div>
              <div className="flex gap-4 justify-center">
                <div className="bg-background rounded-xl px-4 py-3 border border-border/50 text-center">
                  <p className="text-xl font-bold text-foreground">8</p>
                  <p className="text-[10px] text-muted-foreground uppercase">Due Today</p>
                </div>
                <div className="bg-background rounded-xl px-4 py-3 border border-border/50 text-center">
                  <p className="text-xl font-bold text-foreground">14</p>
                  <p className="text-[10px] text-muted-foreground uppercase">Day Streak</p>
                </div>
              </div>
            </div>
            <div className="absolute -bottom-4 -right-4 w-full h-full bg-primary/5 rounded-3xl -z-0" />
          </div>
        </div>
      </section>

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
