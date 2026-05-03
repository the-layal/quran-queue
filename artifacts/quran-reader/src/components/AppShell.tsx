import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation, Link } from "wouter";
import {
  Menu,
  X,
  BookOpen,
  LayoutDashboard,
  CalendarDays,
  Library,
  History,
  Settings,
  LogIn,
  LogOut,
  User,
  Quote,
} from "lucide-react";
import { useAuth } from "../hooks/useAuth";

interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Quran Reader", path: "/", icon: <BookOpen className="w-4 h-4" /> },
  { label: "Dashboard", path: "/track", icon: <LayoutDashboard className="w-4 h-4" /> },
  { label: "Daily Plan", path: "/track/plan", icon: <CalendarDays className="w-4 h-4" /> },
  { label: "Library", path: "/track/library", icon: <Library className="w-4 h-4" /> },
  { label: "History", path: "/track/history", icon: <History className="w-4 h-4" /> },
  { label: "Settings", path: "/track/settings", icon: <Settings className="w-4 h-4" /> },
];

const SIDEBAR_STORAGE_KEY = "hafith_sidebar_collapsed";
const LG_BREAKPOINT_PX = 1024;

interface VerseEntry {
  arabic: string;
  translation: string;
  reference: string;
}

const DAILY_VERSES: VerseEntry[] = [
  { arabic: "إِنَّ مَعَ الْعُسْرِ يُسْرًا", translation: "Indeed, with hardship comes ease.", reference: "Quran 94:6" },
  { arabic: "وَمَن يَتَّقِ اللَّهَ يَجْعَل لَّهُ مَخْرَجًا", translation: "Whoever is mindful of Allah, He will make a way out for them.", reference: "Quran 65:2" },
  { arabic: "فَاذْكُرُونِي أَذْكُرْكُمْ", translation: "So remember Me; I will remember you.", reference: "Quran 2:152" },
  { arabic: "وَبَشِّرِ الصَّابِرِينَ", translation: "And give good tidings to the patient.", reference: "Quran 2:155" },
  { arabic: "إِنَّ اللَّهَ مَعَ الصَّابِرِينَ", translation: "Indeed, Allah is with the patient.", reference: "Quran 2:153" },
  { arabic: "وَلَذِكْرُ اللَّهِ أَكْبَرُ", translation: "And the remembrance of Allah is greater.", reference: "Quran 29:45" },
  { arabic: "حَسْبُنَا اللَّهُ وَنِعْمَ الْوَكِيلُ", translation: "Sufficient for us is Allah, and He is the best disposer of affairs.", reference: "Quran 3:173" },
  { arabic: "رَبِّ زِدْنِي عِلْمًا", translation: "My Lord, increase me in knowledge.", reference: "Quran 20:114" },
  { arabic: "وَهُوَ مَعَكُمْ أَيْنَ مَا كُنتُمْ", translation: "And He is with you wherever you are.", reference: "Quran 57:4" },
  { arabic: "إِنَّ اللَّهَ يُحِبُّ الْمُتَوَكِّلِينَ", translation: "Indeed, Allah loves those who rely upon Him.", reference: "Quran 3:159" },
  { arabic: "وَلَا تَيْأَسُوا مِن رَّوْحِ اللَّهِ", translation: "And do not despair of the mercy of Allah.", reference: "Quran 12:87" },
  { arabic: "فَإِنَّ مَعَ الْعُسْرِ يُسْرًا", translation: "For indeed, with hardship comes ease.", reference: "Quran 94:5" },
  { arabic: "إِنَّ صَلَاتِي وَنُسُكِي وَمَحْيَايَ وَمَمَاتِي لِلَّهِ", translation: "Indeed, my prayer, my rites, my living, and my dying are for Allah.", reference: "Quran 6:162" },
  { arabic: "وَمَن يَتَوَكَّلْ عَلَى اللَّهِ فَهُوَ حَسْبُهُ", translation: "Whoever puts their trust in Allah — He is sufficient for them.", reference: "Quran 65:3" },
  { arabic: "ادْعُونِي أَسْتَجِبْ لَكُمْ", translation: "Call upon Me; I will respond to you.", reference: "Quran 40:60" },
];

function getDailyVerse(): VerseEntry {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((now.getTime() - start.getTime()) / 86400000);
  return DAILY_VERSES[dayOfYear % DAILY_VERSES.length];
}

function VersePanel() {
  const verse = getDailyVerse();
  return (
    <div
      className="mx-3 mb-3 p-3 rounded-xl bg-primary/5 border border-primary/15"
      data-testid="sidebar-verse-panel"
    >
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-primary/80 mb-2">
        <Quote className="w-3 h-3" />
        Verse of the Day
      </div>
      <p
        className="text-right text-base leading-relaxed text-foreground mb-1.5"
        dir="rtl"
        lang="ar"
      >
        {verse.arabic}
      </p>
      <p className="text-xs text-muted-foreground leading-snug">{verse.translation}</p>
      <p className="text-[10px] text-primary/80 font-semibold mt-1.5">{verse.reference}</p>
    </div>
  );
}

function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth >= LG_BREAKPOINT_PX : true,
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia(`(min-width: ${LG_BREAKPOINT_PX}px)`);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    setIsDesktop(mq.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return isDesktop;
}

interface AppShellProps {
  children: React.ReactNode;
  rightActions?: React.ReactNode;
  centerContent?: React.ReactNode;
}

