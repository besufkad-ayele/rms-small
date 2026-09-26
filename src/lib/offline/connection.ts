import type { ConnectionSnapshot, ConnectionStatus } from "./types";

/** How often we probe the network (user requirement). */
export const CONNECTION_CHECK_INTERVAL_MS = 5_000;

/** Auto-sync only when RTT is at or below this. */
export const FAST_LATENCY_MS = 2_000;

/** Abort a hung probe so the checker never blocks. */
const PING_TIMEOUT_MS = 4_000;

type Listener = (snapshot: ConnectionSnapshot) => void;

let latest: ConnectionSnapshot = {
  status: "live",
  latencyMs: null,
  checkedAt: new Date().toISOString(),
  fastEnough: true,
};

const listeners = new Set<Listener>();
let timer: ReturnType<typeof setInterval> | null = null;
let checking = false;

function emit(next: ConnectionSnapshot) {
  latest = next;
  for (const fn of listeners) fn(next);
}

function classify(ok: boolean, latencyMs: number | null): ConnectionStatus {
  if (!ok || latencyMs === null) return "down";
  if (latencyMs > FAST_LATENCY_MS) return "slow";
  return "live";
}

export function getConnectionSnapshot(): ConnectionSnapshot {
  return latest;
}

export function subscribeConnection(listener: Listener): () => void {
  listeners.add(listener);
  listener(latest);
  return () => listeners.delete(listener);
}

export async function probeConnection(): Promise<ConnectionSnapshot> {
  if (typeof window === "undefined") {
    return latest;
  }

  if (!navigator.onLine) {
    const down: ConnectionSnapshot = {
      status: "down",
      latencyMs: null,
      checkedAt: new Date().toISOString(),
      fastEnough: false,
    };
    emit(down);
    return down;
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), PING_TIMEOUT_MS);
  const started = performance.now();

  try {
    const res = await fetch("/api/health", {
      method: "HEAD",
      cache: "no-store",
      signal: controller.signal,
    });
    const latencyMs = Math.round(performance.now() - started);
    const ok = res.ok;
    const status = classify(ok, latencyMs);
    const snapshot: ConnectionSnapshot = {
      status,
      latencyMs: ok ? latencyMs : null,
      checkedAt: new Date().toISOString(),
      fastEnough: status === "live",
    };
    emit(snapshot);
    return snapshot;
  } catch {
    const down: ConnectionSnapshot = {
      status: "down",
      latencyMs: null,
      checkedAt: new Date().toISOString(),
      fastEnough: false,
    };
    emit(down);
    return down;
  } finally {
    window.clearTimeout(timeout);
  }
}

export function startConnectionChecker(): () => void {
  if (typeof window === "undefined") return () => undefined;
  if (timer) return () => undefined;

  const run = () => {
    if (checking) return;
    checking = true;
    void probeConnection().finally(() => {
      checking = false;
    });
  };

  run();
  timer = setInterval(run, CONNECTION_CHECK_INTERVAL_MS);

  const onOnline = () => void probeConnection();
  const onOffline = () => {
    emit({
      status: "down",
      latencyMs: null,
      checkedAt: new Date().toISOString(),
      fastEnough: false,
    });
  };
  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);

  return () => {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOffline);
  };
}
