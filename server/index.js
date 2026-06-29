import { Hono } from "hono";
import { serve } from "@hono/node-server";

const SOURCE_API = process.env.SOURCE_API;
const PORT = Number.parseInt(process.env.PORT ?? "3000", 10);
const REQUEST_TIMEOUT_MS = 10_000;
const DEVICE_ID_MAX_LENGTH = 64;
const LIMIT_MAX = 1000;
const SAFE_DEVICE_ID_PATTERN = /^[a-zA-Z0-9_.:-]+$/;

if (!SOURCE_API) {
  throw new Error("Missing SOURCE_API environment variable");
}

function parseSourceApi(sourceApi) {
  const url = new URL(sourceApi);
  if (![
    "http:",
    "https:"
  ].includes(url.protocol)) {
    throw new Error("SOURCE_API must use http or https protocol");
  }
  url.username = "";
  url.password = "";
  return url;
}

const sourceApiUrl = parseSourceApi(SOURCE_API);

function sanitizeDeviceId(deviceId) {
  if (!deviceId) {
    return "";
  }

  const trimmed = deviceId.trim().slice(0, DEVICE_ID_MAX_LENGTH);
  return SAFE_DEVICE_ID_PATTERN.test(trimmed) ? trimmed : "";
}

function sanitizeLimit(limit) {
  const parsed = Number.parseInt(limit ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return "";
  }
  return String(Math.min(parsed, LIMIT_MAX));
}

const app = new Hono();

app.get("/api/health", (c) => {
  return c.json({ status: "ok" });
});

app.get("/api/data", async (c) => {
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), REQUEST_TIMEOUT_MS);

  try {
    const upstreamUrl = new URL(sourceApiUrl);
    const deviceId = sanitizeDeviceId(c.req.query("device_id"));
    const limit = sanitizeLimit(c.req.query("limit") ?? c.req.query("jumlah"));

    if (deviceId) {
      upstreamUrl.searchParams.set("device_id", deviceId);
    }
    if (limit) {
      upstreamUrl.searchParams.set("limit", limit);
    }

    const response = await fetch(upstreamUrl, { signal: timeoutController.signal });

    if (!response.ok) {
      return c.json(
        {
          message: "Gagal mengambil data dari upstream API",
          status: response.status
        },
        502
      );
    }

    const payload = await response.json();
    return c.json(payload);
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === "AbortError";
    return c.json(
      {
        message: isTimeout
          ? "Server proxy timeout saat menghubungi upstream API"
          : "Server proxy gagal menghubungi upstream API"
      },
      isTimeout ? 504 : 500
    );
  } finally {
    clearTimeout(timeoutId);
  }
});

serve(
  {
    fetch: app.fetch,
    port: PORT,
    hostname: "127.0.0.1"
  },
  () => {
    console.log(`Legacy Hono proxy running on http://127.0.0.1:${PORT}`);
  }
);
