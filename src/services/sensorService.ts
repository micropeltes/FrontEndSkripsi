export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000").replace(/\/+$/, "");
const API_BASE = `${API_BASE_URL}/api/v1`;
const parsedTimeout = Number.parseInt(import.meta.env.VITE_API_TIMEOUT_MS ?? "10000", 10);
const REQUEST_TIMEOUT_MS = Number.isFinite(parsedTimeout) && parsedTimeout > 0 ? parsedTimeout : 10000;

export const SENSOR_FIELDS = ["mq135", "nh3_mics", "co", "no2", "nh3_mems", "h2s"] as const;
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
  raw_items?: unknown[];
};

type FetchLatestSensorsParams = {
  deviceId?: string;
  device_id?: string;
  limit?: number;
  signal?: AbortSignal;
};

type FetchSensorHistoryParams = {
  deviceId?: string;
  device_id?: string;
  start_time?: string;
  end_time?: string;
  limit?: number;
  signal?: AbortSignal;
};

type HealthResponse = {
  online: boolean;
  status: string;
  payload: unknown;
};

export type FlattenedSensorRow = {
  created_at: string | null;
  device_id: string;
  sensor_name: string;
  adc: number | null;
  voltage: number | null;
  ppm: number | null;
  unit: string;
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
  const sensors =
    raw.sensors && typeof raw.sensors === "object" && !Array.isArray(raw.sensors)
      ? (raw.sensors as Record<string, unknown>)
      : {};

  function sensorPpm(sensorName: SensorField): number | null {
    const sensorNode = sensors[sensorName];
    if (!sensorNode || typeof sensorNode !== "object" || Array.isArray(sensorNode)) {
      return toFiniteNumber(raw[sensorName]);
    }

    return toFiniteNumber((sensorNode as Record<string, unknown>).ppm) ?? toFiniteNumber(raw[sensorName]);
  }

  return {
    id: toSafeId(raw.id),
    device_id: toSafeDeviceId(raw.device_id),
    created_at: createdAt,
    timestamp_ms: timestampMs,
    mq135: sensorPpm("mq135"),
    nh3_mics: sensorPpm("nh3_mics"),
    co: sensorPpm("co"),
    no2: sensorPpm("no2"),
    nh3_mems: sensorPpm("nh3_mems"),
    h2s: sensorPpm("h2s")
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
    items: sortedItems,
    raw_items: rawItems
  };
}

export async function fetchJson(url: string, signal?: AbortSignal): Promise<unknown> {
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


function appendOptionalParam(searchParams: URLSearchParams, key: string, value: unknown) {
  if (value === null || value === undefined || value === "") {
    return;
  }
  searchParams.set(key, String(value));
}

export function validateHistoryTimeRange(startTime?: string, endTime?: string): string {
  if (!startTime || !endTime) {
    return "start_time dan end_time wajib diisi sebelum memuat history.";
  }

  const startMs = Date.parse(startTime);
  const endMs = Date.parse(endTime);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return "Format start_time atau end_time tidak valid.";
  }
  if (startMs > endMs) {
    return "start_time tidak boleh lebih besar dari end_time.";
  }
  return "";
}

export function flattenSensorItems(items: unknown): FlattenedSensorRow[] {
  if (!Array.isArray(items)) {
    return [];
  }

  return items.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return [];
    }

    const raw = item as Record<string, unknown>;
    const sensors = raw.sensors && typeof raw.sensors === "object" && !Array.isArray(raw.sensors)
      ? (raw.sensors as Record<string, unknown>)
      : {};

    return Object.entries(sensors).map(([sensorName, sensorValue]) => {
      const sensor = sensorValue && typeof sensorValue === "object" && !Array.isArray(sensorValue)
        ? (sensorValue as Record<string, unknown>)
        : {};

      return {
        created_at: typeof raw.created_at === "string" ? raw.created_at : null,
        device_id: toSafeDeviceId(raw.device_id),
        sensor_name: sensorName,
        adc: toFiniteNumber(sensor.adc),
        voltage: toFiniteNumber(sensor.voltage),
        ppm: toFiniteNumber(sensor.ppm),
        unit: typeof sensor.unit === "string" ? sensor.unit : ""
      };
    });
  });
}

export async function getApiHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const payload = await fetchJson(`${API_BASE_URL}/health`, signal);
  const status = payload && typeof payload === "object" && !Array.isArray(payload)
    ? String((payload as Record<string, unknown>).status ?? "online")
    : "online";
  return { online: true, status, payload };
}

export async function getMqttHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const payload = await fetchJson(`${API_BASE_URL}/health/mqtt`, signal);
  const status = payload && typeof payload === "object" && !Array.isArray(payload)
    ? String((payload as Record<string, unknown>).status ?? "connected")
    : "connected";
  return { online: true, status, payload };
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
  const url = buildLatestSensorsUrl(params.limit ?? 100, params.device_id ?? params.deviceId ?? "");
  const payload = await fetchJson(url, params.signal);
  return normalizeLatestPayload(payload);
}


export const getLatestSensors = fetchLatestSensors;

export function buildSensorHistoryUrl(params: FetchSensorHistoryParams): string {
  const searchParams = new URLSearchParams();
  appendOptionalParam(searchParams, "device_id", sanitizeDeviceId(params.device_id ?? params.deviceId ?? ""));
  appendOptionalParam(searchParams, "start_time", params.start_time);
  appendOptionalParam(searchParams, "end_time", params.end_time);
  appendOptionalParam(searchParams, "limit", sanitizeLimit(params.limit ?? 1000, 1000));

  const query = searchParams.toString();
  return `${API_BASE}/sensors/history${query ? `?${query}` : ""}`;
}

export async function getSensorHistory(params: FetchSensorHistoryParams): Promise<LatestSensorsResponse> {
  const validationError = validateHistoryTimeRange(params.start_time, params.end_time);
  if (validationError) {
    throw new Error(validationError);
  }

  const payload = await fetchJson(buildSensorHistoryUrl(params), params.signal);
  return normalizeLatestPayload(payload);
}
