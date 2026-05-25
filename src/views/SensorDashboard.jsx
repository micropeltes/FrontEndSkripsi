import { useEffect, useMemo, useState } from "react";
import { ClockRefreshIcon } from "@untitledui/icons-react/outline";
import SensorChart from "@/components/charts/SensorChart";
import { useSensorData } from "@/composables/useSensorData";
import { sanitizeDeviceId, sanitizeLimit, SENSOR_LIMIT_MAX, SENSOR_LIMIT_MIN } from "@/services/sensorService";
import { sanitizeMovingAverageWindow } from "@/utils/movingAverage";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const DEFAULT_LIMIT = 50;
const DEFAULT_MOVING_AVERAGE_WINDOW = 5;
const POLL_INTERVAL_MS = 5000;

const SENSOR_CHARTS = [
  { key: "nh3_mics", title: "NH3 MICS", color: "#06b6d4" },
  { key: "nh3_mems", title: "NH3 MEMS", color: "#0ea5e9" },
  { key: "h2s", title: "H2S", color: "#22c55e" },
  { key: "no2", title: "NO2", color: "#f97316" },
  { key: "co", title: "CO", color: "#f43f5e" },
  { key: "mq135", title: "MQ135", color: "#14b8a6" }
];

const syncTimeFormatter = new Intl.DateTimeFormat("id-ID", {
  timeZone: "Asia/Jakarta",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour12: false
});

function formatLastSync(value) {
  if (!value) {
    return "--";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "--";
  }

  return syncTimeFormatter.format(date);
}

