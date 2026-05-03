import { useEffect, useRef, useState, type ReactNode } from "react";
import { useAuth } from "../hooks/useAuth";
import type { BackupData } from "../storage/trackerStorage";
import { localTrackerStorage } from "../storage/localTrackerStorage";
import { apiTrackerStorage } from "../storage/apiTrackerStorage";
import {
  TrackerStorageContext,
  type TrackerStorageContextValue,
  type MigrationState,
} from "./trackerStorageContextInstance";

export function TrackerStorageProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const [migration, setMigration] = useState<MigrationState>({ status: "idle" });
  // Session-level guard: prevents running migration more than once per page load.
  // Also used during render to detect "first authenticated frame" so we can block
  // children before the useEffect has a chance to fire.
  const hasMigrationRunRef = useRef(false);

  // Only select an adapter once auth state is known — while loading, use null
  // so we never accidentally write local data for a signed-in user.
  const isGuest = !isAuthenticated && !isLoading;
  const storage = isAuthenticated ? apiTrackerStorage : localTrackerStorage;

  useEffect(() => {
    if (isLoading || !isAuthenticated) return;
    if (hasMigrationRunRef.current) return;
    hasMigrationRunRef.current = true;
    runMigration();
  }, [isAuthenticated, isLoading]);

  async function runMigration() {
    const localEmpty = await localTrackerStorage.isEmpty();
    if (localEmpty) {
      setMigration({ status: "done" });
      return;
    }

    setMigration({ status: "checking" });

    try {
      const localData = await localTrackerStorage.backup();
      const accountEmpty = await apiTrackerStorage.isEmpty();

      if (accountEmpty) {
        setMigration({ status: "migrating" });
        await apiTrackerStorage.restore(localData);
        await localTrackerStorage.clear();
        setMigration({ status: "done" });
      } else {
        const [localStats, accountStats] = await Promise.all([
          localTrackerStorage.getStats(),
          apiTrackerStorage.getStats(),
        ]);
        setMigration({
          status: "conflict",
          localData,
          localLogCount: localStats.totalLogs,
          accountLogCount: accountStats.totalLogs,
        });
      }
    } catch (e) {
      setMigration({ status: "error", message: e instanceof Error ? e.message : "Migration failed. Your local data is safe." });
    }
  }

  async function resolveConflict(choice: "keep-account" | "replace-account" | "download-local") {
    if (migration.status !== "conflict") return;
    const localData: BackupData = migration.localData;

    if (choice === "download-local") {
      const blob = new Blob([JSON.stringify(localData, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `hafith-local-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      return;
    }

    setMigration({ status: "migrating" });
    try {
      if (choice === "replace-account") {
        await apiTrackerStorage.restore(localData);
      }
      await localTrackerStorage.clear();
      setMigration({ status: "done" });
    } catch (e) {
      setMigration({ status: "error", message: e instanceof Error ? e.message : "Could not complete migration. Your local data is safe." });
    }
  }

  // Block children from rendering in four cases:
  // 1. Auth state is still loading (prevents writing local data for a logged-in user)
  // 2. Authenticated but migration hasn't started yet — the useEffect fires AFTER
  //    the first render, so we must block on that first frame to prevent tracker hooks
  //    from creating API plans before isEmpty() runs.
  // 3. Migration is actively checking the account
  // 4. Migration is actively restoring data
  const migrationBlocking =
    isLoading ||
    (isAuthenticated && !hasMigrationRunRef.current && migration.status === "idle") ||
    migration.status === "checking" ||
    migration.status === "migrating";

  const value: TrackerStorageContextValue = { storage, isGuest, migration, resolveConflict };

  return (
    <TrackerStorageContext.Provider value={value}>
      {migrationBlocking ? (
        <div className="fixed inset-0 z-[100] bg-background flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-muted-foreground">
              {migration.status === "checking" ? "Checking your account…" : "Migrating your data…"}
            </p>
          </div>
        </div>
      ) : (
        children
      )}
      <MigrationDialog migration={migration} resolveConflict={resolveConflict} onRetry={() => { setMigration({ status: "idle" }); hasMigrationRunRef.current = false; runMigration(); }} />
    </TrackerStorageContext.Provider>
  );
}

function MigrationDialog({
  migration,
  resolveConflict,
  onRetry,
}: {
  migration: MigrationState;
  resolveConflict: (choice: "keep-account" | "replace-account" | "download-local") => Promise<void>;
  onRetry: () => void;
}) {
  if (migration.status === "error") {
    return (
      <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="bg-card border border-border rounded-2xl p-6 max-w-sm w-full shadow-2xl">
          <h2 className="text-base font-semibold mb-1 text-destructive">Migration failed</h2>
          <p className="text-sm text-muted-foreground mb-4">
            {migration.message} Your local data is still on this device and has not been changed.
          </p>
          <div className="flex gap-2">
            <button
              onClick={onRetry}
              className="flex-1 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Try again
            </button>
            <button
              onClick={() => window.location.reload()}
              className="flex-1 px-4 py-2.5 rounded-xl border border-border text-sm hover:bg-muted transition-colors"
            >
              Reload page
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (migration.status !== "conflict") return null;

  const { localLogCount, accountLogCount } = migration;
  return (
    <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl p-6 max-w-sm w-full shadow-2xl">
        <h2 className="text-base font-semibold mb-1">You have data in two places</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Your account already has <strong>{accountLogCount} review{accountLogCount !== 1 ? "s" : ""}</strong>.
          This device also has <strong>{localLogCount} review{localLogCount !== 1 ? "s" : ""}</strong>.
          Choose what to do:
        </p>
        <div className="space-y-2">
          <button
            onClick={() => resolveConflict("keep-account")}
            className="w-full text-left px-4 py-3 rounded-xl border border-border hover:bg-muted transition-colors"
          >
            <div className="text-sm font-medium">Keep my account data</div>
            <div className="text-xs text-muted-foreground">Discard the local data on this device</div>
          </button>
          <button
            onClick={() => resolveConflict("replace-account")}
            className="w-full text-left px-4 py-3 rounded-xl border border-border hover:bg-muted transition-colors"
          >
            <div className="text-sm font-medium">Replace account with local data</div>
            <div className="text-xs text-muted-foreground">Overwrite account data with what's on this device</div>
          </button>
          <button
            onClick={() => resolveConflict("download-local")}
            className="w-full text-left px-4 py-3 rounded-xl border border-border hover:bg-muted transition-colors"
          >
            <div className="text-sm font-medium">Download local data first</div>
            <div className="text-xs text-muted-foreground">Save a JSON backup, then decide</div>
          </button>
        </div>
      </div>
    </div>
  );
}
