export const CHART_POINT_LIMIT = 50;
const UNIX_MS_THRESHOLD = 100_000_000_000;

function toFiniteNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeTimestampNumber(value) {
  const numeric = toFiniteNumber(value);
  if (numeric === null || numeric <= 0) {
    return null;
  }

  return numeric < UNIX_MS_THRESHOLD ? numeric * 1000 : numeric;
}

export function normalizeSensorName(sensor) {
  return typeof sensor === "string" ? sensor.trim().toLowerCase() : "";
}

export function getBestTimestampMs(item) {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    return null;
  }

  const createdAt = typeof item.created_at === "string" ? item.created_at.trim() : "";
  if (createdAt) {
    const parsed = Date.parse(createdAt);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return (
    normalizeTimestampNumber(item.payload_timestamp_ms) ??
    normalizeTimestampNumber(item.received_timestamp_ms) ??
    normalizeTimestampNumber(item.timestamp_ms) ??
    normalizeTimestampNumber(item.timestamp)
  );
}

export function getSensorValue(item, sensorName) {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    return null;
  }

  const sensor = normalizeSensorName(sensorName);
  if (!sensor) {
    return null;
  }

  const sensors = item.sensors && typeof item.sensors === "object" && !Array.isArray(item.sensors)
    ? item.sensors
    : {};
  const sensorNode = sensors[sensor];
  if (sensorNode && typeof sensorNode === "object" && !Array.isArray(sensorNode)) {
    const ppm = toFiniteNumber(sensorNode.ppm);
    if (ppm !== null) {
      return ppm;
    }
  }

  return toFiniteNumber(item[sensor]);
}

export function extractResponseItems(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (!payload || typeof payload !== "object") {
    return [];
  }

  if (Array.isArray(payload.items)) {
    return payload.items;
  }
  if (Array.isArray(payload.data)) {
    return payload.data;
  }
  if (Array.isArray(payload.readings)) {
    return payload.readings;
  }

  return [];
}

export function prepareSensorChartPoints(rows, sensorName, limit = CHART_POINT_LIMIT) {
  if (!Array.isArray(rows)) {
    return [];
  }

  const sensor = normalizeSensorName(sensorName);
  if (!sensor) {
    return [];
  }

  const pointsByTimestamp = new Map();
  rows.forEach((row, index) => {
    const timestampMs = getBestTimestampMs(row);
    const value = getSensorValue(row, sensor);
    if (!Number.isFinite(timestampMs) || !Number.isFinite(value)) {
      return;
    }

    pointsByTimestamp.set(timestampMs, {
      x: timestampMs,
      y: value,
      sourceIndex: index
    });
  });

  return Array.from(pointsByTimestamp.values())
    .sort((left, right) => {
      if (left.x !== right.x) {
        return left.x - right.x;
      }
      return left.sourceIndex - right.sourceIndex;
    })
    .slice(-Math.max(1, Number(limit) || CHART_POINT_LIMIT))
    .map(({ x, y }) => ({ x, y }));
}
