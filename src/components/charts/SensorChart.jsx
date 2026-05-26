import { memo, useEffect, useMemo, useRef, useState } from "react";
import ApexCharts from "apexcharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { computeMovingAverage } from "@/utils/movingAverage";

const JAKARTA_TIME_ZONE = "Asia/Jakarta";
const JAKARTA_GMT_LABEL = "GMT+7";

const timeFormatter = new Intl.DateTimeFormat("id-ID", {
  timeZone: JAKARTA_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false
});

function formatNumber(value) {
  if (!Number.isFinite(value)) {
    return "--";
  }

  const num = Number(value);
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

  if (Math.abs(num) >= 1000) {
    return num.toFixed(0);
  }

  if (Math.abs(num) >= 100) {
    return num.toFixed(1);
  }

  return num.toFixed(3);
}

function formatTimestamp(timestampMs) {
  if (!Number.isFinite(timestampMs)) {
    return "--";
  }

  return timeFormatter.format(new Date(Number(timestampMs)));
}

function getCssVar(name, fallback) {
  if (typeof window === "undefined") {
    return fallback;
  }

  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function readThemeTokens() {
  const themeMode = typeof document === "undefined" ? "dark" : document.documentElement.getAttribute("data-theme");

  return {
    axisText: getCssVar("--muted-text", "#8ea7c4"),
    axisBorder: getCssVar("--surface-border", "#64748b"),
    grid: getCssVar("--row-border", "#64748b"),
    maLine: getCssVar("--ma-line-color", "#e5e7eb"),
    tooltipTheme: themeMode === "light" ? "light" : "dark"
  };
}

function SensorChart({
  title,
  sensorKey,
  rows,
  rawSeriesColor,
  movingAverageWindow = 5,
  movingAverageEnabled = true
}) {
  const chartContainerRef = useRef(null);
  const apexInstanceRef = useRef(null);
  const [themeTokens, setThemeTokens] = useState(() => readThemeTokens());

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const root = document.documentElement;
    const update = () => setThemeTokens(readThemeTokens());
    const observer = new MutationObserver(update);

    observer.observe(root, { attributes: true, attributeFilter: ["class", "data-theme"] });
    update();

    return () => observer.disconnect();
  }, []);

  const { rawPoints, movingAveragePoints, latestRaw, latestMovingAverage } = useMemo(() => {
    const pairs = rows
      .map((row) => ({
        x: Number(row.timestamp_ms),
        y: row[sensorKey]
      }))
      .filter((point) => Number.isFinite(point.x));
    const raw = pairs.map((point) => [point.x, point.y]);
    const maValues = computeMovingAverage(
      pairs.map((point) => point.y),
      movingAverageWindow
    );
    const ma = pairs.map((point, index) => [point.x, maValues[index]]);

    const latestRawPoint = [...pairs].reverse().find((point) => Number.isFinite(point.y));
    const latestMaPoint = [...ma].reverse().find((point) => Number.isFinite(point[1]));

    return {
      rawPoints: raw,
      movingAveragePoints: ma,
      latestRaw: latestRawPoint?.y ?? null,
      latestMovingAverage: latestMaPoint?.[1] ?? null
    };
  }, [movingAverageWindow, rows, sensorKey]);

  const series = useMemo(() => {
    const base = [{ name: "Data Asli", data: rawPoints }];
    if (!movingAverageEnabled) {
      return base;
    }

    return [...base, { name: `Moving Average (${movingAverageWindow})`, data: movingAveragePoints }];
  }, [movingAverageEnabled, movingAveragePoints, movingAverageWindow, rawPoints]);

  const options = useMemo(
    () => ({
      chart: {
        id: `sensor-chart-${sensorKey}`,
        type: "line",
        height: 280,
        animations: { enabled: false },
        toolbar: { show: false },
        zoom: { enabled: false },
        foreColor: themeTokens.axisText
      },
      stroke: {
        width: movingAverageEnabled ? [2, 2] : [2],
        curve: "smooth"
      },
      colors: movingAverageEnabled ? [rawSeriesColor, themeTokens.maLine] : [rawSeriesColor],
      markers: {
        size: 0,
        hover: { size: 3 }
      },
      dataLabels: { enabled: false },
      grid: {
        borderColor: themeTokens.grid,
        strokeDashArray: 3
      },
      xaxis: {
        type: "datetime",
        labels: {
          datetimeUTC: true,
          formatter: (value) => formatTimestamp(Number(value))
        },
        axisBorder: { color: themeTokens.axisBorder },
        axisTicks: { color: themeTokens.axisBorder }
      },
      yaxis: {
        labels: {
          formatter: (value) => formatNumber(Number(value))
        }
      },
      tooltip: {
        shared: true,
        intersect: false,
        style: {
          fontSize: "12px"
        },
        x: {
          formatter: (value) => `${formatTimestamp(Number(value))} ${JAKARTA_GMT_LABEL}`
        },
        y: {
          formatter: (value) => formatNumber(Number(value))
        },
        theme: themeTokens.tooltipTheme
      },
      legend: {
        show: true,
        labels: {
          colors: [themeTokens.axisText]
        }
      },
      noData: {
        text: "Belum ada data sensor",
        align: "center",
        verticalAlign: "middle",
        style: {
          color: themeTokens.axisText
        }
      }
    }),
    [movingAverageEnabled, movingAverageWindow, rawSeriesColor, sensorKey, themeTokens]
  );

  useEffect(() => {
    if (!chartContainerRef.current) {
      return undefined;
    }

    const instance = new ApexCharts(chartContainerRef.current, {
      ...options,
      series
    });

    apexInstanceRef.current = instance;
    instance.render();

    return () => {
      apexInstanceRef.current?.destroy();
      apexInstanceRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!apexInstanceRef.current) {
      return;
    }

    apexInstanceRef.current.updateOptions(
      {
        ...options,
        series
      },
      false,
      false,
      false
    );
  }, [options, series]);

  return (
    <Card className="panel sensor-chart-card">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>
          Zona waktu: {JAKARTA_TIME_ZONE} ({JAKARTA_GMT_LABEL})
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div ref={chartContainerRef} style={{ minHeight: 280 }} />
        <div className="sensor-chart-stats">
          <span>Data asli terakhir: {formatNumber(Number(latestRaw))}</span>
          <span>
            Moving average: {movingAverageEnabled ? formatNumber(Number(latestMovingAverage)) : "nonaktif"}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

export default memo(SensorChart);