export default function SensorDashboard({ fluid = false }) {
  const [pageVisible, setPageVisible] = useState(!document.hidden);
  const [pollingPaused, setPollingPaused] = useState(false);
  const [movingAverageEnabled, setMovingAverageEnabled] = useState(true);
  const [movingAverageWindow, setMovingAverageWindow] = useState(DEFAULT_MOVING_AVERAGE_WINDOW);
  const [movingAverageInput, setMovingAverageInput] = useState(String(DEFAULT_MOVING_AVERAGE_WINDOW));

  const {
    count,
    items,
    loading,
    refreshing,
    error,
    empty,
    query,
    lastSyncedAt,
    setQuery,
    refresh
  } = useSensorData({
    initialLimit: DEFAULT_LIMIT,
    initialDeviceId: "",
    pollIntervalMs: POLL_INTERVAL_MS,
    paused: pollingPaused || !pageVisible
  });

  const [limitInput, setLimitInput] = useState(String(query.limit));
  const [deviceInput, setDeviceInput] = useState(query.deviceId);

  useEffect(() => {
    const onVisibilityChange = () => {
      const visible = !document.hidden;
      setPageVisible(visible);
      if (visible) {
        refresh({ silent: true });
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [refresh]);

  useEffect(() => {
    setLimitInput(String(query.limit));
    setDeviceInput(query.deviceId);
  }, [query.deviceId, query.limit]);

  const safeMovingAverageWindow = useMemo(
    () => sanitizeMovingAverageWindow(movingAverageWindow, DEFAULT_MOVING_AVERAGE_WINDOW),
    [movingAverageWindow]
  );

  const applyFilters = () => {
    const nextLimit = sanitizeLimit(limitInput, query.limit);
    const nextDeviceId = sanitizeDeviceId(deviceInput);
    const nextWindow = sanitizeMovingAverageWindow(movingAverageInput, movingAverageWindow);

    setQuery({ limit: nextLimit, deviceId: nextDeviceId });
    setLimitInput(String(nextLimit));
    setDeviceInput(nextDeviceId);
    setMovingAverageWindow(nextWindow);
    setMovingAverageInput(String(nextWindow));
  };

  const applyFiltersOnEnter = (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      applyFilters();
    }
  };

  return (
    <main className={`page dashboard-page theme ${fluid ? "flow-page" : ""}`}>
      <section className="container">
        <header className="hero dashboard-hero">
          <div>
            <Badge variant="outline" className="mb-2">E-Nose</Badge>
            <h1>Dashboard Visualisasi Sensor Realtime</h1>
            <p className="subtitle">
              Endpoint: <code>/api/v1/sensors/latest/{query.limit}</code> dengan polling otomatis setiap 5 detik.
            </p>
          </div>

          <div className="actions">
            <Button type="button" variant="secondary" onClick={() => refresh({ silent: true })}>
              <ClockRefreshIcon className="ui-icon" />
              <span>{refreshing ? "Refreshing..." : "Refresh"}</span>
            </Button>
            <Button type="button" variant="outline" onClick={() => setPollingPaused((prev) => !prev)}>
              {pollingPaused ? "Lanjutkan Polling" : "Jeda Polling"}
            </Button>
          </div>
        </header>

        <div className="cards summary-cards">
          <Card className="card">
            <CardHeader>
              <CardDescription>Jumlah Data</CardDescription>
              <CardTitle className="value">{count}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="card">
            <CardHeader>
              <CardDescription>Device ID</CardDescription>
              <CardTitle className="value small">{query.deviceId || "Semua Device"}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="card">
            <CardHeader>
              <CardDescription>Last Sync (Asia/Jakarta)</CardDescription>
              <CardTitle className="value small">{formatLastSync(lastSyncedAt)}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="card">
            <CardHeader>
              <CardDescription>Status Polling</CardDescription>
              <CardTitle className="value">{pollingPaused ? "Paused" : `${POLL_INTERVAL_MS / 1000} detik`}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        <Card className="panel controls-panel">
          <CardHeader>
            <CardTitle>Filter Data</CardTitle>
            <CardDescription>
              `limit` valid {SENSOR_LIMIT_MIN}..{SENSOR_LIMIT_MAX}, `device_id` opsional, moving average window default {DEFAULT_MOVING_AVERAGE_WINDOW}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="sensor-control-row sensor-filter-grid">
              <label className="sensor-input-wrap">
                <span className="field-label">Limit Data</span>
                <Input
                  type="number"
                  min={SENSOR_LIMIT_MIN}
                  max={SENSOR_LIMIT_MAX}
                  value={limitInput}
                  onChange={(event) => setLimitInput(event.target.value)}
                  onKeyDown={applyFiltersOnEnter}
                />
              </label>

              <label className="sensor-input-wrap">
                <span className="field-label">Device ID (opsional)</span>
                <Input
                  value={deviceInput}
                  onChange={(event) => setDeviceInput(event.target.value)}
                  onKeyDown={applyFiltersOnEnter}
                  placeholder="ESP-00"
                />
              </label>

              <label className="sensor-input-wrap">
                <span className="field-label">Moving Average Window</span>
                <Input
                  type="number"
                  min={1}
                  max={1000}
                  value={movingAverageInput}
                  onChange={(event) => setMovingAverageInput(event.target.value)}
                  onKeyDown={applyFiltersOnEnter}
                />
              </label>
            </div>

            <div className="sensor-filter-actions">
              <Button type="button" onClick={applyFilters}>Terapkan Filter</Button>
              <label className="ma-toggle">
                <input
                  type="checkbox"
                  checked={movingAverageEnabled}
                  onChange={(event) => setMovingAverageEnabled(event.target.checked)}
                />
                <span>Tampilkan Moving Average</span>
              </label>
            </div>
          </CardContent>
        </Card>

        {loading && <p className="info">Memuat data sensor terbaru...</p>}
        {error && (
          <Card className="panel">
            <CardContent>
              <p className="error">{error}</p>
            </CardContent>
          </Card>
        )}
        {!loading && !error && empty && (
          <Card className="panel">
            <CardContent>
              <p className="sensor-empty">Belum ada data sensor untuk filter saat ini.</p>
            </CardContent>
          </Card>
        )}

        {!loading && !error && !empty && (
          <section className="sensor-dashboard-grid">
            {SENSOR_CHARTS.map((sensor) => (
              <SensorChart
                key={sensor.key}
                title={sensor.title}
                sensorKey={sensor.key}
                rows={items}
                rawSeriesColor={sensor.color}
                movingAverageWindow={safeMovingAverageWindow}
                movingAverageEnabled={movingAverageEnabled}
              />
            ))}
          </section>
        )}
      </section>
    </main>
  );
}
