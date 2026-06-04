import { useCallback, useEffect, useMemo, useState } from "react";
import { ClockRefreshIcon } from "@untitledui/icons-react/outline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  FALLBACK_SENSORS,
  fetchLatestAllSensors,
  fetchLatestSensor,
  fetchSupportedSensors
} from "@/services/enoseService";

const POLL_INTERVAL_MS = 2000;

const RISK_THRESHOLDS = {
  mq135: { warning: 50, danger: 200 },
  nh3_mics: { warning: 15, danger: 50 },
  co: { warning: 10, danger: 100 },
  no2: { warning: 1, danger: 5 },
  nh3_mems: { warning: 15, danger: 50 },
  h2s: { warning: 1, danger: 100 }
};

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

function formatLabel(sensor) {
  return sensor.replaceAll("_", " ").toUpperCase();
}

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

function formatNumber(value, digits = 2) {
  if (!Number.isFinite(value)) {
    return "--";
  }

  const num = Number(value);
  const abs = Math.abs(num);

  if (abs === 0) {
    return "0";
  }

  if (abs < 0.0001) {
    return num.toExponential(2);
  }

  if (abs < 0.01) {
    return num.toFixed(6);
  }

  if (abs < 1) {
    return num.toFixed(4);
  }

  return num.toFixed(digits);
}

function getRisk(sensor, ppm) {
  if (!Number.isFinite(ppm)) {
    return { key: "unknown", text: "Tidak Ada Data" };
  }

  const limit = RISK_THRESHOLDS[sensor] ?? { warning: 0.003, danger: 0.03 };
  if (ppm >= limit.danger) {
    return { key: "danger", text: "Bahaya" };
  }

  if (ppm >= limit.warning) {
    return { key: "warning", text: "Warning" };
  }

  return { key: "normal", text: "Normal" };
}

