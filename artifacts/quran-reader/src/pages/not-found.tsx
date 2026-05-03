import { AlertCircle } from "lucide-react";
import AppShell from "../components/AppShell";

export default function NotFound() {
  return (
    <AppShell>
      <main className="flex-1 flex items-center justify-center">
        <div className="text-center px-4">
          <AlertCircle className="h-10 w-10 text-destructive mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">404 — Page Not Found</h1>
          <p className="text-sm text-muted-foreground">
            This page doesn't exist. Use the menu to navigate.
          </p>
        </div>
      </main>
    </AppShell>
  );
}
