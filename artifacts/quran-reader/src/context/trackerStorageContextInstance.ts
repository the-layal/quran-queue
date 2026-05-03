import { createContext } from "react";
import type { ITrackerStorage, BackupData } from "../storage/trackerStorage";

type MigrationState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "conflict"; localData: BackupData; localLogCount: number; accountLogCount: number }
  | { status: "migrating" }
  | { status: "error"; message: string }
  | { status: "done" };

export type { MigrationState };

export interface TrackerStorageContextValue {
  storage: ITrackerStorage;
  isGuest: boolean;
  migration: MigrationState;
  resolveConflict: (choice: "keep-account" | "replace-account" | "download-local") => Promise<void>;
}

export const TrackerStorageContext = createContext<TrackerStorageContextValue | null>(null);
