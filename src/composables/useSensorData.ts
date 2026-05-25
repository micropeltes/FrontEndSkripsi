import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchLatestSensors, sanitizeDeviceId, sanitizeLimit, type SensorRow } from "@/services/sensorService";

const DEFAULT_LIMIT = 50;
const DEFAULT_POLL_MS = 5000;

type QueryState = {
  limit: number;
  deviceId: string;
};

type SensorDataState = {
  count: number;
  items: SensorRow[];
  loading: boolean;
  refreshing: boolean;
  error: string;
  empty: boolean;
  lastSyncedAt: string;
};

type RefreshOptions = {
  silent?: boolean;
};

type UseSensorDataOptions = {
  initialLimit?: number;
  initialDeviceId?: string;
  pollIntervalMs?: number;
  paused?: boolean;
};

function buildItemsSignature(items: SensorRow[]): string {
  const first = items[0];
  const last = items[items.length - 1];

  const firstKey = first ? `${first.id ?? "x"}:${first.created_at ?? "x"}` : "none";
  const lastKey = last ? `${last.id ?? "x"}:${last.created_at ?? "x"}` : "none";
  return `${items.length}|${firstKey}|${lastKey}`;
}

function createInitialState(): SensorDataState {
  return {
    count: 0,
    items: [],
    loading: true,
    refreshing: false,
    error: "",
    empty: false,
    lastSyncedAt: ""
  };
}

export function useSensorData(options: UseSensorDataOptions = {}) {
  const [query, setQueryState] = useState<QueryState>({
    limit: sanitizeLimit(options.initialLimit ?? DEFAULT_LIMIT, DEFAULT_LIMIT),
    deviceId: sanitizeDeviceId(options.initialDeviceId ?? "")
  });
  const [state, setState] = useState<SensorDataState>(createInitialState);

  const inFlightRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const signatureRef = useRef<string>("");

  const pollIntervalMs = Number.isFinite(options.pollIntervalMs) && (options.pollIntervalMs ?? 0) > 0
    ? Number(options.pollIntervalMs)
    : DEFAULT_POLL_MS;
  const pollingPaused = Boolean(options.paused);

  const updateQuery = useCallback((next: Partial<QueryState>) => {
    setQueryState((current) => ({
      limit: sanitizeLimit(next.limit ?? current.limit, current.limit),
      deviceId: sanitizeDeviceId(next.deviceId ?? current.deviceId)
    }));
  }, []);

  const refresh = useCallback(
    async (refreshOptions: RefreshOptions = {}) => {
      const silent = Boolean(refreshOptions.silent);
      if (inFlightRef.current) {
        return;
      }

      inFlightRef.current = true;

      setState((current) => ({
        ...current,
        loading: silent ? current.loading : true,
        refreshing: silent ? true : Boolean(current.lastSyncedAt),
        error: silent ? current.error : ""
      }));

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const result = await fetchLatestSensors({
          limit: query.limit,
          deviceId: query.deviceId,
          signal: controller.signal
        });

        const nextSignature = buildItemsSignature(result.items);

        setState((current) => {
          const hasDataChanged = signatureRef.current !== nextSignature;
          signatureRef.current = nextSignature;

          if (!hasDataChanged) {
            return {
              ...current,
              count: result.count,
              loading: false,
              refreshing: false,
              error: "",
              empty: result.items.length === 0,
              lastSyncedAt: new Date().toISOString()
            };
          }

          return {
            count: result.count,
            items: result.items,
            loading: false,
            refreshing: false,
            error: "",
            empty: result.items.length === 0,
            lastSyncedAt: new Date().toISOString()
          };
        });
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }

        setState((current) => ({
          ...current,
          loading: false,
          refreshing: false,
          error: error instanceof Error ? error.message : "Gagal mengambil data sensor terbaru"
        }));
      } finally {
        inFlightRef.current = false;
      }
    },
    [query.deviceId, query.limit]
  );

  useEffect(() => {
    refresh({ silent: false });

    return () => {
      inFlightRef.current = false;
      abortRef.current?.abort();
    };
  }, [refresh]);

  useEffect(() => {
    if (pollingPaused) {
      return undefined;
    }

    const timer = setInterval(() => {
      refresh({ silent: true });
    }, pollIntervalMs);

    return () => clearInterval(timer);
  }, [pollIntervalMs, pollingPaused, refresh]);

  const output = useMemo(
    () => ({
      ...state,
      query,
      pollIntervalMs,
      setQuery: updateQuery,
      refresh
    }),
    [pollIntervalMs, query, refresh, state, updateQuery]
  );

  return output;
}

export default useSensorData;
