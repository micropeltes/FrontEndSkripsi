import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildSensorWebSocketUrl, normalizeSensorWebSocketMessage } from "@/services/sensorWebSocket";
import { sanitizeDeviceId, sanitizeLimit } from "@/services/sensorService";

const DEFAULT_LIMIT = 1000;
const RECONNECT_DELAYS_MS = [1000, 2000, 5 * 1000, 10 * 1000];
const HEARTBEAT_MS = 15 * 1000;

function createInitialState() {
  return {
    count: 0,
    items: [],
    rawItems: [],
    loading: true,
    error: "",
    empty: false,
    lastSyncedAt: "",
    health: {
      status: "connecting",
      lastMessageAt: "",
      reconnectAttempt: 0,
      latencyMs: null,
      serverTime: ""
    }
  };
}

export function useSensorWebSocket(options = {}) {
  const [query, setQueryState] = useState({
    limit: sanitizeLimit(options.initialLimit ?? DEFAULT_LIMIT, DEFAULT_LIMIT),
    deviceId: sanitizeDeviceId(options.initialDeviceId ?? "")
  });
  const [state, setState] = useState(createInitialState);

  const socketRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const heartbeatTimerRef = useRef(null);
  const closedByUserRef = useRef(false);
  const reconnectAttemptRef = useRef(0);
  const pingSentAtRef = useRef(null);

  const clearTimers = useCallback(() => {
    window.clearTimeout(reconnectTimerRef.current);
    window.clearTimeout(heartbeatTimerRef.current);
    reconnectTimerRef.current = null;
    heartbeatTimerRef.current = null;
  }, []);

  const setHealthStatus = useCallback((status, patch = {}) => {
    setState((current) => ({
      ...current,
      health: {
        ...current.health,
        status,
        ...patch
      }
    }));
  }, []);

  const sendHeartbeat = useCallback(() => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }

    const clientTime = new Date().toISOString();
    pingSentAtRef.current = performance.now();
    socket.send(JSON.stringify({ type: "ping", client_time: clientTime }));
    heartbeatTimerRef.current = window.setTimeout(sendHeartbeat, HEARTBEAT_MS);
  }, []);

  const connect = useCallback(() => {
    clearTimers();
    closedByUserRef.current = false;
    setHealthStatus(reconnectAttemptRef.current > 0 ? "reconnecting" : "connecting", {
      reconnectAttempt: reconnectAttemptRef.current
    });

    const wsUrl = buildSensorWebSocketUrl(query);
    console.info("[SensorWS] connecting to", wsUrl);

    const socket = new WebSocket(wsUrl);
    socketRef.current = socket;

    socket.onopen = () => {
      console.info("[SensorWS] open");
      reconnectAttemptRef.current = 0;
      setHealthStatus("connected", {
        reconnectAttempt: 0,
        lastMessageAt: new Date().toISOString()
      });
      heartbeatTimerRef.current = window.setTimeout(sendHeartbeat, HEARTBEAT_MS);
    };

    socket.onmessage = (event) => {
      console.info("[SensorWS] message", event.data);
      let parsed = null;
      try {
        parsed = JSON.parse(event.data);
      } catch {
        return;
      }

      const lastMessageAt = new Date().toISOString();
      const normalized = normalizeSensorWebSocketMessage(parsed, query.deviceId);

      if ((normalized.type === "snapshot" || normalized.type === "update" || normalized.type === "data") && normalized.payload) {
        setState((current) => ({
          ...current,
          count: normalized.payload.count,
          items: normalized.payload.items,
          rawItems: normalized.payload.raw_items ?? [],
          loading: false,
          error: "",
          empty: normalized.payload.items.length === 0,
          lastSyncedAt: lastMessageAt,
          health: {
            ...current.health,
            status: "connected",
            lastMessageAt
          }
        }));
        return;
      }

      if (normalized.type === "health" && normalized.payload) {
        setState((current) => ({
          ...current,
          health: {
            ...current.health,
            status: "connected",
            lastMessageAt,
            serverTime: normalized.payload.server_time || current.health.serverTime
          }
        }));
        return;
      }

      if (normalized.type === "pong") {
        const latencyMs = pingSentAtRef.current === null
          ? null
          : Math.max(0, Math.round(performance.now() - pingSentAtRef.current));
        pingSentAtRef.current = null;
        setState((current) => ({
          ...current,
          health: {
            ...current.health,
            status: "connected",
            lastMessageAt,
            latencyMs,
            serverTime: normalized.payload?.server_time || current.health.serverTime
          }
        }));
      }
    };

    socket.onerror = (event) => {
      console.error("[SensorWS] error", event);
      setState((current) => ({
        ...current,
        loading: false,
        error: "Koneksi WebSocket sensor bermasalah.",
        health: {
          ...current.health,
          status: "error"
        }
      }));
    };

    socket.onclose = (event) => {
      console.warn("[SensorWS] close", event.code, event.reason);
      window.clearTimeout(heartbeatTimerRef.current);
      if (closedByUserRef.current) {
        setHealthStatus("disconnected");
        return;
      }

      const nextAttempt = reconnectAttemptRef.current + 1;
      reconnectAttemptRef.current = nextAttempt;
      const delay = RECONNECT_DELAYS_MS[Math.min(nextAttempt - 1, RECONNECT_DELAYS_MS.length - 1)];
      setHealthStatus("reconnecting", { reconnectAttempt: nextAttempt });
      reconnectTimerRef.current = window.setTimeout(connect, delay);
    };
  }, [clearTimers, query, sendHeartbeat, setHealthStatus]);

  useEffect(() => {
    connect();

    return () => {
      closedByUserRef.current = true;
      clearTimers();
      if (socketRef.current) {
        socketRef.current.onclose = null;
      }
      socketRef.current?.close(1000, "Dashboard unmounted");
      socketRef.current = null;
    };
  }, [clearTimers, connect]);

  const setQuery = useCallback((next) => {
    reconnectAttemptRef.current = 0;
    setState((current) => ({
      ...current,
      loading: true,
      error: "",
      health: {
        ...current.health,
        status: "connecting",
        reconnectAttempt: 0
      }
    }));
    setQueryState((current) => ({
      limit: sanitizeLimit(next.limit ?? current.limit, current.limit),
      deviceId: sanitizeDeviceId(next.deviceId ?? current.deviceId)
    }));
  }, []);

  const reconnect = useCallback(() => {
    reconnectAttemptRef.current = 0;
    closedByUserRef.current = true;
    clearTimers();
    if (socketRef.current) {
      socketRef.current.onclose = null;
    }
    socketRef.current?.close(1000, "Manual reconnect");
    socketRef.current = null;
    window.setTimeout(connect, 0);
  }, [clearTimers, connect]);

  return useMemo(
    () => ({
      ...state,
      query,
      setQuery,
      reconnect
    }),
    [query, reconnect, setQuery, state]
  );
}

export default useSensorWebSocket;
