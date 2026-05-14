import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import {
  BookOpen,
  Headphones,
  Highlighter,
  BarChart3,
  Play,
  Repeat,
  Trophy,
  Flame,
  CheckCircle2,
  ChevronRight,
  X,
  Check,
  Target,
  ListMusic,
  Music2,
} from "lucide-react";

export const LANDING_SEEN_KEY = "hafith_landing_seen";

interface LandingPageProps {
  onEnter: () => void;
}

/* ── Animation helpers ─────────────────────────────────────────────── */

function FadeUp({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  return (
    <motion.div
      ref={ref}
      className={className}
      initial={{ opacity: 0, y: 24 }}
      animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1], delay }}
    >
      {children}
    </motion.div>
  );
}

/* ── Logo lockup ───────────────────────────────────────────────────── */

function LogoLockup() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
        <BookOpen className="w-4 h-4" />
      </div>
      <div className="flex flex-col leading-none">
        <span className="font-serif font-bold text-base text-foreground">Hafith</span>
        <span className="text-[10px] text-muted-foreground mt-0.5 tracking-wide">Quran Memorization</span>
      </div>
    </div>
  );
}

/* ── Accurate UI mockups ────────────────────────────────────────────── */

/** Mirrors the reading view verse block: Arabic text, ayah badge, translation */
function ReadMockup() {
  return (
    <div className="bg-card rounded-2xl border border-border shadow-md p-5 w-full select-none overflow-hidden">
      {/* Surah header strip */}
      <div className="flex items-center gap-2 mb-4 pb-3 border-b border-border">
        <span className="text-xs font-semibold text-foreground">Al-Baqarah</span>
        <span className="text-[10px] text-muted-foreground">· 286 ayahs</span>
      </div>

      {/* Verse block — mirrors VerseBlock layout */}
      <div className="flex gap-3 items-start py-2">
        {/* Ayah badge */}
        <div className="flex-shrink-0 pt-2">
          <span className="inline-flex items-center justify-center px-2 py-0.5 border border-border/60 rounded-full text-[10px] text-muted-foreground font-medium">
            2:255
          </span>
        </div>
        {/* Arabic + translation */}
        <div className="flex-1 min-w-0">
          <p
            className="text-right leading-[2.8] text-[20px]"
            dir="rtl"
            style={{ fontFamily: "var(--app-font-quran)" }}
          >
            <span className="text-foreground">اللَّهُ</span>
            {" "}
            <span className="inline rounded-sm px-0.5 bg-primary/20 text-primary outline outline-1 outline-primary/40">لَا إِلَٰهَ إِلَّا هُوَ</span>
            {" "}
            <span className="text-foreground">الْحَيُّ الْقَيُّومُ</span>
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed mt-2 italic border-t border-border/40 pt-2">
            Allah — there is no deity except Him, the Ever-Living, the Sustainer of existence.
          </p>
        </div>
      </div>
    </div>
  );
}

