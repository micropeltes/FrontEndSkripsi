import { useEffect, useMemo, useState } from "react";
import { ArrowNarrowRightIcon } from "@untitledui/icons-react/outline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { FALLBACK_SENSORS, convertAdc, fetchSupportedSensors } from "@/services/enoseService";

function formatLabel(sensor) {
  return sensor.replaceAll("_", " ").toUpperCase();
}

function formatValue(value, digits = 2) {
  if (!Number.isFinite(value)) {
    return "--";
  }

  return Number(value).toFixed(digits);
}

export default function SensorConvertPage({ fluid = false }) {
  const [supportedSensors, setSupportedSensors] = useState([...FALLBACK_SENSORS]);
  const [sensor, setSensor] = useState("mq135");
  const [adc, setAdc] = useState("12345");
  const [temperature, setTemperature] = useState("30");
  const [humidity, setHumidity] = useState("70");
  const [deviceId, setDeviceId] = useState("esp32-1");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

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

  const payloadPreview = useMemo(
    () => ({
      sensor,
      adc: Number(adc),
      device_id: deviceId.trim(),
      temperature_c: Number(temperature),
      humidity_pct: Number(humidity)
    }),
    [adc, deviceId, humidity, sensor, temperature]
  );

  const submitConvert = async (event) => {
    event.preventDefault();

    if (!sensor) {
      setError("Sensor wajib dipilih");
      return;
    }

    if (!Number.isFinite(Number(adc))) {
      setError("Nilai ADC harus angka valid");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const response = await convertAdc({
        sensor,
        adc: Number(adc),
        device_id: deviceId.trim(),
        temperature_c: Number(temperature),
        humidity_pct: Number(humidity)
      });

      setResult(response);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Gagal convert ADC");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className={`page sensor-convert-page theme ${fluid ? "flow-page" : ""}`}>
      <section className="container">
        <header className="dashboard-hero">
          <div>
            <Badge variant="outline" className="mb-2">ADC Converter</Badge>
            <h1>Tools Konversi ADC Manual</h1>
            <p className="subtitle">Kirim payload konversi ADC dan tampilkan hasil setelah submit.</p>
          </div>
        </header>

        <div className="sensor-tools-grid">
          <Card className="panel">
            <CardHeader>
              <CardTitle>Form Konversi</CardTitle>
              <CardDescription>Endpoint: `POST /sensors/convert`</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="sensor-form-grid" onSubmit={submitConvert}>
                <label className="sensor-input-wrap">
                  <span className="field-label">Sensor</span>
                  <div className="field-shell">
                    <select className="select-field" value={sensor} onChange={(event) => setSensor(event.target.value)}>
                      {supportedSensors.map((entry) => (
                        <option key={entry} value={entry}>
                          {formatLabel(entry)}
                        </option>
                      ))}
                    </select>
                    <span className="select-caret">v</span>
                  </div>
                </label>

                <label className="sensor-input-wrap">
                  <span className="field-label">ADC</span>
                  <Input value={adc} onChange={(event) => setAdc(event.target.value)} type="number" required />
                </label>

                <label className="sensor-input-wrap">
                  <span className="field-label">Temperature (C)</span>
                  <Input value={temperature} onChange={(event) => setTemperature(event.target.value)} type="number" step="0.1" />
                </label>

                <label className="sensor-input-wrap">
                  <span className="field-label">Humidity (%)</span>
                  <Input value={humidity} onChange={(event) => setHumidity(event.target.value)} type="number" step="0.1" />
                </label>

                <label className="sensor-input-wrap">
                  <span className="field-label">Device ID</span>
                  <Input value={deviceId} onChange={(event) => setDeviceId(event.target.value)} placeholder="esp32-1" />
                </label>

                <Button type="submit" disabled={submitting}>
                  <ArrowNarrowRightIcon className="ui-icon" />
                  <span>{submitting ? "Mengirim..." : "Convert Sekarang"}</span>
                </Button>
              </form>

              {error && <p className="error">{error}</p>}
            </CardContent>
          </Card>

          <Card className="panel">
            <CardHeader>
              <CardTitle>Payload Preview</CardTitle>
              <CardDescription>Payload JSON yang akan dikirim ke backend.</CardDescription>
            </CardHeader>
            <CardContent>
              <pre className="json-preview">{JSON.stringify(payloadPreview, null, 2)}</pre>
            </CardContent>
          </Card>
        </div>

        <Card className="panel">
          <CardHeader>
            <CardTitle>Hasil Konversi</CardTitle>
            <CardDescription>Response dari backend setelah submit.</CardDescription>
          </CardHeader>
          <CardContent>
            {!result && <p className="info">Belum ada hasil, silakan submit form konversi.</p>}
            {result && (
              <div className="sensor-realtime-grid">
                <p><strong>Sensor:</strong> {formatLabel(result.sensor || sensor)}</p>
                <p><strong>ADC:</strong> {formatValue(result.adc, 0)}</p>
                <p><strong>PPM:</strong> {formatValue(result.ppm)} {result.unit || "ppm"}</p>
                <p><strong>Voltage:</strong> {formatValue(result.voltage, 3)} V</p>
                <p><strong>RS:</strong> {formatValue(result.rs, 2)}</p>
                <p><strong>R0:</strong> {formatValue(result.r0, 2)}</p>
                <p><strong>Ratio:</strong> {formatValue(result.ratio, 4)}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
