import { useEffect, useMemo, useState } from "react";
import { ClockRefreshIcon } from "@untitledui/icons-react/outline";
import SensorChart from "@/components/charts/SensorChart";
import { useSensorWebSocket } from "@/composables/useSensorWebSocket";
import {
  flattenSensorItems,
  getApiHealth,
  getMqttHealth,
  sanitizeDeviceId,
  sanitizeLimit,
  SENSOR_LIMIT_MAX,
  SENSOR_LIMIT_MIN
} from "@/services/sensorService";
import { sanitizeMovingAverageWindow } from "@/utils/movingAverage";
import { getHazardEventFromRows } from "@/utils/hazardEvents";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const DEFAULT_LIMIT = 1000;
const DEFAULT_DEVICE_ID = "";
const DEFAULT_MOVING_AVERAGE_WINDOW = 5;
const TABLE_PAGE_SIZE = 50;

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
  const [movingAverageEnabled, setMovingAverageEnabled] = useState(true);
  const [movingAverageWindow, setMovingAverageWindow] = useState(DEFAULT_MOVING_AVERAGE_WINDOW);
  const [movingAverageInput, setMovingAverageInput] = useState(String(DEFAULT_MOVING_AVERAGE_WINDOW));

  const {
    count,
    items,
    loading,
    error,
    empty,
    query,
    lastSyncedAt,
    rawItems,
    health: wsHealth,
    setQuery,
    reconnect
  } = useSensorWebSocket({
    initialLimit: DEFAULT_LIMIT,
    initialDeviceId: DEFAULT_DEVICE_ID
  });

  const [limitInput, setLimitInput] = useState(String(query.limit));
  const [deviceInput, setDeviceInput] = useState(query.deviceId);
  const [loadingHealth, setLoadingHealth] = useState(false);
  const [apiHealth, setApiHealth] = useState("checking");
  const [mqttHealth, setMqttHealth] = useState("checking");
  const [tablePage, setTablePage] = useState(0);

  useEffect(() => {
    setLimitInput(String(query.limit));
    setDeviceInput(query.deviceId);
  }, [query.deviceId, query.limit]);

  const safeMovingAverageWindow = useMemo(
    () => sanitizeMovingAverageWindow(movingAverageWindow, DEFAULT_MOVING_AVERAGE_WINDOW),
    [movingAverageWindow]
  );

  const hazardEvent = useMemo(() => getHazardEventFromRows(items), [items]);
  const tableRows = useMemo(() => flattenSensorItems(rawItems), [rawItems]);
  const latestTableRows = useMemo(
    () => [...tableRows].sort((left, right) => {
      const leftTime = left.created_at ? Date.parse(left.created_at) : Number.NEGATIVE_INFINITY;
      const rightTime = right.created_at ? Date.parse(right.created_at) : Number.NEGATIVE_INFINITY;
      return rightTime - leftTime;
    }),
    [tableRows]
  );
  const tablePageCount = Math.max(1, Math.ceil(latestTableRows.length / TABLE_PAGE_SIZE));
  const safeTablePage = Math.min(tablePage, tablePageCount - 1);
  const visibleTableRows = latestTableRows.slice(
    safeTablePage * TABLE_PAGE_SIZE,
    safeTablePage * TABLE_PAGE_SIZE + TABLE_PAGE_SIZE
  );
  const tableStart = latestTableRows.length === 0 ? 0 : safeTablePage * TABLE_PAGE_SIZE + 1;
  const tableEnd = safeTablePage * TABLE_PAGE_SIZE + visibleTableRows.length;

  useEffect(() => {
    setTablePage(0);
  }, [rawItems]);

  useEffect(() => {
    if (tablePage !== safeTablePage) {
      setTablePage(safeTablePage);
    }
  }, [safeTablePage, tablePage]);

  const refreshHealth = async () => {
    setLoadingHealth(true);
    const [apiResult, mqttResult] = await Promise.allSettled([getApiHealth(), getMqttHealth()]);
    setApiHealth(apiResult.status === "fulfilled" ? "online" : "offline");
    if (mqttResult.status === "fulfilled") {
      const mqttStatus = String(mqttResult.value.status || "unknown").toLowerCase();
      setMqttHealth(mqttStatus === "connected" || mqttStatus === "ok" || mqttStatus === "healthy" ? "connected" : "unhealthy");
    } else {
      setMqttHealth("disconnected");
    }
    setLoadingHealth(false);
  };

  useEffect(() => {
    refreshHealth();
  }, []);

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
              Stream realtime dari <code>/api/v1/ws/sensors/latest</code>.
            </p>
          </div>

          <div className="actions">
            <Button type="button" variant="secondary" onClick={reconnect}>
              <ClockRefreshIcon className="ui-icon" />
              <span>Reconnect</span>
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
              <CardDescription>Last Data (Asia/Jakarta)</CardDescription>
              <CardTitle className="value small">{formatLastSync(lastSyncedAt)}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="card">
            <CardHeader>
              <CardDescription>WebSocket</CardDescription>
              <CardTitle className={`value status-${wsHealth.status === "connected" ? "normal" : wsHealth.status === "reconnecting" || wsHealth.status === "connecting" ? "warning" : "danger"}`}>
                {wsHealth.status === "connected" ? "Connected" : wsHealth.status === "connecting" ? "Connecting" : wsHealth.status === "reconnecting" ? "Reconnecting" : wsHealth.status === "error" ? "Error" : "Disconnected"}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card className="card">
            <CardHeader>
              <CardDescription>Last Message (Asia/Jakarta)</CardDescription>
              <CardTitle className="value small">{formatLastSync(wsHealth.lastMessageAt)}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="card">
            <CardHeader>
              <CardDescription>Reconnect Attempt</CardDescription>
              <CardTitle className="value">{wsHealth.reconnectAttempt}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="card">
            <CardHeader>
              <CardDescription>Latency</CardDescription>
              <CardTitle className="value small">{wsHealth.latencyMs === null ? "--" : `${wsHealth.latencyMs} ms`}</CardTitle>
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
              `limit` valid {SENSOR_LIMIT_MIN}..{SENSOR_LIMIT_MAX}, kosongkan `device_id` untuk semua device.
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
                  placeholder="Semua Device"
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

        {loading && <p className="info">Menunggu data sensor realtime...</p>}
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

        <Card className="panel">
          <CardHeader>
            <CardTitle>Tabel Data Sensor</CardTitle>
            <CardDescription>Menampilkan {tableStart}-{tableEnd} dari {latestTableRows.length} baris terbaru.</CardDescription>
          </CardHeader>
          <CardContent>
            {latestTableRows.length === 0 ? (
              <p className="sensor-empty">Belum ada data tabel dari stream WebSocket.</p>
            ) : (
              <>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr><th>created_at</th><th>device_id</th><th>nama sensor</th><th>adc</th><th>voltage</th><th>ppm</th><th>unit</th></tr>
                    </thead>
                    <tbody>
                      {visibleTableRows.map((row, index) => (
                        <tr key={`${row.created_at}-${row.device_id}-${row.sensor_name}-${safeTablePage}-${index}`}>
                          <td>{row.created_at || "-"}</td><td>{row.device_id || "-"}</td><td>{row.sensor_name}</td><td>{row.adc ?? "-"}</td><td>{row.voltage ?? "-"}</td><td>{row.ppm ?? "-"}</td><td>{row.unit || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="history-table-footer">
                  <span>Page {safeTablePage + 1} / {tablePageCount}</span>
                  <div className="table-pagination-actions">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={safeTablePage === 0}
                      onClick={() => setTablePage((current) => Math.max(current - 1, 0))}
                    >
                      Previous
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={safeTablePage >= tablePageCount - 1}
                      onClick={() => setTablePage((current) => Math.min(current + 1, tablePageCount - 1))}
                    >
                      Next Page
                    </Button>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
