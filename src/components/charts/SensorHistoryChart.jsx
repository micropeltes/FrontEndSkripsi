import { memo, useEffect, useMemo, useRef, useState } from "react";
import ApexCharts from "apexcharts";

const JAKARTA_TIME_ZONE = "Asia/Jakarta";

const SENSOR_COLORS = {
  mq135: "#14b8a6",
  fermion_nh3: "#06b6d4",
  fermion_h2s: "#22c55e",
  mics6814: "#f97316"
};

const timeFormatter = new Intl.DateTimeFormat("id-ID", {
  timeZone: JAKARTA_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false
});

function formatTime(timestampMs) {
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
    tooltipTheme: themeMode === "light" ? "light" : "dark"
  };
}

function labelForSensor(sensor) {
  return sensor.replaceAll("_", " ").toUpperCase();
}

function SensorHistoryChart({ rows, sensors }) {
  const chartRef = useRef(null);
  const instanceRef = useRef(null);
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

  const series = useMemo(
    () =>
      sensors.map((sensor) => ({
        name: labelForSensor(sensor),
        data: rows
          .map((row) => ({
            x: Date.parse(row.created_at ?? ""),
            y: Number(row[sensor])
          }))
          .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
      })),
    [rows, sensors]
  );

  const colors = useMemo(
    () => sensors.map((sensor) => SENSOR_COLORS[sensor] ?? "#38bdf8"),
    [sensors]
  );

  const options = useMemo(
    () => ({
      chart: {
        id: "sensor-history-chart",
        type: "line",
        height: 380,
        animations: {
          enabled: true,
          easing: "easeinout",
          speed: 380,
          animateGradually: { enabled: true, delay: 90 },
          dynamicAnimation: { enabled: true, speed: 260 }
        },
        toolbar: { show: false },
        zoom: { enabled: false },
        foreColor: themeTokens.axisText
      },
      stroke: {
        curve: "smooth",
        width: 2.6
      },
      colors,
      markers: {
        size: 0,
        hover: { size: 4 }
      },
      dataLabels: { enabled: false },
      fill: {
        type: "gradient",
        gradient: {
          shadeIntensity: 0.35,
          inverseColors: false,
          opacityFrom: 0.4,
          opacityTo: 0.03
        }
      },
      grid: {
        borderColor: themeTokens.grid,
        strokeDashArray: 4
      },
      xaxis: {
        type: "datetime",
        labels: {
          datetimeUTC: true,
          formatter: (value) => formatTime(Number(value))
        },
        axisBorder: { color: themeTokens.axisBorder },
        axisTicks: { color: themeTokens.axisBorder }
      },
      yaxis: {
        labels: {
          formatter: (value) => Number(value).toFixed(1)
        }
      },
      tooltip: {
        shared: true,
        intersect: false,
        x: {
          formatter: (value) => `${formatTime(Number(value))} WIB`
        },
        y: {
          formatter: (value) => `${Number(value).toFixed(2)} ppm`
        },
        theme: themeTokens.tooltipTheme
      },
      legend: {
        show: true,
        position: "top",
        horizontalAlign: "left",
        labels: {
          colors: [themeTokens.axisText]
        }
      },
      noData: {
        text: "Belum ada data history",
        align: "center",
        verticalAlign: "middle",
        style: {
          color: themeTokens.axisText
        }
      }
    }),
    [colors, themeTokens]
  );

  useEffect(() => {
    if (!chartRef.current) {
      return undefined;
    }

    const instance = new ApexCharts(chartRef.current, {
      ...options,
      series
    });

    instanceRef.current = instance;
    instance.render();

    return () => {
      instanceRef.current?.destroy();
      instanceRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!instanceRef.current) {
      return;
    }

    instanceRef.current.updateOptions(
      {
        ...options,
        series
      },
      false,
      true,
      true
    );
  }, [options, series]);

  return <div ref={chartRef} className="sensor-history-chart" style={{ minHeight: 380 }} />;
}

export default memo(SensorHistoryChart);
