const API_BASE = (import.meta.env.VITE_API_BASE ?? "/api").replace(/\/+$/, "");
const apiVersionRaw = (import.meta.env.VITE_API_VERSION ?? "v1").trim();
const API_VERSION = apiVersionRaw.replace(/^\/+|\/+$/g, "");
const API_ROOT = API_VERSION ? `${API_BASE}/${API_VERSION}` : API_BASE;

const parsedTimeout = Number.parseInt(import.meta.env.VITE_API_TIMEOUT_MS ?? "10000", 10);
const REQUEST_TIMEOUT_MS = Number.isFinite(parsedTimeout) && parsedTimeout > 0 ? parsedTimeout : 10000;

export const FALLBACK_SENSORS = ["nh3_mics", "nh3_mems", "h2s", "no2", "co", "mq135"] as const;

export type HealthPayload = {
  status: string;
};

export type SupportedSensorsPayload = {
  sensors: string[];
};

export type SensorLatestItem = {
  sensor: string;
  adc: number | null;
  voltage: number | null;
  rs: number | null;
  r0: number | null;
  ratio: number | null;
  ppm: number | null;
  unit: string;
  created_at: string | null;
  device_id: string;
};

export type SensorLatestAllPayload = {
  count: number;
  items: SensorLatestItem[];
};

export type SensorHistoryItem = {
  id: number | null;
  device_id: string;
  created_at: string | null;
  nh3_mics: number | null;
  nh3_mems: number | null;
  h2s: number | null;
  no2: number | null;
  co: number | null;
  mq135: number | null;
};

export type SensorHistoryPayload = {
  count: number;
  items: SensorHistoryItem[];
};

export type ConvertAdcPayload = {
  sensor: string;
  adc: number;
  device_id?: string;
  temperature_c?: number;
  humidity_pct?: number;
};

export type ConvertResult = {
  sensor: string;
  adc: number | null;
  voltage: number | null;
  rs: number | null;
  r0: number | null;
  ratio: number | null;
  ppm: number | null;
  unit: string;
};

export type CalibrationPayload = {
  sensor: string;
  device_id: string;
  r0: number | null;
  rl_ohm: number | null;
  vcc: number | null;
  ratio_mode: string;
};

export type CalibrationUpsertInput = {
  device_id: string;
  r0: number;
  rl_ohm: number;
  vcc: number;
  ratio_mode: string;
};

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toStringValue(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function toDatetime(value: unknown): string | null {
  const raw = toStringValue(value);
  if (!raw) {
    return null;
  }

  const timestamp = Date.parse(raw);
  if (!Number.isFinite(timestamp)) {
    return raw;
  }

  return new Date(timestamp).toISOString();
}

function toInteger(value: unknown): number | null {
  const numeric = toNumber(value);
  if (numeric === null) {
    return null;
  }

  return Math.trunc(numeric);
}

function sanitizeDeviceId(deviceId: unknown): string {
  return toStringValue(deviceId);
}

function normalizeLatestItem(row: unknown): SensorLatestItem | null {
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    return null;
  }

  const raw = row as Record<string, unknown>;

  return {
    sensor: toStringValue(raw.sensor),
    adc: toNumber(raw.adc),
    voltage: toNumber(raw.voltage),
    rs: toNumber(raw.rs),
    r0: toNumber(raw.r0),
    ratio: toNumber(raw.ratio),
    ppm: toNumber(raw.ppm),
    unit: toStringValue(raw.unit) || "ppm",
    created_at: toDatetime(raw.created_at),
    device_id: toStringValue(raw.device_id)
  };
}

function normalizeHistoryItem(row: unknown): SensorHistoryItem | null {
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    return null;
  }

  const raw = row as Record<string, unknown>;

  return {
    id: toInteger(raw.id),
    device_id: toStringValue(raw.device_id),
    created_at: toDatetime(raw.created_at),
    nh3_mics: toNumber(raw.nh3_mics),
    nh3_mems: toNumber(raw.nh3_mems),
    h2s: toNumber(raw.h2s),
    no2: toNumber(raw.no2),
    co: toNumber(raw.co),
    mq135: toNumber(raw.mq135)
  };
}

function buildUrl(path: string, query: Record<string, string | number | null | undefined> = {}): string {
  const endpoint = `${API_ROOT}${path.startsWith("/") ? path : `/${path}`}`;
  const searchParams = new URLSearchParams();

  Object.entries(query).forEach(([key, value]) => {
    if (value === null || value === undefined || value === "") {
      return;
    }

    searchParams.set(key, String(value));
  });

  const serialized = searchParams.toString();
  return serialized ? `${endpoint}?${serialized}` : endpoint;
}

