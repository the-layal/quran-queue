import { useContext } from "react";
import { TrackerStorageContext, type TrackerStorageContextValue } from "./trackerStorageContextInstance";

export type { TrackerStorageContextValue };

export function useTrackerStorage(): TrackerStorageContextValue {
  const ctx = useContext(TrackerStorageContext);
  if (!ctx) throw new Error("useTrackerStorage must be used inside TrackerStorageProvider");
  return ctx;
}
