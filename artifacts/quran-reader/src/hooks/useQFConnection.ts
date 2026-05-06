import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";

interface QFStatus {
  isConnected: boolean;
  displayName: string | null;
  email: string | null;
  tokenExpiry: string | null;
  syncError: string | null;
}

async function fetchQFStatus(): Promise<QFStatus> {
  const res = await fetch("/api/auth/qf/status", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch QF connection status");
  return res.json() as Promise<QFStatus>;
}

async function disconnectQF(): Promise<void> {
  const res = await fetch("/api/auth/qf/disconnect", {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to disconnect");
}

/**
 * Hook exposing Quran Foundation connection state.
 * Other components (Bookmarks, Goals) use this to decide whether to show sync features.
 */
export function useQFConnection() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery<QFStatus>({
    queryKey: ["qf-connection"],
    queryFn: fetchQFStatus,
    enabled: !!user,
    staleTime: 60_000,
  });

  const disconnect = useMutation({
    mutationFn: disconnectQF,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["qf-connection"] });
    },
  });

  return {
    isQFConnected: query.data?.isConnected ?? false,
    qfDisplayName: query.data?.displayName ?? null,
    qfEmail: query.data?.email ?? null,
    qfTokenExpiry: query.data?.tokenExpiry ?? null,
    qfSyncError: query.data?.syncError ?? null,
    isLoading: query.isLoading,
    disconnect: disconnect.mutate,
    isDisconnecting: disconnect.isPending,
    refetchStatus: () => query.refetch(),
  };
}
