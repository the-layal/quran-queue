import { LogIn } from "lucide-react";
import { useAuth } from "../hooks/useAuth";

export default function AuthRequired({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, login } = useAuth();

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[60vh]">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[60vh] px-4">
        <div className="max-w-sm w-full text-center bg-card border border-border rounded-2xl p-8 shadow-sm">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <LogIn className="w-6 h-6 text-primary" />
          </div>
          <h2 className="text-lg font-semibold mb-2">Sign in to track your progress</h2>
          <p className="text-sm text-muted-foreground mb-6">
            Create an account to start tracking your Quran memorization with spaced repetition.
          </p>
          <button
            onClick={login}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <LogIn className="w-4 h-4" />
            Sign in
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
