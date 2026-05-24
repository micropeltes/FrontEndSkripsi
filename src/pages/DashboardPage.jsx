import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ClockRefreshIcon } from "@untitledui/icons-react/outline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";

const SUPPORTED_SENSORS = ["mq135", "mics6814", "fermion_nh3", "fermion_h2s"];

const SENSOR_LABELS = {
  mq135: "MQ135",
  mics6814: "MICS6814",
  fermion_nh3: "Fermion NH3",
  fermion_h2s: "Fermion H2S"
};

const DEFAULT_DEVICE_ID = "ESP-00";
const DEFAULT_POLL_MS = 4000;
const LOW_POWER_POLL_MS = 5000;
const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "/api").replace(/\/+$/, "");

function toNumberOrNull(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function normalizeSensorKey(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().toLowerCase();
}

function normalizeSensorPayload(payload, fallbackSensor = "") {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const sensor = normalizeSensorKey(payload.sensor ?? fallbackSensor);
  if (!sensor) {
    return null;
  }

  return {
    sensor,
    adc: toNumberOrNull(payload.adc),
    voltage: toNumberOrNull(payload.voltage),
    rs: toNumberOrNull(payload.rs),
    r0: toNumberOrNull(payload.r0),
    ratio: toNumberOrNull(payload.ratio),
    ppm: toNumberOrNull(payload.ppm),
    unit: typeof payload.unit === "string" && payload.unit.trim() ? payload.unit : "ppm",
    created_at: typeof payload.created_at === "string" ? payload.created_at : null
  };
}

function isNotFoundPayload(payload) {
  return Boolean(payload && typeof payload === "object" && payload.error_code === "not_found");
}

function extractOverviewRows(payload) {
  if (!payload) {
    return [];
  }

  if (Array.isArray(payload)) {
    return payload;
  }

  if (Array.isArray(payload.items)) {
    return payload.items;
  }

  if (Array.isArray(payload.data)) {
    return payload.data;
  }

  if (typeof payload === "object") {
    const single = normalizeSensorPayload(payload);
    if (single) {
      return [payload];
    }

    const nestedRows = Object.values(payload).filter((row) => {
      if (!row || typeof row !== "object" || Array.isArray(row)) {
        return false;
      }

      return Boolean(row.sensor || row.ppm !== undefined || row.created_at);
    });

    if (nestedRows.length) {
      return nestedRows;
    }
  }

  return [];
}

function formatFixed(value, digits) {
  const num = toNumberOrNull(value);
  if (num === null) {
    return "--";
  }

  return num.toFixed(digits);
}

function formatPpm(value) {
  const num = toNumberOrNull(value);
  if (num === null) {
    return "--";
  }

  const digits = Math.abs(num) >= 100 ? 2 : 3;
  return num.toFixed(digits);
}

function formatInteger(value) {
  const num = toNumberOrNull(value);
  if (num === null) {
    return "--";
  }

  return String(Math.round(num));
}

function formatTimestamp(value) {
  if (!value) {
    return "--";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "--";
  }

  return date.toLocaleString("id-ID", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function formatTimeOnly(value) {
  if (!value) {
    return "--";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "--";
  }

  return date.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function getApiErrorMessage(result, fallbackText) {
  if (!result) {
    return fallbackText;
  }

  const payload = result.payload;

  if (typeof payload?.detail === "string" && payload.detail.trim()) {
    return payload.detail;
  }

  if (typeof payload?.message === "string" && payload.message.trim()) {
    return payload.message;
  }

  if (typeof payload?.error === "string" && payload.error.trim()) {
    return payload.error;
  }

  if (typeof payload?.error_code === "string" && payload.error_code.trim()) {
    return payload.error_code;
  }

  if (typeof result.status === "number") {
    return `HTTP ${result.status}`;
  }

  return fallbackText;
}

async function fetchJson(url, signal) {
  const response = await fetch(url, { signal });
  let payload = null;

  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  return {
    ok: response.ok,
    status: response.status,
    payload
  };
}

function buildInitialDetailState() {
  return SUPPORTED_SENSORS.reduce((accumulator, sensor) => {
    accumulator[sensor] = {
      status: "idle",
      data: null,
      message: ""
    };
    return accumulator;
  }, {});
}

export default function DashboardPage({ lowPower = false, fluid = false }) {
  const [deviceInput, setDeviceInput] = useState(DEFAULT_DEVICE_ID);
  const [deviceId, setDeviceId] = useState(DEFAULT_DEVICE_ID);
  const [overviewBySensor, setOverviewBySensor] = useState({});
  const [detailBySensor, setDetailBySensor] = useState(buildInitialDetailState);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [overviewNotFound, setOverviewNotFound] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState("");
  const [paused, setPaused] = useState(false);
  const [pageVisible, setPageVisible] = useState(!document.hidden);

  const fetchInFlightRef = useRef(false);
  const abortRef = useRef(null);

  const pollIntervalMs = lowPower ? LOW_POWER_POLL_MS : DEFAULT_POLL_MS;

  const fetchDashboardData = useCallback(async (silent = false) => {
    if (fetchInFlightRef.current) {
      return;
    }

    fetchInFlightRef.current = true;

    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const safeDeviceId = deviceId.trim();
      const encodedDeviceId = encodeURIComponent(safeDeviceId);

      const overviewEndpoint = `${API_BASE}/v1/sensors/latest?device_id=${encodedDeviceId}`;
      const detailEndpoints = SUPPORTED_SENSORS.map(
        (sensor) => `${API_BASE}/v1/sensors/${encodeURIComponent(sensor)}/latest?device_id=${encodedDeviceId}`
      );

      const responses = await Promise.all([
        fetchJson(overviewEndpoint, controller.signal),
        ...detailEndpoints.map((endpoint) => fetchJson(endpoint, controller.signal))
      ]);

      const [overviewResult, ...detailResults] = responses;
      const nextOverviewBySensor = {};

      let nextOverviewNotFound = false;
      let nextError = "";

      if (overviewResult.ok) {
        const rawRows = extractOverviewRows(overviewResult.payload);
        const normalizedRows = rawRows
          .map((row) => normalizeSensorPayload(row))
          .filter((row) => row && SUPPORTED_SENSORS.includes(row.sensor));

        if (!normalizedRows.length) {
          nextOverviewNotFound = true;
        } else {
          for (const row of normalizedRows) {
            nextOverviewBySensor[row.sensor] = row;
          }
        }
      } else if (isNotFoundPayload(overviewResult.payload) || overviewResult.status === 404) {
        nextOverviewNotFound = true;
      } else {
        nextError = getApiErrorMessage(overviewResult, "Gagal mengambil overview sensor");
      }

      const nextDetailBySensor = {};

      detailResults.forEach((result, index) => {
        const sensor = SUPPORTED_SENSORS[index];

        if (result.ok) {
          const normalized = normalizeSensorPayload(result.payload, sensor);

          if (!normalized) {
            nextDetailBySensor[sensor] = {
              status: "no_data",
              data: null,
              message: "No sensor data available"
            };
            return;
          }

          nextDetailBySensor[sensor] = {
            status: "ready",
            data: normalized,
            message: ""
          };
          return;
        }

        if (isNotFoundPayload(result.payload) || result.status === 404) {
          nextDetailBySensor[sensor] = {
            status: "no_data",
            data: null,
            message: "No sensor data available"
          };
          return;
        }

        nextDetailBySensor[sensor] = {
          status: "error",
          data: null,
          message: getApiErrorMessage(result, "Gagal mengambil data sensor")
        };
      });

      setOverviewBySensor(nextOverviewBySensor);
      setOverviewNotFound(nextOverviewNotFound);
      setDetailBySensor(nextDetailBySensor);
      setError(nextError);
      setLastSyncedAt(new Date().toISOString());
    } catch (fetchError) {
      if (fetchError instanceof Error && fetchError.name === "AbortError") {
        return;
      }

      setError(fetchError instanceof Error ? fetchError.message : "Unknown error");
    } finally {
      fetchInFlightRef.current = false;
      if (silent) {
        setRefreshing(false);
      } else {
        setLoading(false);
      }
    }
  }, [deviceId]);

  useEffect(() => {
    fetchDashboardData(false);

    return () => {
      fetchInFlightRef.current = false;
      abortRef.current?.abort();
    };
  }, [fetchDashboardData]);

  useEffect(() => {
    function onVisibilityChange() {
      const isVisible = !document.hidden;
      setPageVisible(isVisible);

      if (isVisible && !paused) {
        fetchDashboardData(true);
      }
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [fetchDashboardData, paused]);

  useEffect(() => {
    if (paused || !pageVisible) {
      return undefined;
    }

    const timer = setInterval(() => {
      fetchDashboardData(true);
    }, pollIntervalMs);

    return () => clearInterval(timer);
  }, [paused, pageVisible, pollIntervalMs, fetchDashboardData]);

  const overviewCards = useMemo(() => {
    return SUPPORTED_SENSORS.map((sensor) => {
      const row = overviewBySensor[sensor] ?? null;

      return {
        sensor,
        label: SENSOR_LABELS[sensor] ?? sensor.toUpperCase(),
        row
      };
    });
  }, [overviewBySensor]);

  const detailCards = useMemo(() => {
    return SUPPORTED_SENSORS.map((sensor) => {
      const state = detailBySensor[sensor] ?? {
        status: "idle",
        data: null,
        message: ""
      };

      return {
        sensor,
        label: SENSOR_LABELS[sensor] ?? sensor.toUpperCase(),
        ...state
      };
    });
  }, [detailBySensor]);

  function applyDeviceId() {
    const nextValue = deviceInput.trim();

    if (!nextValue) {
      setDeviceInput(deviceId);
      return;
    }

    setDeviceId(nextValue);
  }

  function applyDeviceIdOnEnter(event) {
    if (event.key === "Enter") {
      event.preventDefault();
      applyDeviceId();
    }
  }

  return (
    <main className={`page dashboard-page theme ${fluid ? "flow-page" : ""}`}>
      <section className="container">
        <header className="hero dashboard-hero">
          <div>
            <Badge variant="outline" className="mb-2">E-Nose</Badge>
            <h1>Dashboard Sensor Realtime</h1>
            <p className="subtitle">
              FastAPI schema terbaru dengan endpoint `/api/v1/sensors/*`.
            </p>
          </div>

          <div className="actions">
            <Button type="button" variant="secondary" onClick={() => fetchDashboardData(true)}>
              <ClockRefreshIcon className="ui-icon" />
              <span>{refreshing ? "Refreshing..." : "Refresh Sekarang"}</span>
            </Button>
            <Button type="button" variant="outline" onClick={() => setPaused((value) => !value)}>
              {paused ? `Lanjutkan Auto Refresh (${pollIntervalMs / 1000}s)` : `Jeda Auto Refresh (${pollIntervalMs / 1000}s)`}
            </Button>
          </div>
        </header>

        <div className="cards summary-cards">
          <Card className="card">
            <CardHeader>
              <CardDescription>Device Aktif</CardDescription>
              <CardTitle className="value">{deviceId || "--"}</CardTitle>
            </CardHeader>
          </Card>

          <Card className="card">
            <CardHeader>
              <CardDescription>Last Sync</CardDescription>
              <CardTitle className="value small">{formatTimestamp(lastSyncedAt)}</CardTitle>
            </CardHeader>
          </Card>

          <Card className="card">
            <CardHeader>
              <CardDescription>Polling</CardDescription>
              <CardTitle className="value">{paused ? "Paused" : `${pollIntervalMs / 1000} detik`}</CardTitle>
            </CardHeader>
          </Card>

          <Card className="card">
            <CardHeader>
              <CardDescription>API Base</CardDescription>
              <CardTitle className="value small">{API_BASE}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        <Card className="panel controls-panel">
          <CardHeader>
            <CardTitle>Kontrol Endpoint</CardTitle>
            <CardDescription>
              Gunakan device ID untuk overview `/api/v1/sensors/latest` dan detail `/api/v1/sensors/{"{sensor}"}/latest`.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="sensor-control-row">
              <label className="sensor-input-wrap">
                <span className="field-label">Device ID</span>
                <Input
                  value={deviceInput}
                  onChange={(event) => setDeviceInput(event.target.value)}
                  onKeyDown={applyDeviceIdOnEnter}
                  placeholder={DEFAULT_DEVICE_ID}
                />
              </label>
              <Button type="button" onClick={applyDeviceId}>Terapkan Device</Button>
              <Badge variant="outline">Tab {pageVisible ? "aktif" : "tidak aktif"}</Badge>
            </div>
            <p className="filter-pill">
              Endpoint overview: `{API_BASE}/v1/sensors/latest?device_id={deviceId || DEFAULT_DEVICE_ID}`
            </p>
          </CardContent>
        </Card>

        {loading && <p className="info">Loading data...</p>}
        {error && <p className="error">{error}</p>}

        <Card className="panel">
          <CardHeader>
            <CardTitle>Overview Semua Sensor</CardTitle>
            <CardDescription>
              Sumber data: `/api/v1/sensors/latest?device_id={deviceId}`
            </CardDescription>
            <Separator />
          </CardHeader>
          <CardContent>
            {overviewNotFound ? (
              <p className="info">No sensor data available</p>
            ) : (
              <section className="sensor-grid">
                {overviewCards.map((item) => (
                  <Card key={`overview-${item.sensor}`} className="sensor-card">
                    <CardHeader className="sensor-head">
                      <CardTitle>{item.label}</CardTitle>
                      <Badge variant="outline">{item.row?.unit ?? "ppm"}</Badge>
                    </CardHeader>
                    <CardContent>
                      <p className="sensor-reading">
                        {formatPpm(item.row?.ppm)} {item.row?.unit ?? "ppm"}
                      </p>
                      <p className="sensor-subtle">Updated: {formatTimeOnly(item.row?.created_at)}</p>
                    </CardContent>
                  </Card>
                ))}
              </section>
            )}
          </CardContent>
        </Card>

        <Card className="panel">
          <CardHeader>
            <CardTitle>Detail Tiap Sensor</CardTitle>
            <CardDescription>
              Sumber data: `/api/v1/sensors/{"{sensor}"}/latest?device_id={deviceId}`
            </CardDescription>
            <Separator />
          </CardHeader>
          <CardContent>
            <section className="sensor-grid">
              {detailCards.map((item) => (
                <Card key={`detail-${item.sensor}`} className="sensor-card">
                  <CardHeader className="sensor-head">
                    <CardTitle>{item.label}</CardTitle>
                    <Badge variant="outline">{item.data?.unit ?? "ppm"}</Badge>
                  </CardHeader>
                  <CardContent>
                    {item.status === "no_data" && <p className="info">No sensor data available</p>}
                    {item.status === "error" && <p className="error compact">{item.message || "Gagal mengambil data"}</p>}
                    {item.status === "ready" && item.data && (
                      <>
                        <p className="sensor-reading">
                          {formatPpm(item.data.ppm)} {item.data.unit}
                        </p>
                        <div className="sensor-meta">
                          <p>ADC: {formatInteger(item.data.adc)}</p>
                          <p>Voltage: {formatFixed(item.data.voltage, 3)} V</p>
                          <p>RS/R0: {formatFixed(item.data.ratio, 2)}</p>
                          <p>RS: {formatFixed(item.data.rs, 3)}</p>
                          <p>R0: {formatFixed(item.data.r0, 3)}</p>
                          <p>Updated: {formatTimeOnly(item.data.created_at)}</p>
                        </div>
                        <p className="sensor-subtle">Timestamp local: {formatTimestamp(item.data.created_at)}</p>
                      </>
                    )}
                    {item.status === "idle" && <p className="sensor-subtle">Menunggu data...</p>}
                  </CardContent>
                </Card>
              ))}
            </section>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