export default function SensorMonitorPage({ fluid = false }) {
  const [supportedSensors, setSupportedSensors] = useState([...FALLBACK_SENSORS]);
  const [selectedSensor, setSelectedSensor] = useState("mq135");
  const [deviceInput, setDeviceInput] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [latestSensor, setLatestSensor] = useState(null);
  const [latestAll, setLatestAll] = useState([]);
  const [singleError, setSingleError] = useState("");
  const [allError, setAllError] = useState("");

  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();

    async function loadSupported() {
      try {
        const payload = await fetchSupportedSensors(controller.signal);
        if (!isMounted) {
          return;
        }

        const sensors = payload.sensors.length > 0 ? payload.sensors : [...FALLBACK_SENSORS];
        setSupportedSensors(sensors);
        setSelectedSensor((current) => {
          if (current && sensors.includes(current)) {
            return current;
          }

          return sensors[0] ?? "mq135";
        });
      } catch {
        if (!isMounted) {
          return;
        }

        setSupportedSensors([...FALLBACK_SENSORS]);
        setSelectedSensor((current) => current || "mq135");
      }
    }

    loadSupported();

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, []);

  const refreshData = useCallback(
    async (silent = false) => {
      if (!selectedSensor) {
        return;
      }

      setRefreshing(true);
      if (!silent) {
        setLoading(true);
      }

      const controller = new AbortController();

      try {
        const [singleResult, allResult] = await Promise.allSettled([
          fetchLatestSensor(selectedSensor, deviceId, controller.signal),
          fetchLatestAllSensors({ deviceId, signal: controller.signal })
        ]);

        if (singleResult.status === "fulfilled") {
          setLatestSensor(singleResult.value);
          setSingleError("");
        } else {
          setSingleError(singleResult.reason instanceof Error ? singleResult.reason.message : "Gagal memuat latest sensor");
        }

        if (allResult.status === "fulfilled") {
          setLatestAll(allResult.value.items);
          setAllError("");
        } else {
          setAllError(allResult.reason instanceof Error ? allResult.reason.message : "Gagal memuat latest semua sensor");
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [deviceId, selectedSensor]
  );

  useEffect(() => {
    refreshData(false);
  }, [refreshData]);

  useEffect(() => {
    const timer = setInterval(() => {
      refreshData(true);
    }, POLL_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [refreshData]);

  const latestBySensor = useMemo(() => {
    const map = new Map();

    latestAll.forEach((item) => {
      if (!item?.sensor) {
        return;
      }

      const key = item.sensor;
      const current = map.get(key);
      const currentTime = current?.created_at ? Date.parse(current.created_at) : Number.NEGATIVE_INFINITY;
      const nextTime = item.created_at ? Date.parse(item.created_at) : Number.NEGATIVE_INFINITY;

      if (!current || nextTime >= currentTime) {
        map.set(key, item);
      }
    });

    return map;
  }, [latestAll]);

  const sensorCards = useMemo(() => {
    return supportedSensors
      .map((sensor) => {
        const item = latestBySensor.get(sensor) ?? null;
        const ppm = item?.ppm ?? null;
        const risk = getRisk(sensor, ppm);
        return { sensor, item, ppm, risk };
      })
      .sort((left, right) => {
        const leftValue = Number.isFinite(left.ppm) ? Number(left.ppm) : Number.NEGATIVE_INFINITY;
        const rightValue = Number.isFinite(right.ppm) ? Number(right.ppm) : Number.NEGATIVE_INFINITY;
        return rightValue - leftValue;
      });
  }, [latestBySensor, supportedSensors]);

  const selectedRisk = useMemo(() => {
    if (!latestSensor) {
      return { key: "unknown", text: "Tidak Ada Data" };
    }

    return getRisk(latestSensor.sensor, latestSensor.ppm);
  }, [latestSensor]);

  return (
    <main className={`page sensor-monitor-page theme ${fluid ? "flow-page" : ""}`}>
      <section className="container">
        <header className="dashboard-hero">
          <div>
            <Badge variant="outline" className="mb-2">Latest Sensor</Badge>
            <h1>Monitoring Sensor Realtime</h1>
            <p className="subtitle">Auto refresh setiap 2 detik dari endpoint latest sensor.</p>
          </div>

          <div className="actions">
            <Button type="button" variant="secondary" onClick={() => refreshData(true)}>
              <ClockRefreshIcon className="ui-icon" />
              <span>{refreshing ? "Refreshing..." : "Refresh"}</span>
            </Button>
          </div>
        </header>

        <Card className="panel">
          <CardHeader>
            <CardTitle>Sensor Selector</CardTitle>
            <CardDescription>Pilih sensor dan device ID opsional untuk latest data.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="sensor-control-row">
              <label className="sensor-input-wrap">
                <span className="field-label">Sensor</span>
                <div className="field-shell">
                  <select
                    className="select-field"
                    value={selectedSensor}
                    onChange={(event) => setSelectedSensor(event.target.value)}
                  >
                    {supportedSensors.map((sensor) => (
                      <option key={sensor} value={sensor}>
                        {formatLabel(sensor)}
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

              <Button
                type="button"
                className="monitor-apply-btn"
                onClick={() => setDeviceId(deviceInput.trim())}
              >
                Terapkan Device
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="cards summary-cards">
          <Card className="card">
            <CardHeader>
              <CardDescription>Sensor Aktif</CardDescription>
              <CardTitle className="value small">{formatLabel(selectedSensor)}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="card">
            <CardHeader>
              <CardDescription>Jumlah Sensor Tersedia</CardDescription>
              <CardTitle className="value">{supportedSensors.length}</CardTitle>
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
              <CardDescription>Status Sensor Aktif</CardDescription>
              <CardTitle className={`value status-${selectedRisk.key}`}>{selectedRisk.text}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        <Card className="panel sensor-realtime-card">
          <CardHeader>
            <CardTitle>Latest Single Sensor</CardTitle>
            <CardDescription>
              Endpoint: <code>/sensors/{`{sensor}`}/latest</code>
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading && <p className="info">Memuat data sensor realtime...</p>}
            {!loading && singleError && <p className="error">{singleError}</p>}
            {!loading && !singleError && latestSensor && (
            <div className="sensor-realtime-grid">
              <p>
                <strong>PPM:</strong>{" "}
                {formatNumber(latestSensor.ppm)} {latestSensor.unit || "ppm"}
              </p>

              <p>
                <strong>Timestamp:</strong>{" "}
                {formatTime(latestSensor.created_at)}
              </p>
            </div>
            )}
          </CardContent>
        </Card>

        <Card className="panel">
          <CardHeader>
            <CardTitle>Latest All Sensors</CardTitle>
            <CardDescription>Diurutkan berdasarkan ppm tertinggi.</CardDescription>
          </CardHeader>
          <CardContent>
            {allError && <p className="error">{allError}</p>}
            {!allError && (
              <div className="sensor-latest-grid">
                {sensorCards.map((entry) => (
                  <article key={entry.sensor} className={`sensor-card status-${entry.risk.key}`}>
                    <div className="sensor-head">
                      <div>
                        <h3>{formatLabel(entry.sensor)}</h3>
                        <p>{formatNumber(entry.ppm)} {entry.item?.unit || "ppm"}</p>
                      </div>
                      <Badge variant="outline">{entry.risk.text}</Badge>
                    </div>
                    <div className="sensor-meta">
                      <p>
                        <strong>Updated:</strong>{" "}
                        {formatTime(entry.item?.created_at)}
                      </p>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
