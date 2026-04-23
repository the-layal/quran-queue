import { Link } from "wouter";
import { ArrowLeft, BarChart2, Clock, BookOpen, TrendingUp } from "lucide-react";

export default function AnalyticsPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border px-4 py-3 flex items-center gap-3">
        <Link href="/">
          <button className="p-2 rounded-lg hover:bg-muted transition-colors" aria-label="Back to reader">
            <ArrowLeft className="w-5 h-5" />
          </button>
        </Link>
        <h1 className="font-semibold text-base">Analytics</h1>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 mb-4">
            <BarChart2 className="w-7 h-7 text-primary" />
          </div>
          <h2 className="text-2xl font-bold mb-2">Reading Analytics</h2>
          <p className="text-muted-foreground text-sm">
            Your reading stats will appear here in a future sprint.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[
            { icon: Clock, label: "Time Read", value: "—" },
            { icon: BookOpen, label: "Pages Visited", value: "—" },
            { icon: TrendingUp, label: "Streak", value: "—" },
          ].map(({ icon: Icon, label, value }) => (
            <div
              key={label}
              className="rounded-2xl border border-border bg-card p-6 flex flex-col items-center gap-2"
            >
              <Icon className="w-6 h-6 text-muted-foreground" />
              <span className="text-2xl font-bold text-foreground">{value}</span>
              <span className="text-xs text-muted-foreground">{label}</span>
            </div>
          ))}
        </div>

        <p className="text-center text-xs text-muted-foreground mt-10">
          Analytics will be wired up in a future sprint.
        </p>
      </div>
    </div>
  );
}
