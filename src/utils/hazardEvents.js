export const SENSOR_RISK_THRESHOLDS = {
  mq135: { warning: 50, danger: 200 },
  nh3_mics: { warning: 15, danger: 50 },
  co: { warning: 10, danger: 100 },
  no2: { warning: 1, danger: 5 },
  nh3_mems: { warning: 15, danger: 50 },
  h2s: { warning: 1, danger: 100 }
};

export const HAZARD_SENSOR_KEYS = Object.keys(SENSOR_RISK_THRESHOLDS);

const hazardTimeFormatter = new Intl.DateTimeFormat("id-ID", {
  timeZone: "Asia/Jakarta",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour12: false
});

export function formatSensorLabel(sensor) {
  return String(sensor ?? "").replaceAll("_", " ").toUpperCase();
}

export function formatHazardValue(value) {
  const num = Number(value);

  if (!Number.isFinite(num)) {
    return "--";
  }

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

  return num.toFixed(2);
}

export function formatHazardTime(value) {
  if (!value) {
    return "--";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "--";
  }

  return hazardTimeFormatter.format(date);
}

export function getSensorRisk(sensor, ppm) {
  const value = Number(ppm);

  if (!Number.isFinite(value)) {
    return { key: "unknown", text: "Tidak Ada Data" };
  }

  const limit = SENSOR_RISK_THRESHOLDS[sensor] ?? { warning: 0.003, danger: 0.03 };
  if (value >= limit.danger) {
    return { key: "danger", text: "Bahaya" };
  }

  if (value >= limit.warning) {
    return { key: "warning", text: "Warning" };
  }

  return { key: "normal", text: "Normal" };
}

export function getHazardEventFromRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return null;
  }

  const latestRow = [...rows]
    .filter(Boolean)
    .sort((left, right) => {
      const leftTime = Number(left.timestamp_ms ?? Date.parse(left.created_at ?? ""));
      const rightTime = Number(right.timestamp_ms ?? Date.parse(right.created_at ?? ""));
      return (rightTime || Number.NEGATIVE_INFINITY) - (leftTime || Number.NEGATIVE_INFINITY);
    })[0];

  if (!latestRow) {
    return null;
  }

  const dangerSensors = HAZARD_SENSOR_KEYS
    .map((sensor) => {
      const value = Number(latestRow[sensor]);
      const threshold = SENSOR_RISK_THRESHOLDS[sensor]?.danger;

      if (!Number.isFinite(value) || !Number.isFinite(threshold) || value < threshold) {
        return null;
      }

      return {
        sensor,
        label: formatSensorLabel(sensor),
        value,
        threshold
      };
    })
    .filter(Boolean)
    .sort((left, right) => (right.value / right.threshold) - (left.value / left.threshold));

  if (dangerSensors.length === 0) {
    return null;
  }

  const primary = dangerSensors[0];

  return {
    id: `${latestRow.id ?? "latest"}-${primary.sensor}-${latestRow.created_at ?? "no-time"}`,
    sensor: primary.sensor,
    label: primary.label,
    value: primary.value,
    threshold: primary.threshold,
    deviceId: latestRow.device_id || "Semua Device",
    createdAt: latestRow.created_at,
    formattedValue: formatHazardValue(primary.value),
    formattedThreshold: formatHazardValue(primary.threshold),
    formattedTime: formatHazardTime(latestRow.created_at),
    triggeredSensors: dangerSensors
  };
}
