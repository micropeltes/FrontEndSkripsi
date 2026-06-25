import { useCallback, useMemo, useState } from "react";
import { ClockRefreshIcon, Download04Icon } from "@untitledui/icons-react/outline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { fetchSensorHistory, sanitizeHistoryLimit } from "@/services/enoseService";
import { getHazardEventFromRows, formatHazardValue, formatSensorLabel } from "@/utils/hazardEvents";

const REPORT_SENSORS = ["mq135", "nh3_mics", "co", "no2", "nh3_mems", "h2s"];

function average(rows, sensor) {
  const values = rows.map((row) => Number(row[sensor])).filter(Number.isFinite);
  if (values.length === 0) {
    return null;
  }
  return values.reduce((total, value) => total + value, 0) / values.length;
}

export default function ExportPdfPage({ fluid = false }) {
  const [limitInput, setLimitInput] = useState("50");
  const [deviceInput, setDeviceInput] = useState("");
  const [items, setItems] = useState([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [generatedAt, setGeneratedAt] = useState("");

  const loadReport = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await fetchSensorHistory({
        limit: sanitizeHistoryLimit(limitInput, 50),
        deviceId: deviceInput.trim()
      });
      setItems(payload.items);
      setCount(payload.count);
      setGeneratedAt(new Date().toISOString());
      setError("");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Gagal membuat report PDF");
    } finally {
      setLoading(false);
    }
  }, [deviceInput, limitInput]);

  const hazardEvent = useMemo(() => getHazardEventFromRows(items), [items]);
  const stats = useMemo(
    () => REPORT_SENSORS.map((sensor) => ({ sensor, average: average(items, sensor) })),
    [items]
  );

  function printReport() {
    if (items.length === 0) {
      return;
    }

    window.print();
  }

  return (
    <main className={`page export-pdf-page theme ${fluid ? "flow-page" : ""}`}>
      <section className="container">
        <header className="dashboard-hero no-print">
          <div>
            <Badge variant="outline" className="mb-2 neon-badge">PDF Report</Badge>
            <h1>Export PDF Report</h1>
            <p className="subtitle">Generate ringkasan sensor yang siap dicetak atau disimpan sebagai PDF melalui browser print.</p>
          </div>
          <div className="actions">
            <Button type="button" variant="secondary" onClick={loadReport} disabled={loading}>
              <ClockRefreshIcon className="ui-icon" />
              <span>{loading ? "Generating..." : "Generate"}</span>
            </Button>
            <Button type="button" variant="outline" onClick={printReport} disabled={items.length === 0}>
              <Download04Icon className="ui-icon" />
              <span>Print / Save PDF</span>
            </Button>
          </div>
        </header>

        <Card className="panel no-print">
          <CardHeader>
            <CardTitle>Report Filter</CardTitle>
            <CardDescription>Pilih jumlah data dan device ID sebelum generate PDF.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="sensor-control-row">
              <label className="sensor-input-wrap">
                <span className="field-label">Limit Data</span>
                <Input type="number" min="1" max="1000" value={limitInput} onChange={(event) => setLimitInput(event.target.value)} />
              </label>
              <label className="sensor-input-wrap">
                <span className="field-label">Device ID (opsional)</span>
                <Input value={deviceInput} onChange={(event) => setDeviceInput(event.target.value)} placeholder="esp32-1" />
              </label>
            </div>
            {error && <p className="error">{error}</p>}
          </CardContent>
        </Card>

        <section className="pdf-report-sheet">
          <header className="pdf-report-header">
            <div>
              <p className="eyebrow">Garbage Odor Detection</p>
              <h2>Sensor Safety Report</h2>
            </div>
            <Badge variant="outline" className={hazardEvent ? "hazard-badge" : "neon-badge"}>
              {hazardEvent ? "Hazard Detected" : "Normal Report"}
            </Badge>
          </header>

          <div className="report-summary-grid">
            <p><strong>Rows</strong><span>{count}</span></p>
            <p><strong>Device</strong><span>{deviceInput.trim() || "Semua Device"}</span></p>
            <p><strong>Generated</strong><span>{generatedAt ? new Date(generatedAt).toLocaleString("id-ID") : "--"}</span></p>
            <p><strong>Hazard</strong><span>{hazardEvent ? hazardEvent.label : "Tidak ada"}</span></p>
          </div>

          {hazardEvent && (
            <Card className="hazard-event report-hazard-card">
              <CardHeader>
                <CardTitle>Hazard Event</CardTitle>
                <CardDescription>{hazardEvent.label} mencapai {hazardEvent.formattedValue} ppm.</CardDescription>
              </CardHeader>
            </Card>
          )}

          <div className="report-stat-grid">
            {stats.map((entry) => (
              <article key={entry.sensor} className="report-stat-card">
                <span>{formatSensorLabel(entry.sensor)}</span>
                <strong>{formatHazardValue(entry.average)} ppm</strong>
              </article>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}
