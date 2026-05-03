import { useRef, useState } from "react";
import { Download, Upload, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import AppShell from "../../components/AppShell";
import AuthRequired from "../../components/AuthRequired";

function SettingsContent() {
  const [downloadStatus, setDownloadStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [restoreStatus, setRestoreStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const downloadBackup = async () => {
    setDownloadStatus("loading");
    try {
      const res = await fetch("/api/backup", { credentials: "include" });
      if (!res.ok) throw new Error("Backup failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `hafith-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setDownloadStatus("done");
      setTimeout(() => setDownloadStatus("idle"), 2000);
    } catch {
      setDownloadStatus("error");
      setTimeout(() => setDownloadStatus("idle"), 3000);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setRestoreStatus("loading");
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const res = await fetch("/api/restore", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Restore failed");
      setRestoreStatus("done");
      setTimeout(() => setRestoreStatus("idle"), 2000);
    } catch {
      setRestoreStatus("error");
      setTimeout(() => setRestoreStatus("idle"), 3000);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <h1 className="text-xl font-semibold">Settings</h1>

      {/* Data section */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border/50">
          <h2 className="text-sm font-semibold">Data Management</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Export or import your memorization data as JSON.
          </p>
        </div>

        <div className="divide-y divide-border/50">
          {/* Download backup */}
          <div className="flex items-center gap-4 px-4 py-4">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">Download Backup</div>
              <div className="text-xs text-muted-foreground">
                Export all logs, SRS items, and plans as JSON
              </div>
            </div>
            <button
              onClick={downloadBackup}
              disabled={downloadStatus === "loading"}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50"
            >
              {downloadStatus === "loading" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : downloadStatus === "done" ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              ) : downloadStatus === "error" ? (
                <AlertCircle className="w-4 h-4 text-destructive" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              {downloadStatus === "done" ? "Downloaded!" : downloadStatus === "error" ? "Error" : "Export"}
            </button>
          </div>

          {/* Restore from backup */}
          <div className="flex items-center gap-4 px-4 py-4">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">Restore from Backup</div>
              <div className="text-xs text-muted-foreground">
                Import a JSON backup file — this will replace all current data
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={handleFileSelect}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={restoreStatus === "loading"}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50"
            >
              {restoreStatus === "loading" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : restoreStatus === "done" ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              ) : restoreStatus === "error" ? (
                <AlertCircle className="w-4 h-4 text-destructive" />
              ) : (
                <Upload className="w-4 h-4" />
              )}
              {restoreStatus === "done" ? "Restored!" : restoreStatus === "error" ? "Error" : "Import"}
            </button>
          </div>
        </div>
      </div>

      {/* About section */}
      <div className="bg-card border border-border rounded-xl px-4 py-4">
        <h2 className="text-sm font-semibold mb-1">About Hafith</h2>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Hafith uses spaced repetition (SM-2 algorithm) to help you memorize the Quran
          efficiently. Each segment you review gets scheduled for the optimal review time based
          on how well you remembered it.
        </p>
        <div className="mt-3 text-xs text-muted-foreground">
          <div className="grid grid-cols-2 gap-1">
            <span>Quality 0–2:</span><span>Reschedule for tomorrow</span>
            <span>Quality 3–5:</span><span>Extend interval based on ease</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <AppShell
      centerContent={
        <span className="text-sm font-medium text-muted-foreground">Settings</span>
      }
    >
      <main className="flex-1">
        <AuthRequired>
          <SettingsContent />
        </AuthRequired>
      </main>
    </AppShell>
  );
}
