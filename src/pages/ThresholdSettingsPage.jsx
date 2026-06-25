import { useEffect, useMemo, useState } from "react";
import { Save01Icon } from "@untitledui/icons-react/outline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SENSOR_RISK_THRESHOLDS, formatSensorLabel } from "@/utils/hazardEvents";

const STORAGE_KEY = "sensor-risk-threshold-settings";

function createDefaultRows() {
  return Object.entries(SENSOR_RISK_THRESHOLDS).map(([sensor, threshold]) => ({
    sensor,
    warning: String(threshold.warning),
    danger: String(threshold.danger)
  }));
}

export default function ThresholdSettingsPage({ fluid = false }) {
  const [rows, setRows] = useState(createDefaultRows);
  const [savedAt, setSavedAt] = useState("");

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (!stored) {
        return;
      }

      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        setRows(parsed);
      }
    } catch {
      setRows(createDefaultRows());
    }
  }, []);

  const invalidRows = useMemo(
    () => rows.filter((row) => Number(row.warning) >= Number(row.danger) || !Number.isFinite(Number(row.warning)) || !Number.isFinite(Number(row.danger))),
    [rows]
  );

  function updateRow(sensor, field, value) {
    setRows((current) => current.map((row) => (row.sensor === sensor ? { ...row, [field]: value } : row)));
  }

  function resetDefaults() {
    const defaults = createDefaultRows();
    setRows(defaults);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(defaults));
    setSavedAt(new Date().toISOString());
  }

  function saveThresholds(event) {
    event.preventDefault();
    if (invalidRows.length > 0) {
      return;
    }

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
    setSavedAt(new Date().toISOString());
  }

  return (
    <main className={`page threshold-settings-page theme ${fluid ? "flow-page" : ""}`}>
      <section className="container">
        <header className="dashboard-hero">
          <div>
            <Badge variant="outline" className="mb-2 neon-badge">Threshold Settings</Badge>
            <h1>Threshold Settings per Sensor</h1>
            <p className="subtitle">Atur batas warning dan danger secara clean, dengan accent neon yang tidak mengganggu plotting data.</p>
          </div>
          <div className="actions">
            <Button type="button" variant="outline" onClick={resetDefaults}>Reset Default</Button>
          </div>
        </header>

        <form onSubmit={saveThresholds}>
          <Card className="panel neon-panel">
            <CardHeader>
              <CardTitle>Risk Matrix</CardTitle>
              <CardDescription>Nilai warning harus lebih kecil dari danger. Saat ini tersimpan lokal di browser.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="threshold-grid">
                {rows.map((row) => {
                  const invalid = Number(row.warning) >= Number(row.danger) || !Number.isFinite(Number(row.warning)) || !Number.isFinite(Number(row.danger));
                  return (
                    <article key={row.sensor} className={`threshold-row ${invalid ? "is-invalid" : ""}`}>
                      <h3>{formatSensorLabel(row.sensor)}</h3>
                      <label className="sensor-input-wrap">
                        <span className="field-label">Warning ppm</span>
                        <Input type="number" step="0.0001" value={row.warning} onChange={(event) => updateRow(row.sensor, "warning", event.target.value)} />
                      </label>
                      <label className="sensor-input-wrap">
                        <span className="field-label">Danger ppm</span>
                        <Input type="number" step="0.0001" value={row.danger} onChange={(event) => updateRow(row.sensor, "danger", event.target.value)} />
                      </label>
                      <Badge variant="outline">{invalid ? "Periksa nilai" : "Valid"}</Badge>
                    </article>
                  );
                })}
              </div>

              {invalidRows.length > 0 && <p className="error">Ada threshold yang belum valid. Pastikan warning lebih kecil dari danger.</p>}
              {savedAt && <p className="info">Threshold tersimpan: {new Date(savedAt).toLocaleString("id-ID")}</p>}

              <div className="sensor-filter-actions">
                <Button type="submit" disabled={invalidRows.length > 0}>
                  <Save01Icon className="ui-icon" />
                  <span>Simpan Threshold</span>
                </Button>
              </div>
            </CardContent>
          </Card>
        </form>
      </section>
    </main>
  );
}
