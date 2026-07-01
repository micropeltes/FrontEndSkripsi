import { normalizeLatestPayload, sanitizeDeviceId, sanitizeLimit } from "@/services/sensorService";

const WS_PATH = "/api/v1/ws/sensors/latest";

export function buildSensorWebSocketUrl({ limit = 1000, deviceId = "" } = {}) {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const base = new URL(`${protocol}//${window.location.host}${WS_PATH}`);

  const safeLimit = sanitizeLimit(limit, 1000);
  const safeDeviceId = sanitizeDeviceId(deviceId);
  base.searchParams.set("limit", String(safeLimit));
  if (safeDeviceId) {
    base.searchParams.set("device_id", safeDeviceId);
  }

  return base.toString();
}

export function normalizeSensorWebSocketMessage(message, deviceId = "") {
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    return { type: "unknown", payload: null };
  }

  const messageType = typeof message.type === "string" ? message.type : "";
  if (messageType === "health" || messageType === "pong") {
    return { type: messageType, payload: message };
  }

  if (messageType === "snapshot" || messageType === "update" || Array.isArray(message.items)) {
    const normalized = normalizeLatestPayload(message);
    const safeDeviceId = sanitizeDeviceId(deviceId);
    const normalizedType = messageType === "snapshot" ? "snapshot" : messageType === "update" ? "update" : "data";
    if (!safeDeviceId) {
      return { type: normalizedType, payload: normalized };
    }

    const items = normalized.items.filter((item) => item.device_id === safeDeviceId);
    const rawItems = Array.isArray(normalized.raw_items)
      ? normalized.raw_items.filter((item) => item && typeof item === "object" && item.device_id === safeDeviceId)
      : [];
    return {
      type: normalizedType,
      payload: {
        ...normalized,
        count: items.length,
        items,
        raw_items: rawItems
      }
    };
  }

  return { type: "unknown", payload: message };
}
