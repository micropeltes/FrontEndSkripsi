import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchHealth } from "@/services/enoseService";

const DEFAULT_POLL_MS = 5000;

type HealthState = {
  status: "checking" | "online" | "offline";
  message: string;
  lastCheckedAt: string;
};

type UseBackendHealthOptions = {
  pollIntervalMs?: number;
  paused?: boolean;
};

function createInitialState(): HealthState {
  return {
    status: "checking",
    message: "",
    lastCheckedAt: ""
  };
}

export function useBackendHealth(options: UseBackendHealthOptions = {}) {
  const [state, setState] = useState<HealthState>(createInitialState);
  const runningRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  const pollIntervalMs = Number.isFinite(options.pollIntervalMs) && (options.pollIntervalMs ?? 0) > 0
    ? Number(options.pollIntervalMs)
    : DEFAULT_POLL_MS;
  const paused = Boolean(options.paused);

  const refresh = useCallback(async () => {
    if (runningRef.current) {
      return;
    }

    runningRef.current = true;
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const payload = await fetchHealth(controller.signal);
      setState({
        status: payload.status.toLowerCase() === "ok" ? "online" : "offline",
        message: payload.status,
        lastCheckedAt: new Date().toISOString()
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }

      setState({
        status: "offline",
        message: error instanceof Error ? error.message : "Tidak dapat terhubung ke backend",
        lastCheckedAt: new Date().toISOString()
      });
    } finally {
      runningRef.current = false;
    }
  }, []);

  useEffect(() => {
    refresh();
    return () => {
      runningRef.current = false;
      abortRef.current?.abort();
    };
  }, [refresh]);

  useEffect(() => {
    if (paused) {
      return undefined;
    }

    const timer = setInterval(() => {
      refresh();
    }, pollIntervalMs);

    return () => clearInterval(timer);
  }, [paused, pollIntervalMs, refresh]);

  return useMemo(
    () => ({
      ...state,
      refresh
    }),
    [refresh, state]
  );
}

export default useBackendHealth;