async function fetchJson(url: string, options: RequestInit = {}): Promise<unknown> {
  const timeoutController = new AbortController();
  const parentSignal = options.signal;
  const onParentAbort = () => timeoutController.abort();

  if (parentSignal?.aborted) {
    timeoutController.abort();
  } else if (parentSignal) {
    parentSignal.addEventListener("abort", onParentAbort, { once: true });
  }

  const timeoutId = setTimeout(() => timeoutController.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...options,
      signal: timeoutController.signal,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers ?? {})
      }
    });

    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (!response.ok) {
      const detail =
        payload &&
        typeof payload === "object" &&
        !Array.isArray(payload) &&
        (((payload as Record<string, unknown>).detail as string) ||
          ((payload as Record<string, unknown>).message as string));

      const errorMessage = typeof detail === "string" && detail.trim()
        ? detail
        : `Request failed with HTTP ${response.status}`;

      const error = new Error(errorMessage);
      (error as Error & { status?: number }).status = response.status;
      throw error;
    }

    return payload;
  } catch (error) {
    const isTimeout = timeoutController.signal.aborted && !parentSignal?.aborted;
    if (isTimeout) {
      throw new Error(`Request timeout after ${REQUEST_TIMEOUT_MS} ms`);
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
    if (parentSignal) {
      parentSignal.removeEventListener("abort", onParentAbort);
    }
  }
}

export async function fetchHealth(signal?: AbortSignal): Promise<HealthPayload> {
  const candidates = [buildUrl("/health"), `${API_BASE}/health`];
  let lastError: unknown = null;

  for (const url of candidates) {
    try {
      const payload = await fetchJson(url, {
        method: "GET",
        cache: "no-store",
        signal
      });

      const status =
        payload && typeof payload === "object" && !Array.isArray(payload)
          ? toStringValue((payload as Record<string, unknown>).status)
          : "";

      if (status) {
        return { status };
      }
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) {
    throw lastError;
  }

  throw new Error("Backend health endpoint tidak memberikan response valid");
}

export async function fetchSupportedSensors(signal?: AbortSignal): Promise<SupportedSensorsPayload> {
  const payload = await fetchJson(buildUrl("/sensors/supported"), {
    method: "GET",
    cache: "no-store",
    signal
  });

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { sensors: [...FALLBACK_SENSORS] };
  }

  const sensorsRaw = (payload as Record<string, unknown>).sensors;
  const sensors = Array.isArray(sensorsRaw)
    ? sensorsRaw.map((value) => toStringValue(value)).filter(Boolean)
    : [];

  return { sensors: sensors.length > 0 ? sensors : [...FALLBACK_SENSORS] };
}

export async function fetchLatestSensor(
  sensor: string,
  deviceId = "",
  signal?: AbortSignal
): Promise<SensorLatestItem> {
  const safeSensor = toStringValue(sensor);
  if (!safeSensor) {
    throw new Error("Sensor wajib dipilih");
  }

  const payload = await fetchJson(
    buildUrl(`/sensors/${encodeURIComponent(safeSensor)}/latest`, {
      device_id: sanitizeDeviceId(deviceId)
    }),
    {
      method: "GET",
      cache: "no-store",
      signal
    }
  );

  const normalized = normalizeLatestItem(payload);
  if (!normalized) {
    throw new Error("Response latest sensor tidak valid");
  }

  if (!normalized.sensor) {
    normalized.sensor = safeSensor;
  }

  if (deviceId && !normalized.device_id) {
    normalized.device_id = sanitizeDeviceId(deviceId);
  }

  return normalized;
}

export async function fetchLatestAllSensors(
  params: { deviceId?: string; sensor?: string; signal?: AbortSignal } = {}
): Promise<SensorLatestAllPayload> {
  const payload = await fetchJson(
    buildUrl("/sensors/latest", {
      device_id: sanitizeDeviceId(params.deviceId ?? ""),
      sensor: toStringValue(params.sensor)
    }),
    {
      method: "GET",
      cache: "no-store",
      signal: params.signal
    }
  );

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { count: 0, items: [] };
  }

  const raw = payload as Record<string, unknown>;
  const rawItems = Array.isArray(raw.items) ? raw.items : [];
  const items = rawItems.map(normalizeLatestItem).filter((value): value is SensorLatestItem => Boolean(value));
  const countValue = toInteger(raw.count);

  return {
    count: countValue ?? items.length,
    items
  };
}

