import { useCallback, useEffect, useMemo, useState } from "react";
import { ClockRefreshIcon, Download04Icon } from "@untitledui/icons-react/outline";
import SensorHistoryChart from "@/components/charts/SensorHistoryChart";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  FALLBACK_SENSORS,
  fetchSensorHistory,
  fetchSupportedSensors,
  sanitizeHistoryLimit
} from "@/services/enoseService";

const LIMIT_OPTIONS = [10, 50, 100, 500, 1000];
const HISTORY_KEYS = ["mq135", "nh3_mics", "co", "no2", "nh3_mems", "h2s"];
const HISTORY_PAGE_SIZE = 50;

const dateTimeFormatter = new Intl.DateTimeFormat("id-ID", {
  timeZone: "Asia/Jakarta",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false
});

function formatTime(value) {
  if (!value) {
    return "--";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "--";
  }

  return dateTimeFormatter.format(date);
}

function toCsvValue(value) {
  if (value === null || value === undefined) {
    return "";
  }

  const stringValue = String(value);
  if (stringValue.includes(",") || stringValue.includes("\"") || stringValue.includes("\n")) {
    return `"${stringValue.replaceAll("\"", "\"\"")}"`;
  }

  return stringValue;
}

export default function SensorHistoryPage({ fluid = false }) {
  const [supportedSensors, setSupportedSensors] = useState([...FALLBACK_SENSORS]);
  const [limit, setLimit] = useState(50);
  const [deviceInput, setDeviceInput] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const [items, setItems] = useState([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [lastSyncedAt, setLastSyncedAt] = useState("");
  const [visibleHistoryCount, setVisibleHistoryCount] = useState(HISTORY_PAGE_SIZE);

  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();

    async function loadSupported() {
      try {
        const payload = await fetchSupportedSensors(controller.signal);
        if (!mounted) {
          return;
        }

        const sensors = payload.sensors.length > 0 ? payload.sensors : [...FALLBACK_SENSORS];
        setSupportedSensors(sensors);
      } catch {
        if (mounted) {
          setSupportedSensors([...FALLBACK_SENSORS]);
        }
      }
    }

    loadSupported();

    return () => {
      mounted = false;
      controller.abort();
    };
  }, []);

  const refreshHistory = useCallback(
    async (silent = false) => {
      setRefreshing(true);
      if (!silent) {
        setLoading(true);
      }

      try {
        const payload = await fetchSensorHistory({ limit, deviceId });
        setItems(payload.items);
        setCount(payload.count);
        setVisibleHistoryCount(HISTORY_PAGE_SIZE);
        setLastSyncedAt(new Date().toISOString());
        setError("");
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "Gagal memuat data history sensor");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [deviceId, limit]
  );

  useEffect(() => {
    refreshHistory(false);
  }, [refreshHistory]);

  const activeSensors = useMemo(() => {
    const supported = supportedSensors.filter((sensor) => HISTORY_KEYS.includes(sensor));
    return supported.length > 0 ? supported : HISTORY_KEYS;
  }, [supportedSensors]);

  const historyRows = useMemo(
    () => items.flatMap((row, rowIndex) => activeSensors.map((sensor) => ({
      key: `${row.id ?? rowIndex}-${row.created_at ?? "no-time"}-${sensor}`,
      timestamp: row.created_at,
      deviceId: row.device_id,
      sensor,
      ppm: row[sensor]
    }))),
    [activeSensors, items]
  );

  const visibleHistoryRows = useMemo(
    () => historyRows.slice(0, visibleHistoryCount),
    [historyRows, visibleHistoryCount]
  );

  const hiddenHistoryRows = Math.max(historyRows.length - visibleHistoryRows.length, 0);

  useEffect(() => {
    setVisibleHistoryCount(HISTORY_PAGE_SIZE);
  }, [activeSensors]);

  const exportCsv = () => {
    if (items.length === 0) {
      return;
    }

    const columns = ["id", "device_id", ...activeSensors, "created_at"];
    const lines = [
      columns.join(","),
      ...items.map((row) => columns.map((column) => toCsvValue(row[column])).join(","))
    ];

    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const nowStamp = new Date().toISOString().replaceAll(":", "-");

    link.href = URL.createObjectURL(blob);
    link.download = `sensor-history-${limit}-${nowStamp}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  };

  return (
    <main className={`page sensor-history-page theme ${fluid ? "flow-page" : ""}`}>
      <section className="container">
        <header className="dashboard-hero">
          <div>
            <Badge variant="outline" className="mb-2">History</Badge>
            <h1>Riwayat Sensor</h1>
            <p className="subtitle">Endpoint lama <code>/api/v1/sensors/latest/{limit}</code> dengan refresh manual dan export CSV.</p>
          </div>
          <div className="actions">
            <Button type="button" variant="secondary" onClick={() => refreshHistory(false)}>
              <ClockRefreshIcon className="ui-icon" />
              <span>{refreshing ? "Refreshing..." : "Refresh"}</span>
            </Button>
            <Button type="button" variant="outline" onClick={exportCsv} disabled={items.length === 0}>
              <Download04Icon className="ui-icon" />
              <span>Export CSV</span>
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
              <CardDescription>Limit Aktif</CardDescription>
              <CardTitle className="value">{limit}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="card">
            <CardHeader>
              <CardDescription>Device Filter</CardDescription>
              <CardTitle className="value small">{deviceId || "Semua Device"}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="card">
            <CardHeader>
              <CardDescription>Last Sync</CardDescription>
              <CardTitle className="value small">{formatTime(lastSyncedAt)}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        <Card className="panel">
          <CardHeader>
            <CardTitle>Filter History</CardTitle>
            <CardDescription>Pilih limit data dan device ID opsional, lalu refresh manual.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="sensor-control-row">
              <label className="sensor-input-wrap">
                <span className="field-label">Limit Data</span>
                <div className="field-shell">
                  <select
                    className="select-field"
                    value={limit}
                    onChange={(event) => setLimit(sanitizeHistoryLimit(event.target.value, 50))}
                  >
                    {LIMIT_OPTIONS.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                  <span className="select-caret">v</span>
                </div>
              </label>

              <label className="sensor-input-wrap">
                <span className="field-label">Device ID (opsional)</span>
                <Input
                  value={deviceInput}
                  onChange={(event) => setDeviceInput(event.target.value)}
                  placeholder="esp32-1"
                />
              </label>

              <Button type="button" className="monitor-apply-btn" onClick={() => setDeviceId(deviceInput.trim())}>
                Terapkan Device
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="panel clean-chart-shell">
          <CardHeader>
            <CardTitle>Grafik History Sensor</CardTitle>
            <CardDescription>Rendering dinamis berdasarkan daftar sensor supported dari data history.</CardDescription>
          </CardHeader>
          <CardContent>
            {loading && <p className="info">Memuat history sensor...</p>}
            {!loading && error && <p className="error">{error}</p>}
            {!loading && !error && <SensorHistoryChart rows={items} sensors={activeSensors} />}
          </CardContent>
        </Card>

        <Card className="panel">
          <CardHeader>
            <CardTitle>Tabel History</CardTitle>
            <CardDescription>Menampilkan {visibleHistoryRows.length} dari {historyRows.length} baris sensor. Timestamp dalam zona waktu Asia/Jakarta (GMT+7).</CardDescription>
          </CardHeader>
          <CardContent>
            {historyRows.length === 0 ? (
              <p className="sensor-empty">Belum ada data history.</p>
            ) : (
              <>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>timestamp GMT+7</th>
                        <th>device_id</th>
                        <th>sensor</th>
                        <th>ppm</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleHistoryRows.map((row) => (
                        <tr key={row.key}>
                          <td>{formatTime(row.timestamp)}</td>
                          <td>{row.deviceId || "-"}</td>
                          <td>{row.sensor}</td>
                          <td>{row.ppm ?? "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="history-table-footer">
                  <span>{hiddenHistoryRows > 0 ? `${hiddenHistoryRows} baris belum ditampilkan` : "Semua baris sudah ditampilkan"}</span>
                  {hiddenHistoryRows > 0 && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setVisibleHistoryCount((current) => current + HISTORY_PAGE_SIZE)}
                    >
                      View More
                    </Button>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
