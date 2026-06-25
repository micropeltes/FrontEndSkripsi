import { useCallback, useEffect, useMemo, useState } from "react";
import { ClockRefreshIcon } from "@untitledui/icons-react/outline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchLatestAllSensors } from "@/services/enoseService";
import { getSensorRisk, formatHazardValue, formatSensorLabel } from "@/utils/hazardEvents";

const POLL_INTERVAL_MS = 2000;

const commandTimeFormatter = new Intl.DateTimeFormat("id-ID", {
  timeZone: "Asia/Jakarta",
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

  return commandTimeFormatter.format(date);
}

function latestPerSensor(items) {
  const map = new Map();

  items.forEach((item) => {
    if (!item?.sensor) {
      return;
    }

    const current = map.get(item.sensor);
    const currentTime = current?.created_at ? Date.parse(current.created_at) : Number.NEGATIVE_INFINITY;
    const nextTime = item.created_at ? Date.parse(item.created_at) : Number.NEGATIVE_INFINITY;

    if (!current || nextTime >= currentTime) {
      map.set(item.sensor, item);
    }
  });

  return [...map.values()];
}

export default function NervCommandViewPage({ fluid = false }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [lastSyncedAt, setLastSyncedAt] = useState("");

  const refreshCommand = useCallback(async (silent = false) => {
    setRefreshing(true);
    if (!silent) {
      setLoading(true);
    }

    try {
      const payload = await fetchLatestAllSensors();
      setItems(payload.items);
      setLastSyncedAt(new Date().toISOString());
      setError("");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Gagal memuat command view");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    refreshCommand(false);
  }, [refreshCommand]);

  useEffect(() => {
    const timer = setInterval(() => refreshCommand(true), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [refreshCommand]);

  const commandSensors = useMemo(() => latestPerSensor(items), [items]);
  const riskSummary = useMemo(() => {
    return commandSensors.reduce(
      (summary, item) => {
        const risk = getSensorRisk(item.sensor, item.ppm);
        summary[risk.key] = (summary[risk.key] ?? 0) + 1;
        return summary;
      },
      { normal: 0, warning: 0, danger: 0, unknown: 0 }
    );
  }, [commandSensors]);

  const commandStatus = riskSummary.danger > 0 ? "HAZARD" : riskSummary.warning > 0 ? "WARNING" : "NORMAL";

  return (
    <main className={`page nerv-command-page theme ${fluid ? "flow-page" : ""}`}>
      <section className="container command-layout">
        <header className="dashboard-hero command-hero">
          <div>
            <Badge variant="outline" className="mb-2 neon-badge">NERV Command View</Badge>
            <h1>Command View Realtime</h1>
            <p className="subtitle">Mode ringkas untuk monitor lab: fokus ke status operasional, hazard, dan last sync.</p>
          </div>
          <div className="actions">
            <Button type="button" variant="secondary" onClick={() => refreshCommand(true)}>
              <ClockRefreshIcon className="ui-icon" />
              <span>{refreshing ? "Refreshing..." : "Refresh"}</span>
            </Button>
          </div>
        </header>

        <Card className={`panel command-status-card status-${commandStatus.toLowerCase()}`}>
          <CardHeader>
            <CardDescription>Operational State</CardDescription>
            <CardTitle>{commandStatus}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="command-status-grid">
              <p><strong>Normal</strong><span>{riskSummary.normal}</span></p>
              <p><strong>Warning</strong><span>{riskSummary.warning}</span></p>
              <p><strong>Danger</strong><span>{riskSummary.danger}</span></p>
              <p><strong>Last Sync</strong><span>{formatTime(lastSyncedAt)}</span></p>
            </div>
          </CardContent>
        </Card>

        {loading && <p className="info">Memuat command telemetry...</p>}
        {error && <p className="error">{error}</p>}

        <section className="command-sensor-grid">
          {commandSensors.map((item) => {
            const risk = getSensorRisk(item.sensor, item.ppm);
            return (
              <article key={item.sensor} className={`sensor-card command-sensor-card status-${risk.key}`}>
                <div className="sensor-head">
                  <div>
                    <h3>{formatSensorLabel(item.sensor)}</h3>
                    <p>{formatHazardValue(item.ppm)} {item.unit || "ppm"}</p>
                  </div>
                  <Badge variant="outline">{risk.text}</Badge>
                </div>
                <div className="sensor-meta">
                  <p><strong>Device:</strong> {item.device_id || "Semua Device"}</p>
                  <p><strong>Update:</strong> {formatTime(item.created_at)}</p>
                </div>
              </article>
            );
          })}
        </section>
      </section>
    </main>
  );
}