/** Mirrors the AudioControlBar: play button, progress bar with boundary ticks, secondary controls */
function ListenMockup() {
  return (
    <div className="bg-card rounded-2xl border border-border shadow-md overflow-hidden select-none">
      {/* Highlighted word in verse above the bar — shows real-time word tracking */}
      <div className="px-5 pt-5 pb-3">
        <p className="text-xs text-muted-foreground mb-1">Al-Fatiha · Ayah 2</p>
        <p
          className="text-right leading-[3] text-[18px]"
          dir="rtl"
          style={{ fontFamily: "var(--app-font-quran)" }}
        >
          <span className="text-muted-foreground/50">الْحَمْدُ</span>
          {" "}
          <motion.span
            className="inline rounded-sm px-0.5 bg-primary/20 text-primary outline outline-1 outline-primary/40"
            animate={{ backgroundColor: ["hsl(153 19% 45% / 0.2)", "hsl(153 19% 45% / 0.35)", "hsl(153 19% 45% / 0.2)"] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
          >
            لِلَّهِ
          </motion.span>
          {" "}
          <span className="text-muted-foreground/50">رَبِّ الْعَالَمِينَ</span>
        </p>
      </div>

      {/* Audio bar — mirrors exact AudioControlBar layout */}
      <div className="bg-card border-t border-border px-4 py-3 flex items-center gap-2.5">
        {/* Play button */}
        <button className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center flex-shrink-0">
          <Play className="w-4 h-4 ml-0.5" />
        </button>

        {/* Progress area */}
        <div className="flex flex-col gap-1 flex-1 min-w-0">
          <span className="text-xs font-medium truncate">Al-Fatiha 1:2</span>
          {/* Progress bar with boundary tick marks */}
          <div className="relative h-3 flex items-center">
            <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1 rounded-full bg-muted overflow-hidden">
              <motion.div
                className="absolute inset-y-0 left-0 bg-primary rounded-full"
                initial={{ width: "28%" }}
                animate={{ width: "42%" }}
                transition={{ duration: 4, ease: "linear", repeat: Infinity, repeatType: "reverse" }}
              />
            </div>
            {/* Ayah boundary ticks */}
            {[0.14, 0.28, 0.43, 0.57, 0.71, 0.86].map((frac) => (
              <div
                key={frac}
                className="absolute top-1/2 -translate-y-1/2 w-px h-2.5 bg-foreground/20 pointer-events-none"
                style={{ left: `${frac * 100}%` }}
              />
            ))}
          </div>
        </div>

        {/* Secondary controls */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {/* Highlight toggle — active state */}
          <div className="w-7 h-7 rounded-lg flex items-center justify-center border bg-primary/15 border-primary text-primary">
            <Highlighter className="w-3.5 h-3.5" />
          </div>
          {/* Line/Ayah mode */}
          <div className="flex items-center rounded-lg border border-border overflow-hidden">
            <span className="px-2 h-7 text-xs font-medium flex items-center bg-primary/15 text-primary">Line</span>
            <span className="px-2 h-7 text-xs font-medium flex items-center text-muted-foreground">Ayah</span>
          </div>
          {/* Repeat */}
          <div className="h-7 rounded-lg flex items-center gap-1 border border-border text-muted-foreground px-2">
            <Repeat className="w-3.5 h-3.5" />
            <span className="text-[10px] font-bold">1×</span>
          </div>
          {/* Queue */}
          <div className="w-7 h-7 rounded-lg flex items-center justify-center border border-border text-muted-foreground">
            <ListMusic className="w-3.5 h-3.5" />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Mirrors BrushFinenessToggle + word-selected word states + X/✓ action buttons */
function HighlightMockup() {
  return (
    <div className="bg-card rounded-2xl border border-border shadow-md p-5 w-full select-none">
      {/* Toolbar row — exact BrushFinenessToggle structure */}
      <div className="flex items-center gap-2 mb-4">
        <div className="flex items-center rounded-lg border border-border bg-muted/50 p-0.5 gap-0.5">
          {["Word", "Line", "Ayah"].map((mode, i) => (
            <span
              key={mode}
              className={`px-2.5 py-1 rounded-md text-xs font-medium ${
                i === 0
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground"
              }`}
            >
              {mode}
            </span>
          ))}
        </div>
        {/* X / ✓ action buttons — visible when selection is active */}
        <div className="flex items-center gap-1 ml-auto">
          <button className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 border border-border">
            <X className="w-3.5 h-3.5" />
          </button>
          <button className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground border border-border hover:text-emerald-600 hover:bg-emerald-500/10">
            <Check className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Arabic text with word-selected states */}
      <p
        className="text-right text-[20px] leading-[3.2] px-1"
        dir="rtl"
        style={{ fontFamily: "var(--app-font-quran)" }}
      >
        {/* word-selected: bg-primary/18, box-shadow ring */}
        <span className="inline rounded-sm px-0.5 bg-primary/[0.18] shadow-[0_0_0_1px_hsl(153_19%_45%_/_0.25)]">إِيَّاكَ</span>
        {" "}
        <span className="inline rounded-sm px-0.5 bg-primary/[0.18] shadow-[0_0_0_1px_hsl(153_19%_45%_/_0.25)]">نَعْبُدُ</span>
        {" "}
        <span className="inline rounded-sm px-0.5 bg-primary/[0.18] shadow-[0_0_0_1px_hsl(153_19%_45%_/_0.25)]">وَإِيَّاكَ</span>
        {" "}
        <span className="text-foreground">نَسْتَعِينُ</span>
      </p>

      <p className="text-xs text-muted-foreground mt-3 italic">
        You alone we worship; You alone we ask for help. — Al-Fatiha 1:5
      </p>
    </div>
  );
}

/** Mirrors the Dashboard: donut chart, Due Today + Day Streak tiles, daily plan checklist */
function TrackMockup() {
  const plan = [
    { ref: "Al-Fatiha", done: true },
    { ref: "Al-Baqarah — Ayahs 1–10", done: true },
    { ref: "Al-Baqarah — Ayahs 11–20", done: false },
    { ref: "Al-Baqarah — Ayahs 21–30", done: false },
  ];

  return (
    <div className="bg-card rounded-2xl border border-border shadow-md p-5 w-full select-none flex flex-col gap-4">
      {/* Stats row: donut + tiles */}
      <div className="flex items-center gap-4">
        {/* Donut chart — CSS/SVG simulation */}
        <div className="relative w-20 h-20 flex-shrink-0">
          <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
            <circle cx="18" cy="18" r="14" fill="none" stroke="hsl(35 15% 90%)" strokeWidth="4" />
            <motion.circle
              cx="18" cy="18" r="14" fill="none"
              stroke="hsl(153 19% 45%)" strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray="87.96"
              initial={{ strokeDashoffset: 87.96 }}
              animate={{ strokeDashoffset: 87.96 * (1 - 0.21) }}
              transition={{ duration: 1.2, ease: "easeOut", delay: 0.3 }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-sm font-serif text-foreground">21%</span>
          </div>
        </div>

        <div className="flex-1 flex flex-col gap-1">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Progress</p>
          <p className="text-lg font-serif text-foreground">127 <span className="text-sm text-muted-foreground">/ 604 pages</span></p>
          <div className="flex gap-2 mt-1">
            <div className="flex items-center gap-1.5 bg-background rounded-xl px-3 py-1.5 border border-border/50">
              <Trophy className="w-3.5 h-3.5 text-primary" />
              <span className="text-xs font-bold text-foreground">8</span>
              <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Due</span>
            </div>
            <div className="flex items-center gap-1.5 bg-background rounded-xl px-3 py-1.5 border border-border/50">
              <Flame className="w-3.5 h-3.5 text-primary" />
              <span className="text-xs font-bold text-foreground">14</span>
              <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Streak</span>
            </div>
          </div>
        </div>
      </div>

      {/* Daily plan */}
      <div className="border-t border-border pt-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-serif text-foreground">Daily Plan</p>
          <span className="text-[10px] text-muted-foreground">2 / 4 completed</span>
        </div>
        <div className="flex flex-col gap-1.5">
          {plan.map((item) => (
            <div
              key={item.ref}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-xl border border-transparent ${
                item.done ? "opacity-50" : "hover:bg-secondary/30 hover:border-border/50"
              }`}
            >
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                item.done ? "bg-primary/15 text-primary" : "bg-primary/10 text-primary"
              }`}>
                {item.done ? <CheckCircle2 className="w-4 h-4" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
              </div>
              <span className={`text-xs font-semibold flex-1 min-w-0 truncate ${
                item.done ? "line-through text-muted-foreground" : "text-foreground"
              }`}>
                {item.ref}
              </span>
              {item.done && (
                <span className="text-[9px] uppercase tracking-wider font-bold bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                  Done
                </span>
              )}
            </div>
          ))}
        </div>
        <button className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-secondary/50 text-foreground text-xs font-medium hover:bg-secondary transition-colors border border-border/50">
          Continue Session
        </button>
      </div>
    </div>
  );
}

/* ── Feature definitions ────────────────────────────────────────────── */

const FEATURES = [
  {
    icon: <BookOpen className="w-5 h-5" />,
    title: "Read",
    description:
      "Navigate all 114 surahs with authentic Uthmanic script. Words highlight as you listen, and translations appear inline so you always know what you're reading.",
    mockup: <ReadMockup />,
  },
  {
    icon: <Headphones className="w-5 h-5" />,
    title: "Listen",
    description:
      "Stream professional recitations with real-time word-by-word highlighting. Control playback speed, loop individual verses, and switch reciter without losing your place.",
    mockup: <ListenMockup />,
  },
  {
    icon: <Highlighter className="w-5 h-5" />,
    title: "Highlight",
    description:
      "Brush across words, lines, or full ayahs to add them to your review queue. Confirm or clear a selection instantly with the action buttons that appear in the toolbar.",
    mockup: <HighlightMockup />,
  },
  {
    icon: <BarChart3 className="w-5 h-5" />,
    title: "Track",
    description:
      "The dashboard shows your total pages memorized as a live donut chart, pages due today, your current streak, and a daily plan you can work through in one session.",
    mockup: <TrackMockup />,
  },
];

/* ── Main page ─────────────────────────────────────────────────────── */

export default function LandingPage({ onEnter }: LandingPageProps) {
  return (
    <div className="min-h-screen text-foreground flex flex-col overflow-x-hidden" style={{ backgroundColor: "#edeae2" }}>

      {/* ── Nav ── */}
      <motion.header
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="sticky top-0 z-30 backdrop-blur-sm border-b border-stone-200/80 px-6 py-3 flex items-center justify-between"
        style={{ backgroundColor: "rgba(237, 234, 226, 0.92)" }}
      >
        <LogoLockup />
        <button
          onClick={onEnter}
          className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          Enter Hafith
        </button>
      </motion.header>

      {/* ── Hero ── */}
      <section className="flex items-center px-6 py-16 md:py-24 max-w-6xl mx-auto w-full">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center w-full">

          {/* Left */}
          <div className="flex flex-col gap-6">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-medium w-fit border border-primary/20"
            >
              Spaced repetition for Quran
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="font-serif font-bold text-6xl md:text-7xl leading-[1.08] text-foreground"
            >
              Your Quran
              <br />
              memorization,
              <br />
              <span className="text-primary">beautifully tracked.</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3, ease: "easeOut" }}
              className="text-muted-foreground text-base leading-relaxed max-w-md"
            >
              Hafith uses a smart spaced repetition system to schedule your reviews, track
              your progress, and keep your memorization strong — all with a calm, focused interface.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.4, ease: "easeOut" }}
              className="flex flex-col gap-3"
            >
              <button
                onClick={onEnter}
                className="w-fit flex items-center gap-2 px-7 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 active:scale-95 transition-all shadow-sm"
              >
                Get Started Free
                <ChevronRight className="w-4 h-4" />
              </button>
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-primary/60 inline-block" />
                Free forever
              </p>
            </motion.div>
          </div>

          {/* Right: hero card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="flex justify-center md:justify-end"
          >
            <div className="w-full max-w-sm bg-white rounded-3xl shadow-md p-7 flex flex-col gap-5">
              <div className="text-center pb-4 border-b border-stone-100">
                <p className="text-[11px] font-semibold text-amber-600 uppercase tracking-widest mb-2">Total Progress</p>
                <div className="flex items-baseline justify-center gap-2">
                  <span className="font-serif font-semibold text-6xl text-foreground">127</span>
                  <span className="text-2xl text-muted-foreground font-light">/ 604</span>
                </div>
                <p className="text-sm text-muted-foreground mt-1">pages memorized</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Due Today", value: "8" },
                  { label: "Day Streak", value: "14" },
                ].map((s) => (
                  <div key={s.label} className="rounded-2xl px-4 py-4 border border-stone-200 text-center">
                    <p className="font-serif font-semibold text-3xl text-foreground">{s.value}</p>
                    <p className="text-[10px] text-muted-foreground mt-1 uppercase tracking-wider">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="border-t border-stone-200/60 py-20 px-6" style={{ backgroundColor: "#e5e1d8" }}>
        <div className="max-w-6xl mx-auto">
          <FadeUp className="text-center mb-16">
            <h2 className="font-serif text-3xl text-foreground mb-3">
              Everything you need to memorize the Quran
            </h2>
            <p className="text-muted-foreground text-base max-w-xl mx-auto">
              A complete toolkit designed around how your memory actually works.
            </p>
          </FadeUp>

          <div className="flex flex-col gap-20">
            {FEATURES.map((feature, i) => {
              const isEven = i % 2 === 0;
              return (
                <FadeUp key={feature.title} delay={0.05}>
                  <div className={`grid grid-cols-1 md:grid-cols-2 gap-10 items-center ${!isEven ? "md:[direction:rtl]" : ""}`}>
                    <div className={`flex flex-col gap-5 ${!isEven ? "md:[direction:ltr]" : ""}`}>
                      <div className="w-11 h-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                        {feature.icon}
                      </div>
                      <div>
                        <h3 className="font-serif text-2xl text-foreground mb-2">{feature.title}</h3>
                        <p className="text-muted-foreground leading-relaxed">{feature.description}</p>
                      </div>
                      <button
                        onClick={onEnter}
                        className="w-fit flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary/80 transition-colors"
                      >
                        Try it now <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                    <div className={`${!isEven ? "md:[direction:ltr]" : ""}`}>
                      {feature.mockup}
                    </div>
                  </div>
                </FadeUp>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <FadeUp>
        <section className="border-t border-stone-200 py-20 px-6">
          <div className="max-w-2xl mx-auto text-center flex flex-col items-center gap-6">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
              <BookOpen className="w-7 h-7" />
            </div>
            <h2 className="font-serif text-3xl text-foreground">
              Join Hafith and take charge of your Quran memorization journey.
            </h2>
            <button
              onClick={onEnter}
              className="flex items-center gap-2 px-8 py-3.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 active:scale-95 transition-all shadow-sm"
            >
              Enter Hafith <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </section>
      </FadeUp>

      {/* ── Footer ── */}
      <footer className="border-t border-stone-200 py-6 px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <LogoLockup />
          <p className="text-xs text-muted-foreground">Built with care for the memorization journey.</p>
        </div>
      </footer>
    </div>
  );
}
