"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  getConnectionSnapshot,
  startConnectionChecker,
  subscribeConnection,
} from "@/lib/offline/connection";
import { countPendingSync } from "@/lib/offline/queue";
import { prefetchCatalog } from "@/lib/offline/resilient";
import { processSyncQueue } from "@/lib/offline/sync-engine";
import type { ConnectionSnapshot, SyncResult } from "@/lib/offline/types";

interface OfflineSyncContextValue {
  connection: ConnectionSnapshot;
  pendingCount: number;
  isSyncing: boolean;
  lastSyncedAt: string | null;
  syncDialog: {
    open: boolean;
    result: SyncResult | null;
    source: "auto" | "manual";
  };
  closeSyncDialog: () => void;
  syncNow: (source?: "auto" | "manual") => Promise<SyncResult | null>;
  refreshPendingCount: () => Promise<void>;
}

const OfflineSyncContext = createContext<OfflineSyncContextValue | null>(null);

export function OfflineSyncProvider({ children }: { children: ReactNode }) {
  const { tenant, ready } = useAuth();
  const orgId = tenant?.organization.id;
  const [connection, setConnection] = useState<ConnectionSnapshot>(() =>
    getConnectionSnapshot(),
  );
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [syncDialog, setSyncDialog] = useState<{
    open: boolean;
    result: SyncResult | null;
    source: "auto" | "manual";
  }>({ open: false, result: null, source: "auto" });

  const syncingRef = useRef(false);
  const wasDownRef = useRef(false);
  const prefetchedOrgRef = useRef<string | null>(null);

  const refreshPendingCount = useCallback(async () => {
    setPendingCount(await countPendingSync(orgId));
  }, [orgId]);

  const syncNow = useCallback(
    async (source: "auto" | "manual" = "manual") => {
      if (syncingRef.current) return null;
      const snap = getConnectionSnapshot();
      if (snap.status === "down") return null;
      if (source === "auto" && !snap.fastEnough) return null;

      syncingRef.current = true;
      setIsSyncing(true);
      try {
        // Manual sync resets exhausted retries so sales can try again
        const result = await processSyncQueue(orgId, {
          resetFailed: source === "manual",
        });
        if (orgId && source === "manual") {
          void prefetchCatalog(orgId).catch(() => undefined);
        }
        setLastSyncedAt(new Date().toISOString());
        await refreshPendingCount();
        if (result.succeeded > 0 || source === "manual") {
          setSyncDialog({ open: true, result, source });
        }
        return result;
      } catch (err) {
        console.error("Sync failed", err);
        return null;
      } finally {
        syncingRef.current = false;
        setIsSyncing(false);
      }
    },
    [orgId, refreshPendingCount],
  );

  const closeSyncDialog = useCallback(() => {
    setSyncDialog((prev) => ({ ...prev, open: false }));
  }, []);

  useEffect(() => {
    const stop = startConnectionChecker();
    const unsub = subscribeConnection((snap) => {
      setConnection(snap);
      const wasDown = wasDownRef.current;
      wasDownRef.current = snap.status === "down";

      if (wasDown && snap.fastEnough) {
        void syncNow("auto");
      } else if (snap.fastEnough && !wasDown) {
        void (async () => {
          const count = await countPendingSync(orgId);
          if (count > 0) void syncNow("auto");
        })();
      }
    });
    return () => {
      stop();
      unsub();
    };
  }, [orgId, syncNow]);

  useEffect(() => {
    void refreshPendingCount();
    const id = window.setInterval(() => void refreshPendingCount(), 5_000);
    return () => window.clearInterval(id);
  }, [refreshPendingCount]);

  // Prefetch full catalog once per org while online (enables offline POS)
  useEffect(() => {
    if (!ready || !orgId) return;
    if (connection.status === "down") return;
    if (prefetchedOrgRef.current === orgId) return;
    prefetchedOrgRef.current = orgId;
    void prefetchCatalog(orgId).catch(() => {
      prefetchedOrgRef.current = null;
    });
  }, [ready, orgId, connection.status]);

  const value = useMemo(
    () => ({
      connection,
      pendingCount,
      isSyncing,
      lastSyncedAt,
      syncDialog,
      closeSyncDialog,
      syncNow,
      refreshPendingCount,
    }),
    [
      connection,
      pendingCount,
      isSyncing,
      lastSyncedAt,
      syncDialog,
      closeSyncDialog,
      syncNow,
      refreshPendingCount,
    ],
  );

  return (
    <OfflineSyncContext.Provider value={value}>
      {children}
    </OfflineSyncContext.Provider>
  );
}

export function useOfflineSync() {
  const ctx = useContext(OfflineSyncContext);
  if (!ctx) {
    throw new Error("useOfflineSync must be used within OfflineSyncProvider");
  }
  return ctx;
}
