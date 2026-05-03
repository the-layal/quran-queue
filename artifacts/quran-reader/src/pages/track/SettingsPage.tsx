import { useRef, useState } from "react";
import AppShell from "@/components/AppShell";
import GuestBanner from "@/components/GuestBanner";
import { Download, Upload, ShieldCheck, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";
import type { BackupData } from "@/storage/trackerStorage";

type RestoreState = "idle" | "confirm" | "loading" | "done" | "error";

export default function SettingsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [downloadLoading, setDownloadLoading] = useState(false);
  const [restoreState, setRestoreState] = useState<RestoreState>("idle");
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [pendingBackup, setPendingBackup] = useState<BackupData | null>(null);
  const [importedCounts, setImportedCounts] = useState<{ logs: number; srsItems: number; dailyPlans: number } | null>(null);

  async function handleDownload() {
    setDownloadLoading(true);
    try {
      const res = await fetch("/api/backup", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to export backup");
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const dateStr = new Date().toISOString().split("T")[0];
      a.download = `hafith-backup-${dateStr}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert("Export failed: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setDownloadLoading(false);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string);
        if (parsed.version !== 1 || !Array.isArray(parsed.logs) || !Array.isArray(parsed.srsItems) || !Array.isArray(parsed.dailyPlans)) {
          setRestoreError("This file doesn't look like a valid Hafith backup.");
          setRestoreState("error");
          return;
        }
        setPendingBackup(parsed);
        setRestoreState("confirm");
        setRestoreError(null);
      } catch {
        setRestoreError("Could not read the file. Make sure it's a valid JSON backup.");
        setRestoreState("error");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  async function handleConfirmRestore() {
    if (!pendingBackup) return;
    setRestoreState("loading");
    try {
      const res = await fetch("/api/backup/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pendingBackup),
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Restore failed");
      }
      const result = await res.json();
      setImportedCounts(result.imported);
      setRestoreState("done");
      queryClient.invalidateQueries();
    } catch (e) {
      setRestoreError(e instanceof Error ? e.message : "Something went wrong during restore.");
      setRestoreState("error");
    }
    setPendingBackup(null);
  }

  function resetRestore() {
    setRestoreState("idle");
    setRestoreError(null);
    setPendingBackup(null);
    setImportedCounts(null);
  }

  return (
    <AppShell>
      <GuestBanner />
      <div className="p-4 max-w-xl mx-auto space-y-6">
        <div className="bg-card rounded-2xl border border-border/50 p-6">
          <h2 className="font-serif font-semibold text-foreground text-lg mb-4">Account</h2>
          <div className="flex items-center gap-4">
            {user?.profileImageUrl ? (
              <img src={user.profileImageUrl} alt="" className="w-12 h-12 rounded-full" />
            ) : (
              <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center text-lg font-bold font-serif">
                {(user?.firstName || user?.email || "U")[0].toUpperCase()}
              </div>
            )}
            <div>
              <p className="font-medium text-foreground">
                {user?.firstName ? `${user.firstName}${user.lastName ? " " + user.lastName : ""}` : "Hafith User"}
              </p>
              <p className="text-sm text-muted-foreground">{user?.email || ""}</p>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-border/40">
            <a href="/api/logout" className="text-sm text-muted-foreground hover:text-foreground transition-colors" data-testid="button-logout-settings">
              Sign out
            </a>
          </div>
        </div>

        <div className="bg-card rounded-2xl border border-border/50 p-6">
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck size={18} className="text-primary" />
            <h2 className="font-serif font-semibold text-foreground text-lg">Data Backup</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-6">
            Export all your data — revision logs, SRS progress, and daily plan history — as a JSON file.
          </p>

          <div className="bg-secondary/30 rounded-xl p-4 border border-border/40 mb-4">
            <h3 className="font-medium text-foreground text-sm mb-1">Download backup</h3>
            <p className="text-xs text-muted-foreground mb-3">
              Saves a <code className="font-mono bg-secondary px-1 rounded">hafith-backup-[date].json</code> file to your device.
            </p>
            <button
              data-testid="button-download-backup"
              onClick={handleDownload}
              disabled={downloadLoading}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all",
                "bg-primary text-primary-foreground hover:bg-primary/90",
                downloadLoading && "opacity-70 pointer-events-none",
              )}
            >
              {downloadLoading ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
              {downloadLoading ? "Exporting…" : "Download backup"}
            </button>
          </div>

          <div className="bg-secondary/30 rounded-xl p-4 border border-border/40">
            <h3 className="font-medium text-foreground text-sm mb-1">Restore from backup</h3>
            <p className="text-xs text-muted-foreground mb-3">
              Upload a <code className="font-mono bg-secondary px-1 rounded">.json</code> backup file. <span className="text-amber-600 font-medium">This will replace all your current data.</span>
            </p>

            {restoreState === "idle" && (
              <>
                <input ref={fileInputRef} type="file" accept=".json,application/json" className="hidden" onChange={handleFileChange} data-testid="input-restore-file" />
                <button
                  data-testid="button-upload-backup"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all border border-border hover:bg-secondary/60 text-foreground"
                >
                  <Upload size={15} /> Choose backup file
                </button>
              </>
            )}

            {restoreState === "confirm" && pendingBackup && (
              <div className="space-y-3">
                <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3">
                  <AlertTriangle size={15} className="text-amber-600 mt-0.5 shrink-0" />
                  <div className="text-xs text-amber-800">
                    <p className="font-semibold mb-1">Are you sure?</p>
                    <p>This will delete all your current data and replace it with:</p>
                    <ul className="mt-1 space-y-0.5 list-disc list-inside">
                      <li>{pendingBackup.logs.length} revision logs</li>
                      <li>{pendingBackup.srsItems.length} SRS items</li>
                      <li>{pendingBackup.dailyPlans.length} daily plans</li>
                    </ul>
                    <p className="mt-1 text-muted-foreground">Backed up on {new Date(pendingBackup.exportedAt).toLocaleDateString()}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button data-testid="button-confirm-restore" onClick={handleConfirmRestore} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium bg-amber-500 text-white hover:bg-amber-600 transition-colors">
                    Yes, restore
                  </button>
                  <button data-testid="button-cancel-restore" onClick={resetRestore} className="px-4 py-2 rounded-xl text-sm font-medium border border-border hover:bg-secondary/60 transition-colors text-foreground">
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {restoreState === "loading" && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 size={15} className="animate-spin" /> Restoring your data…
              </div>
            )}

            {restoreState === "done" && importedCounts && (
              <div className="space-y-3">
                <div className="flex items-start gap-2 bg-primary/5 border border-primary/20 rounded-xl p-3">
                  <CheckCircle2 size={15} className="text-primary mt-0.5 shrink-0" />
                  <div className="text-xs text-foreground">
                    <p className="font-semibold mb-1">Restore complete!</p>
                    <ul className="space-y-0.5 text-muted-foreground">
                      <li>{importedCounts.logs} revision logs</li>
                      <li>{importedCounts.srsItems} SRS items</li>
                      <li>{importedCounts.dailyPlans} daily plans</li>
                    </ul>
                  </div>
                </div>
                <button onClick={resetRestore} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                  Restore another file
                </button>
              </div>
            )}

            {restoreState === "error" && (
              <div className="space-y-3">
                <div className="flex items-start gap-2 bg-destructive/5 border border-destructive/20 rounded-xl p-3">
                  <AlertTriangle size={15} className="text-destructive mt-0.5 shrink-0" />
                  <p className="text-xs text-destructive">{restoreError}</p>
                </div>
                <button onClick={resetRestore} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                  Try again
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