export function sanitizeHistoryLimit(limit: unknown, fallback = 50): number {
  const parsed = Number.parseInt(String(limit ?? fallback), 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  if (parsed <= 0) {
    return fallback;
  }

  return Math.min(parsed, 1000);
}

export async function fetchSensorHistory(
  params: { limit?: number; deviceId?: string; signal?: AbortSignal } = {}
): Promise<SensorHistoryPayload> {
  const safeLimit = sanitizeHistoryLimit(params.limit ?? 50, 50);
  const payload = await fetchJson(
    buildUrl(`/sensors/latest/${safeLimit}`, {
      device_id: sanitizeDeviceId(params.deviceId ?? "")
    }),
    {
      method: "GET",
      cache: "no-store",
      signal: params.signal
    }
  );

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { count: 0, items: [] };
  }

  const raw = payload as Record<string, unknown>;
  const rawItems = Array.isArray(raw.items) ? raw.items : [];
  const items = rawItems.map(normalizeHistoryItem).filter((value): value is SensorHistoryItem => Boolean(value));

  items.sort((left, right) => {
    const leftTime = left.created_at ? Date.parse(left.created_at) : Number.NEGATIVE_INFINITY;
    const rightTime = right.created_at ? Date.parse(right.created_at) : Number.NEGATIVE_INFINITY;
    return leftTime - rightTime;
  });

  const countValue = toInteger(raw.count);
  return {
    count: countValue ?? items.length,
    items
  };
}

export async function convertAdc(payload: ConvertAdcPayload, signal?: AbortSignal): Promise<ConvertResult> {
  const response = await fetchJson(buildUrl("/sensors/convert"), {
    method: "POST",
    body: JSON.stringify({
      sensor: toStringValue(payload.sensor),
      adc: toInteger(payload.adc),
      device_id: sanitizeDeviceId(payload.device_id ?? ""),
      temperature_c: toNumber(payload.temperature_c),
      humidity_pct: toNumber(payload.humidity_pct)
    }),
    signal
  });

  const normalized = normalizeLatestItem(response);
  if (!normalized) {
    throw new Error("Response konversi sensor tidak valid");
  }

  return {
    sensor: normalized.sensor,
    adc: normalized.adc,
    voltage: normalized.voltage,
    rs: normalized.rs,
    r0: normalized.r0,
    ratio: normalized.ratio,
    ppm: normalized.ppm,
    unit: normalized.unit
  };
}

export async function fetchCalibration(sensor: string, deviceId = "", signal?: AbortSignal): Promise<CalibrationPayload> {
  const safeSensor = toStringValue(sensor);
  if (!safeSensor) {
    throw new Error("Sensor wajib dipilih");
  }

  const payload = await fetchJson(
    buildUrl(`/calibrations/${encodeURIComponent(safeSensor)}`, {
      device_id: sanitizeDeviceId(deviceId)
    }),
    {
      method: "GET",
      cache: "no-store",
      signal
    }
  );

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Response calibration tidak valid");
  }

  const raw = payload as Record<string, unknown>;
  return {
    sensor: toStringValue(raw.sensor) || safeSensor,
    device_id: toStringValue(raw.device_id),
    r0: toNumber(raw.r0),
    rl_ohm: toNumber(raw.rl_ohm),
    vcc: toNumber(raw.vcc),
    ratio_mode: toStringValue(raw.ratio_mode) || "clean_air"
  };
}

export async function upsertCalibration(
  sensor: string,
  payload: CalibrationUpsertInput,
  signal?: AbortSignal
): Promise<CalibrationPayload> {
  const safeSensor = toStringValue(sensor);
  if (!safeSensor) {
    throw new Error("Sensor wajib dipilih");
  }

  const response = await fetchJson(buildUrl(`/calibrations/${encodeURIComponent(safeSensor)}`), {
    method: "PUT",
    body: JSON.stringify({
      device_id: sanitizeDeviceId(payload.device_id),
      r0: toNumber(payload.r0),
      rl_ohm: toNumber(payload.rl_ohm),
      vcc: toNumber(payload.vcc),
      ratio_mode: toStringValue(payload.ratio_mode) || "clean_air"
    }),
    signal
  });

  if (!response || typeof response !== "object" || Array.isArray(response)) {
    return {
      sensor: safeSensor,
      device_id: sanitizeDeviceId(payload.device_id),
      r0: toNumber(payload.r0),
      rl_ohm: toNumber(payload.rl_ohm),
      vcc: toNumber(payload.vcc),
      ratio_mode: toStringValue(payload.ratio_mode) || "clean_air"
    };
  }

  const raw = response as Record<string, unknown>;
  return {
    sensor: toStringValue(raw.sensor) || safeSensor,
    device_id: toStringValue(raw.device_id) || sanitizeDeviceId(payload.device_id),
    r0: toNumber(raw.r0) ?? toNumber(payload.r0),
    rl_ohm: toNumber(raw.rl_ohm) ?? toNumber(payload.rl_ohm),
    vcc: toNumber(raw.vcc) ?? toNumber(payload.vcc),
    ratio_mode: toStringValue(raw.ratio_mode) || toStringValue(payload.ratio_mode) || "clean_air"
  };
}
