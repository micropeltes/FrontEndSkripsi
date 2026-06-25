import { useCallback, useEffect, useMemo, useState } from "react";
import { ClockRefreshIcon } from "@untitledui/icons-react/outline";
import SensorHistoryChart from "@/components/charts/SensorHistoryChart";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { fetchSensorHistory, fetchSupportedSensors, FALLBACK_SENSORS, sanitizeHistoryLimit } from "@/services/enoseService";
import { formatHazardValue, formatSensorLabel } from "@/utils/hazardEvents";

const COMPARE_KEYS = ["mq135", "nh3_mics", "co", "no2", "nh3_mems", "h2s"];

function statFor(rows, sensor) {
  const values = rows.map((row) => Number(row[sensor])).filter(Number.isFinite);
  if (values.length === 0) {
    return { min: null, max: null, avg: null };
  }

  return {
    min: Math.min(...values),
    max: Math.max(...values),
    avg: values.reduce((total, value) => total + value, 0) / values.length
  };
}

export default function SensorComparePage({ fluid = false }) {
  const [supportedSensors, setSupportedSensors] = useState([...FALLBACK_SENSORS]);
  const [selectedSensors, setSelectedSensors] = useState(["mq135", "co", "h2s"]);
  const [limitInput, setLimitInput] = useState("100");
  const [deviceInput, setDeviceInput] = useState("");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();

    async function loadSupported() {
      try {
        const payload = await fetchSupportedSensors(controller.signal);
        if (mounted) {
          setSupportedSensors(payload.sensors.length > 0 ? payload.sensors : [...FALLBACK_SENSORS]);
        }
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

  const loadCompare = useCallback(async (silent = false) => {
    setRefreshing(true);
    if (!silent) {
      setLoading(true);
    }

    try {
      const payload = await fetchSensorHistory({
        limit: sanitizeHistoryLimit(limitInput, 100),
        deviceId: deviceInput.trim()
      });
      setItems(payload.items);
      setError("");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Gagal memuat sensor compare");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [deviceInput, limitInput]);

  useEffect(() => {
    loadCompare(false);
  }, [loadCompare]);

  const activeOptions = useMemo(() => supportedSensors.filter((sensor) => COMPARE_KEYS.includes(sensor)), [supportedSensors]);
  const activeSensors = selectedSensors.filter((sensor) => activeOptions.includes(sensor));
  const stats = useMemo(() => activeSensors.map((sensor) => ({ sensor, ...statFor(items, sensor) })), [activeSensors, items]);

  function toggleSensor(sensor) {
    setSelectedSensors((current) => {
      if (current.includes(sensor)) {
        return current.length > 1 ? current.filter((entry) => entry !== sensor) : current;
      }

      return [...current, sensor];
    });
  }

  return (
    <main className={`page sensor-compare-page theme ${fluid ? "flow-page" : ""}`}>
      <section className="container">
        <header className="dashboard-hero">
          <div>
            <Badge variant="outline" className="mb-2 neon-badge">Sensor Compare</Badge>
            <h1>Sensor Compare</h1>
            <p className="subtitle">Bandingkan beberapa sensor dalam satu plot bersih dengan neon accent di kontrol dan summary.</p>
          </div>
          <div className="actions">
            <Button type="button" variant="secondary" onClick={() => loadCompare(true)}>
              <ClockRefreshIcon className="ui-icon" />
              <span>{refreshing ? "Refreshing..." : "Refresh"}</span>
            </Button>
          </div>
        </header>

        <Card className="panel neon-panel">
          <CardHeader>
            <CardTitle>Compare Controls</CardTitle>
            <CardDescription>Pilih sensor yang ingin dibandingkan. Minimal satu sensor tetap aktif.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="compare-chip-row">
              {activeOptions.map((sensor) => (
                <button
                  key={sensor}
                  type="button"
                  className={`compare-chip ${activeSensors.includes(sensor) ? "active" : ""}`}
                  onClick={() => toggleSensor(sensor)}
                >
                  {formatSensorLabel(sensor)}
                </button>
              ))}
            </div>
            <div className="sensor-control-row compare-filter-row">
              <label className="sensor-input-wrap">
                <span className="field-label">Limit Data</span>
                <Input type="number" min="1" max="1000" value={limitInput} onChange={(event) => setLimitInput(event.target.value)} />
              </label>
              <label className="sensor-input-wrap">
                <span className="field-label">Device ID (opsional)</span>
                <Input value={deviceInput} onChange={(event) => setDeviceInput(event.target.value)} placeholder="esp32-1" />
              </label>
              <Button type="button" className="monitor-apply-btn" onClick={() => loadCompare(true)}>Apply Compare</Button>
            </div>
          </CardContent>
        </Card>

        <div className="compare-stat-grid">
          {stats.map((entry) => (
            <article key={entry.sensor} className="report-stat-card">
              <span>{formatSensorLabel(entry.sensor)}</span>
              <strong>{formatHazardValue(entry.avg)} ppm</strong>
              <small>Min {formatHazardValue(entry.min)} / Max {formatHazardValue(entry.max)}</small>
            </article>
          ))}
        </div>

        <Card className="panel sensor-chart-card clean-chart-shell">
          <CardHeader>
            <CardTitle>Compare Plot</CardTitle>
            <CardDescription>Plot data tetap clean supaya neon accent tidak mengganggu pembacaan grafik.</CardDescription>
          </CardHeader>
          <CardContent>
            {loading && <p className="info">Memuat data compare...</p>}
            {!loading && error && <p className="error">{error}</p>}
            {!loading && !error && <SensorHistoryChart rows={items} sensors={activeSensors} />}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