export default function AppShell({ children, rightActions, centerContent }: AppShellProps) {
  const [location] = useLocation();
  const isDesktop = useIsDesktop();
  const isQuranPage = location === "/";
  const { user, isLoading, isAuthenticated, login, logout } = useAuth();

  const headerRef = useRef<HTMLElement>(null);

  // Desktop collapse state for non-/ routes — persisted per device.
  // The Quran Reader (/) deliberately ignores this: it always defaults to
  // collapsed and uses a session-only override below.
  const [persistentCollapsed, setPersistentCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      const stored = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
      if (stored !== null) return stored === "true";
    } catch {
      /* ignore */
    }
    return false;
  });

  // Session-only "force open" for the Quran Reader page. Resets whenever the
  // user navigates away from /, so / always re-opens collapsed.
  const [quranSessionOpen, setQuranSessionOpen] = useState(false);

  // Mobile overlay state — session only.
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(persistentCollapsed));
    } catch {
      /* ignore */
    }
  }, [persistentCollapsed]);

  // Reset the Quran session-open flag whenever we leave / so the next visit
  // starts collapsed again.
  useEffect(() => {
    if (!isQuranPage) setQuranSessionOpen(false);
  }, [isQuranPage]);

  const collapsed = isQuranPage ? !quranSessionOpen : persistentCollapsed;

  // Close mobile overlay on route change.
  useEffect(() => {
    setMobileOpen(false);
  }, [location]);

  // Header height CSS var so descendants (e.g. mushaf wrapper) can use it.
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const apply = () => {
      document.documentElement.style.setProperty("--app-header-h", `${el.offsetHeight}px`);
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Lock body scroll when mobile overlay is open.
  useEffect(() => {
    if (!isDesktop && mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen, isDesktop]);

  const desktopVisible = isDesktop && !collapsed;

  const handleToggle = useCallback(() => {
    if (!isDesktop) {
      setMobileOpen((o) => !o);
      return;
    }
    if (isQuranPage) {
      setQuranSessionOpen((o) => !o);
    } else {
      setPersistentCollapsed((c) => !c);
    }
  }, [isDesktop, isQuranPage]);

  const displayName = user
    ? user.firstName
      ? `${user.firstName}${user.lastName ? " " + user.lastName : ""}`
      : user.email ?? "Signed in"
    : null;

  const sidebarBody = (
    <>
      <div className="flex items-center justify-between px-4 py-4 border-b border-border">
        <Link href="/" className="flex items-center gap-2 group">
          <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
            <BookOpen className="w-4 h-4" />
          </div>
          <span className="font-semibold text-base group-hover:text-primary transition-colors">
            Hafith
          </span>
        </Link>
        <button
          onClick={() => {
            if (!isDesktop) setMobileOpen(false);
            else if (isQuranPage) setQuranSessionOpen(false);
            else setPersistentCollapsed(true);
          }}
          className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-colors"
          aria-label="Close sidebar"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        <nav className="py-3">
          {NAV_ITEMS.map((item) => {
            const isActive =
              item.path === "/"
                ? location === "/"
                : location === item.path || location.startsWith(item.path + "/");

            return (
              <Link
                key={item.path}
                href={item.path}
                className={`flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {item.icon}
                {item.label}
              </Link>
            );
          })}
        </nav>

        <VersePanel />
      </div>

      <div className="border-t border-border px-4 py-4">
        {isLoading ? (
          <div className="h-10 rounded-lg bg-muted animate-pulse" />
        ) : isAuthenticated && user ? (
          <div className="flex items-center gap-3">
            {user.profileImageUrl ? (
              <img
                src={user.profileImageUrl}
                alt={displayName ?? "User"}
                className="w-8 h-8 rounded-full object-cover flex-shrink-0"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                <User className="w-4 h-4 text-primary" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{displayName}</div>
              {user.email && (
                <div className="text-xs text-muted-foreground truncate">{user.email}</div>
              )}
            </div>
            <button
              onClick={logout}
              className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-colors flex-shrink-0"
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <button
            onClick={login}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <LogIn className="w-4 h-4" />
            Sign in
          </button>
        )}
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* ── Desktop sidebar (in-flow) ─────────────────────────────── */}
      {desktopVisible && (
        <aside
          data-testid="sidebar-desktop"
          className="hidden lg:flex w-72 flex-shrink-0 flex-col bg-card border-r border-border sticky top-0 h-dvh"
          aria-label="Navigation sidebar"
        >
          {sidebarBody}
        </aside>
      )}

      {/* ── Main column ───────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen">
        <header
          ref={headerRef}
          className="sticky top-0 z-30 bg-background/90 backdrop-blur-sm border-b border-border grid grid-cols-[auto_1fr_auto] items-center px-4 py-2.5"
        >
          <button
            onClick={handleToggle}
            data-testid="button-sidebar-toggle"
            className="p-2 rounded-lg transition-colors text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={desktopVisible ? "Collapse navigation menu" : "Open navigation menu"}
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="flex items-center justify-center min-w-0">
            {centerContent}
          </div>

          <div className="flex items-center gap-1">
            {rightActions}
          </div>
        </header>

        {children}
      </div>

      {/* ── Mobile overlay ────────────────────────────────────────── */}
      {!isDesktop && mobileOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* ── Mobile sidebar (overlay) ──────────────────────────────── */}
      {!isDesktop && (
        <div
          data-testid="sidebar-mobile"
          className={`fixed top-0 left-0 h-dvh z-[60] flex flex-col bg-card border-r border-border shadow-2xl transition-transform duration-300 ease-in-out w-72 ${
            mobileOpen ? "translate-x-0" : "-translate-x-full"
          }`}
          aria-label="Navigation sidebar"
        >
          {sidebarBody}
        </div>
      )}
    </div>
  );
}

// Re-export so callers don't need to know the storage key shape.
export { SIDEBAR_STORAGE_KEY };
