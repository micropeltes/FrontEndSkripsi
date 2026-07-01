import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckIcon, ClockRefreshIcon, Save01Icon } from "@untitledui/icons-react/outline";
import ToastStack from "@/components/ToastStack";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  FALLBACK_SENSORS,
  fetchCalibration,
  fetchSupportedSensors,
  upsertCalibration
} from "@/services/enoseService";

const RATIO_MODE_OPTIONS = ["rs_r0", "r0_rs"];

function formatSensor(sensor) {
  return sensor.replaceAll("_", " ").toUpperCase();
}

function createToast(message, type = "success") {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    message,
    type,
    durationMs: type === "error" ? 4200 : 3200
  };
}

export default function CalibrationManagerPage({ fluid = false }) {
  const [supportedSensors, setSupportedSensors] = useState([...FALLBACK_SENSORS]);
  const [sensor, setSensor] = useState("mq135");
  const [deviceInput, setDeviceInput] = useState("esp32-1");
  const [deviceId, setDeviceId] = useState("esp32-1");
  const [r0, setR0] = useState("10000");
  const [rlOhm, setRlOhm] = useState("10000");
  const [vcc, setVcc] = useState("5.0");
  const [ratioMode, setRatioMode] = useState("rs_r0");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [toasts, setToasts] = useState([]);

  const pushToast = useCallback((message, type = "success") => {
    setToasts((current) => [...current, createToast(message, type)]);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

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
        setSensor((current) => (sensors.includes(current) ? current : sensors[0] ?? "mq135"));
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

  const loadCalibration = useCallback(async () => {
    if (!sensor) {
      return;
    }

    setLoading(true);
    setError("");

    try {
      const payload = await fetchCalibration(sensor, deviceId);

      setR0(String(payload.r0 ?? ""));
      setRlOhm(String(payload.rl_ohm ?? ""));
      setVcc(String(payload.vcc ?? ""));
      setRatioMode(payload.ratio_mode || "rs_r0");
      if (payload.device_id) {
        setDeviceInput(payload.device_id);
        setDeviceId(payload.device_id);
      }
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : "Gagal memuat calibration";
      setError(message);
      pushToast(message, "error");
    } finally {
      setLoading(false);
    }
  }, [deviceId, pushToast, sensor]);

  useEffect(() => {
    loadCalibration();
  }, [loadCalibration]);

  const saveCalibration = async (event) => {
    event.preventDefault();
    const effectiveDeviceId = deviceInput.trim();

    if (!sensor) {
      setError("Sensor wajib dipilih");
      return;
    }

    if (!effectiveDeviceId) {
      setError("Device ID wajib diisi");
      return;
    }

    if (!Number.isFinite(Number(r0)) || !Number.isFinite(Number(rlOhm)) || !Number.isFinite(Number(vcc))) {
      setError("Nilai r0, rl_ohm, dan vcc harus angka valid");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const payload = await upsertCalibration(sensor, {
        device_id: effectiveDeviceId,
        r0: Number(r0),
        rl_ohm: Number(rlOhm),
        vcc: Number(vcc),
        ratio_mode: ratioMode
      });

      setR0(String(payload.r0 ?? ""));
      setRlOhm(String(payload.rl_ohm ?? ""));
      setVcc(String(payload.vcc ?? ""));
      setRatioMode(payload.ratio_mode || ratioMode);
      setDeviceId(effectiveDeviceId);
      pushToast(`Calibration ${formatSensor(sensor)} berhasil disimpan`, "success");
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : "Gagal menyimpan calibration";
      setError(message);
      pushToast(message, "error");
    } finally {
      setSaving(false);
    }
  };

  const previewPayload = useMemo(
    () => ({
      device_id: deviceInput.trim(),
      r0: Number(r0),
      rl_ohm: Number(rlOhm),
      vcc: Number(vcc),
      ratio_mode: ratioMode
    }),
    [deviceInput, r0, ratioMode, rlOhm, vcc]
  );

  return (
    <main className={`page calibration-page theme ${fluid ? "flow-page" : ""}`}>
      <ToastStack toasts={toasts} onRemove={removeToast} />

      <section className="container">
        <header className="dashboard-hero">
          <div>
            <Badge variant="outline" className="mb-2">Calibration</Badge>
            <h1>Calibration Manager</h1>
            <p className="subtitle">GET dan PUT calibration per sensor + device dengan toast notifikasi.</p>
          </div>

          <div className="actions">
            <Button type="button" variant="secondary" onClick={loadCalibration} disabled={loading}>
              <ClockRefreshIcon className="ui-icon" />
              <span>{loading ? "Memuat..." : "Load Calibration"}</span>
            </Button>
          </div>
        </header>

        <div className="sensor-tools-grid">
          <Card className="panel">
            <CardHeader>
              <CardTitle>Form Calibration</CardTitle>
              <CardDescription>Edit lalu simpan calibration backend.</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="sensor-form-grid" onSubmit={saveCalibration}>
                <label className="sensor-input-wrap">
                  <span className="field-label">Sensor</span>
                  <div className="field-shell">
                    <select className="select-field" value={sensor} onChange={(event) => setSensor(event.target.value)}>
                      {supportedSensors.map((entry) => (
                        <option key={entry} value={entry}>
                          {formatSensor(entry)}
                        </option>
                      ))}
                    </select>
                    <span className="select-caret">v</span>
                  </div>
                </label>

                <label className="sensor-input-wrap">
                  <span className="field-label">Device ID</span>
                  <Input value={deviceInput} onChange={(event) => setDeviceInput(event.target.value)} placeholder="esp32-1" />
                </label>

                <Button
                  type="button"
                  variant="outline"
                  className="monitor-apply-btn"
                  onClick={() => setDeviceId(deviceInput.trim())}
                >
                  <CheckIcon className="ui-icon" />
                  <span>Terapkan Device</span>
                </Button>

                <label className="sensor-input-wrap">
                  <span className="field-label">R0</span>
                  <Input value={r0} onChange={(event) => setR0(event.target.value)} type="number" required />
                </label>

                <label className="sensor-input-wrap">
                  <span className="field-label">RL Ohm</span>
                  <Input value={rlOhm} onChange={(event) => setRlOhm(event.target.value)} type="number" required />
                </label>

                <label className="sensor-input-wrap">
                  <span className="field-label">VCC</span>
                  <Input value={vcc} onChange={(event) => setVcc(event.target.value)} type="number" step="0.1" required />
                </label>

                <label className="sensor-input-wrap">
                  <span className="field-label">Ratio Mode</span>
                  <div className="field-shell">
                    <select className="select-field" value={ratioMode} onChange={(event) => setRatioMode(event.target.value)}>
                      {RATIO_MODE_OPTIONS.map((mode) => (
                        <option key={mode} value={mode}>
                          {mode}
                        </option>
                      ))}
                    </select>
                    <span className="select-caret">v</span>
                  </div>
                </label>

                <Button type="submit" disabled={saving}>
                  <Save01Icon className="ui-icon" />
                  <span>{saving ? "Menyimpan..." : "Save / Update Calibration"}</span>
                </Button>
              </form>
              {error && <p className="error">{error}</p>}
            </CardContent>
          </Card>

          <Card className="panel">
            <CardHeader>
              <CardTitle>Payload Preview</CardTitle>
              <CardDescription>Body untuk endpoint PUT calibration.</CardDescription>
            </CardHeader>
            <CardContent>
              <pre className="json-preview">{JSON.stringify(previewPayload, null, 2)}</pre>
            </CardContent>
          </Card>
        </div>
      </section>
    </main>
  );
}
