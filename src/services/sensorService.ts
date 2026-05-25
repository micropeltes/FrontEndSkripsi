const API_BASE = (import.meta.env.VITE_API_BASE ?? "/api/v1").replace(/\/+$/, "");
const parsedTimeout = Number.parseInt(import.meta.env.VITE_API_TIMEOUT_MS ?? "10000", 10);
const REQUEST_TIMEOUT_MS = Number.isFinite(parsedTimeout) && parsedTimeout > 0 ? parsedTimeout : 10000;

export const SENSOR_FIELDS = ["nh3_mics", "nh3_mems", "h2s", "no2", "co", "mq135"] as const;
export const SENSOR_LIMIT_MIN = 1;
export const SENSOR_LIMIT_MAX = 1000;

export type SensorField = (typeof SENSOR_FIELDS)[number];

export type SensorRow = {
  id: number | null;
  device_id: string;
  created_at: string | null;
  timestamp_ms: number | null;
} & Record<SensorField, number | null>;

export type LatestSensorsResponse = {
  count: number;
  items: SensorRow[];
};

type FetchLatestSensorsParams = {
  deviceId?: string;
  limit?: number;
  signal?: AbortSignal;
};

function toFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const next = Number(value);
  return Number.isFinite(next) ? next : null;
}

function toSafeId(value: unknown): number | null {
  const num = toFiniteNumber(value);
  if (num === null) {
    return null;
  }

  return Math.trunc(num);
}

function toSafeDeviceId(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function toSafeTimestamp(value: unknown): { createdAt: string | null; timestampMs: number | null } {
  if (typeof value !== "string") {
    return { createdAt: null, timestampMs: null };
  }

  const createdAt = value.trim();
  if (!createdAt) {
    return { createdAt: null, timestampMs: null };
  }

  const timestampMs = Date.parse(createdAt);
  if (!Number.isFinite(timestampMs)) {
    return { createdAt, timestampMs: null };
  }

  return { createdAt, timestampMs };
}

export function sanitizeLimit(limit: unknown, fallback = 50): number {
  const parsed = Number.parseInt(String(limit ?? fallback), 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(SENSOR_LIMIT_MAX, Math.max(SENSOR_LIMIT_MIN, parsed));
}

export function sanitizeDeviceId(deviceId: unknown): string {
  return toSafeDeviceId(deviceId);
}

function sortAscendingByCreatedAt(rows: SensorRow[]): SensorRow[] {
  return [...rows].sort((a, b) => {
    const left = a.timestamp_ms ?? Number.NEGATIVE_INFINITY;
    const right = b.timestamp_ms ?? Number.NEGATIVE_INFINITY;
    return left - right;
  });
}

function normalizeSensorRow(row: unknown): SensorRow | null {
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    return null;
  }

  const raw = row as Record<string, unknown>;
  const { createdAt, timestampMs } = toSafeTimestamp(raw.created_at);

  return {
    id: toSafeId(raw.id),
    device_id: toSafeDeviceId(raw.device_id),
    created_at: createdAt,
    timestamp_ms: timestampMs,
    nh3_mics: toFiniteNumber(raw.nh3_mics),
    nh3_mems: toFiniteNumber(raw.nh3_mems),
    h2s: toFiniteNumber(raw.h2s),
    no2: toFiniteNumber(raw.no2),
    co: toFiniteNumber(raw.co),
    mq135: toFiniteNumber(raw.mq135)
  };
}

function normalizeLatestPayload(payload: unknown): LatestSensorsResponse {
  const fallback: LatestSensorsResponse = { count: 0, items: [] };

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return fallback;
  }

  const raw = payload as Record<string, unknown>;
  const rawItems = Array.isArray(raw.items) ? raw.items : [];
  const items = rawItems.map(normalizeSensorRow).filter((row): row is SensorRow => Boolean(row));
  const sortedItems = sortAscendingByCreatedAt(items);
  const countValue = toSafeId(raw.count);

  return {
    count: countValue ?? sortedItems.length,
    items: sortedItems
  };
}

async function fetchJson(url: string, signal?: AbortSignal): Promise<unknown> {
  const timeoutController = new AbortController();
  const onParentAbort = () => timeoutController.abort();

  if (signal?.aborted) {
    timeoutController.abort();
  } else if (signal) {
    signal.addEventListener("abort", onParentAbort, { once: true });
  }

  const timeoutId = setTimeout(() => timeoutController.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: timeoutController.signal });
    let payload: unknown = null;

    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (!response.ok) {
      const errorDetail =
        (payload && typeof payload === "object" && !Array.isArray(payload) && (payload as Record<string, unknown>).detail) ||
        (payload && typeof payload === "object" && !Array.isArray(payload) && (payload as Record<string, unknown>).message);

      const message =
        typeof errorDetail === "string" && errorDetail.trim()
          ? errorDetail
          : `Request failed with HTTP ${response.status}`;

      const error = new Error(message);
      (error as Error & { status?: number }).status = response.status;
      throw error;
    }

    return payload;
  } catch (error) {
    const isTimeout = timeoutController.signal.aborted && !signal?.aborted;
    if (isTimeout) {
      throw new Error(`Request timeout after ${REQUEST_TIMEOUT_MS} ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
    if (signal) {
      signal.removeEventListener("abort", onParentAbort);
    }
  }
}

export function buildLatestSensorsUrl(limit: number, deviceId = ""): string {
  const safeLimit = sanitizeLimit(limit);
  const safeDeviceId = sanitizeDeviceId(deviceId);
  const endpoint = `${API_BASE}/sensors/latest/${safeLimit}`;

  if (!safeDeviceId) {
    return endpoint;
  }

  const searchParams = new URLSearchParams({ device_id: safeDeviceId });
  return `${endpoint}?${searchParams.toString()}`;
}

export async function fetchLatestSensors(params: FetchLatestSensorsParams = {}): Promise<LatestSensorsResponse> {
  const url = buildLatestSensorsUrl(params.limit ?? 50, params.deviceId ?? "");
  const payload = await fetchJson(url, params.signal);
  return normalizeLatestPayload(payload);
}
