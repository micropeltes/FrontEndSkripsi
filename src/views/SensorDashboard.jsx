import { useEffect, useMemo, useState } from "react";
import { ClockRefreshIcon } from "@untitledui/icons-react/outline";
import SensorChart from "@/components/charts/SensorChart";
import { useSensorData } from "@/composables/useSensorData";
import {
  flattenSensorItems,
  getApiHealth,
  getLatestSensors,
  getMqttHealth,
  getSensorHistory,
  sanitizeDeviceId,
  sanitizeLimit,
  SENSOR_LIMIT_MAX,
  SENSOR_LIMIT_MIN,
  validateHistoryTimeRange
} from "@/services/sensorService";
import { sanitizeMovingAverageWindow } from "@/utils/movingAverage";
import { getHazardEventFromRows } from "@/utils/hazardEvents";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const DEFAULT_LIMIT = 1000;
const DEFAULT_DEVICE_ID = "esp32c3-01";
const DEFAULT_MOVING_AVERAGE_WINDOW = 5;
const POLL_INTERVAL_MS = 5000;

const SENSOR_CHARTS = [
  { key: "mq135", title: "MQ135", color: "#ffd23f" },
  { key: "co", title: "CO", color: "#ff4b5f" },
  { key: "no2", title: "NO2", color: "#f76b35" },
  { key: "nh3_mems", title: "NH3 MEMS", color: "#34cfff" },
  { key: "h2s", title: "H2S", color: "#4ade80" }
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
    initialDeviceId: DEFAULT_DEVICE_ID,
    pollIntervalMs: POLL_INTERVAL_MS,
    paused: pollingPaused || !pageVisible
  });

  const today = new Date().toISOString().slice(0, 10);
  const [limitInput, setLimitInput] = useState(String(query.limit));
  const [deviceInput, setDeviceInput] = useState(query.deviceId || DEFAULT_DEVICE_ID);
  const [startTimeInput, setStartTimeInput] = useState(`${today}T00:00`);
  const [endTimeInput, setEndTimeInput] = useState(`${today}T23:59`);
  const [loadingHealth, setLoadingHealth] = useState(false);
  const [loadingSensors, setLoadingSensors] = useState(false);
  const [apiHealth, setApiHealth] = useState("checking");
  const [mqttHealth, setMqttHealth] = useState("checking");
  const [sensorError, setSensorError] = useState("");
  const [tableRows, setTableRows] = useState([]);

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

  const hazardEvent = useMemo(() => getHazardEventFromRows(items), [items]);

  const toIsoFromInput = (value) => (value ? new Date(value).toISOString() : "");

  const refreshHealth = async () => {
    setLoadingHealth(true);
    const [apiResult, mqttResult] = await Promise.allSettled([getApiHealth(), getMqttHealth()]);
    setApiHealth(apiResult.status === "fulfilled" ? "online" : "offline");
    if (mqttResult.status === "fulfilled") {
      const mqttStatus = String(mqttResult.value.status || "connected").toLowerCase();
      setMqttHealth(mqttStatus.includes("ok") || mqttStatus.includes("connect") || mqttStatus === "healthy" ? "connected" : "unhealthy");
    } else {
      setMqttHealth("disconnected");
    }
    setLoadingHealth(false);
  };

  useEffect(() => {
    refreshHealth();
    const timer = setInterval(refreshHealth, 10000);
    return () => clearInterval(timer);
  }, []);

  const loadLatest = async () => {
    const nextLimit = sanitizeLimit(limitInput, query.limit);
    const nextDeviceId = sanitizeDeviceId(deviceInput);
    setLoadingSensors(true);
    setSensorError("");
    try {
      const result = await getLatestSensors({ limit: nextLimit, device_id: nextDeviceId });
      setTableRows(flattenSensorItems(result.raw_items ?? []));
      setQuery({ limit: nextLimit, deviceId: nextDeviceId });
    } catch (error) {
      setSensorError(error instanceof Error ? error.message : "Gagal memuat data latest sensor.");
    } finally {
      setLoadingSensors(false);
    }
  };

  const loadHistory = async () => {
    const nextLimit = sanitizeLimit(limitInput, query.limit);
    const nextDeviceId = sanitizeDeviceId(deviceInput);
    const start_time = toIsoFromInput(startTimeInput);
    const end_time = toIsoFromInput(endTimeInput);
    const validationError = validateHistoryTimeRange(start_time, end_time);
    if (validationError) {
      setSensorError(validationError);
      return;
    }

    setLoadingSensors(true);
    setSensorError("");
    try {
      const result = await getSensorHistory({ device_id: nextDeviceId, start_time, end_time, limit: nextLimit });
      setTableRows(flattenSensorItems(result.raw_items ?? []));
    } catch (error) {
      setSensorError(error instanceof Error ? error.message : "Gagal memuat history sensor.");
    } finally {
      setLoadingSensors(false);
    }
  };

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

        {hazardEvent && (
          <Card className="panel hazard-event hazard-event-dashboard" role="alert">
            <CardHeader>
              <Badge variant="outline" className="hazard-badge">Hazard Event</Badge>
              <CardTitle>Threshold danger terpenuhi</CardTitle>
              <CardDescription>
                {hazardEvent.label} mencapai {hazardEvent.formattedValue} ppm, melewati batas danger {hazardEvent.formattedThreshold} ppm.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="hazard-event-grid">
                <p><strong>Sensor:</strong> {hazardEvent.label}</p>
                <p><strong>Device:</strong> {hazardEvent.deviceId}</p>
                <p><strong>Waktu:</strong> {hazardEvent.formattedTime}</p>
                <p><strong>Jumlah trigger:</strong> {hazardEvent.triggeredSensors.length} sensor</p>
              </div>
            </CardContent>
          </Card>
        )}

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
              <CardDescription>API Health</CardDescription>
              <CardTitle className={`value status-${apiHealth === "online" ? "normal" : apiHealth === "checking" ? "unknown" : "danger"}`}>{apiHealth === "online" ? "Online" : apiHealth === "checking" ? "Checking" : "Offline"}</CardTitle>
            </CardHeader>
          </Card>
                  <Card className="card">
            <CardHeader>
              <CardDescription>MQTT Health</CardDescription>
              <CardTitle className={`value status-${mqttHealth === "connected" ? "normal" : mqttHealth === "checking" ? "unknown" : mqttHealth === "unhealthy" ? "warning" : "danger"}`}>{mqttHealth === "connected" ? "Connected" : mqttHealth === "checking" ? "Checking" : mqttHealth === "unhealthy" ? "Unhealthy" : "Disconnected"}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        <Card className="panel controls-panel">
          <CardHeader>
            <CardTitle>Filter Data</CardTitle>
            <CardDescription>
              `limit` valid {SENSOR_LIMIT_MIN}..{SENSOR_LIMIT_MAX}, `device_id` default {DEFAULT_DEVICE_ID}, history wajib memakai start_time dan end_time.
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
                  placeholder={DEFAULT_DEVICE_ID}
                />
              </label>

              <label className="sensor-input-wrap">
                <span className="field-label">Start Time</span>
                <Input type="datetime-local" value={startTimeInput} onChange={(event) => setStartTimeInput(event.target.value)} />
              </label>

              <label className="sensor-input-wrap">
                <span className="field-label">End Time</span>
                <Input type="datetime-local" value={endTimeInput} onChange={(event) => setEndTimeInput(event.target.value)} />
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
              <Button type="button" onClick={loadLatest} disabled={loadingSensors}>Load Latest</Button>
              <Button type="button" variant="secondary" onClick={loadHistory} disabled={loadingSensors}>Load History</Button>
              <Button type="button" variant="outline" onClick={refreshHealth} disabled={loadingHealth}>{loadingHealth ? "Checking..." : "Refresh Health"}</Button>
              <Button type="button" variant="outline" onClick={applyFilters}>Terapkan Filter Chart</Button>
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

        {(loading || loadingSensors) && <p className="info">Memuat data sensor...</p>}
        {(error || sensorError) && (
          <Card className="panel">
            <CardContent>
              <p className="error">{sensorError || error}</p>
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

        <Card className="panel">
          <CardHeader>
            <CardTitle>Tabel Data Sensor</CardTitle>
            <CardDescription>Data latest/history diflatten dari object sensors yang dinamis.</CardDescription>
          </CardHeader>
          <CardContent>
            {tableRows.length === 0 ? (
              <p className="sensor-empty">Belum ada data tabel. Klik Load Latest atau Load History.</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>created_at</th><th>device_id</th><th>nama sensor</th><th>adc</th><th>voltage</th><th>ppm</th><th>unit</th></tr>
                  </thead>
                  <tbody>
                    {tableRows.map((row, index) => (
                      <tr key={`${row.created_at}-${row.device_id}-${row.sensor_name}-${index}`}>
                        <td>{row.created_at || "-"}</td><td>{row.device_id || "-"}</td><td>{row.sensor_name}</td><td>{row.adc ?? "-"}</td><td>{row.voltage ?? "-"}</td><td>{row.ppm ?? "-"}</td><td>{row.unit || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

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
