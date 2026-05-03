import { useState, useEffect, useRef } from "react";
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

interface AppShellProps {
  children: React.ReactNode;
  rightActions?: React.ReactNode;
  centerContent?: React.ReactNode;
}

export default function AppShell({ children, rightActions, centerContent }: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [location] = useLocation();
  const { user, isLoading, isAuthenticated, login, logout } = useAuth();

  const headerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    setSidebarOpen(false);
  }, [location]);

  // Measure the header height and expose it as a CSS variable so descendants
  // (e.g. mushaf-mode wrapper) can use `calc(100dvh - var(--app-header-h))`
  // without hard-coding a brittle pixel value.
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

  useEffect(() => {
    if (sidebarOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [sidebarOpen]);

  const displayName = user
    ? user.firstName
      ? `${user.firstName}${user.lastName ? " " + user.lastName : ""}`
      : user.email ?? "Signed in"
    : null;

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground">
      {/* ── Top bar ─────────────────────────────────────────────────── */}
      <header ref={headerRef} className="sticky top-0 z-30 bg-background/90 backdrop-blur-sm border-b border-border grid grid-cols-[auto_1fr_auto] items-center px-4 py-2.5">
        {/* Left: Menu icon */}
        <button
          onClick={() => setSidebarOpen(true)}
          className="p-2 rounded-lg transition-colors text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Open navigation menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Center: contextual content passed by child */}
        <div className="flex items-center justify-center min-w-0">
          {centerContent}
        </div>

        {/* Right: contextual actions passed by child */}
        <div className="flex items-center gap-1">
          {rightActions}
        </div>
      </header>

      {/* ── Sidebar overlay ─────────────────────────────────────────── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar panel ───────────────────────────────────────────── */}
      <div
        className={`fixed top-0 left-0 h-full z-[60] flex flex-col bg-card border-r border-border shadow-2xl transition-transform duration-300 ease-in-out w-72 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        aria-label="Navigation sidebar"
      >
        {/* Sidebar header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-border">
          <span className="font-semibold text-base">Hafith</span>
          <button
            onClick={() => setSidebarOpen(false)}
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-colors"
            aria-label="Close sidebar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Nav items */}
        <nav className="flex-1 overflow-y-auto py-3">
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

        {/* Account area */}
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
      </div>

      {/* ── Main content ────────────────────────────────────────────── */}
      {children}
    </div>
  );
}
