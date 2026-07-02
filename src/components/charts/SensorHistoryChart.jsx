import { memo, useEffect, useMemo, useRef, useState } from "react";
import ApexCharts from "apexcharts";
import { normalizeSensorName, prepareSensorChartPoints } from "@/utils/chartData";

const JAKARTA_TIME_ZONE = "Asia/Jakarta";

const SENSOR_COLORS = {
  mq135: "#ffd23f",
  nh3_mics: "#1f57d6",
  co: "#ff4b5f",
  no2: "#f76b35",
  nh3_mems: "#34cfff",
  h2s: "#4ade80"
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

function formatSensorNumber(value) {
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
  if (abs >= 1000) {
    return num.toFixed(0);
  }
  if (abs >= 100) {
    return num.toFixed(1);
  }
  return num.toFixed(3);
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

  const normalizedSensors = useMemo(
    () => (Array.isArray(sensors) ? sensors.map((sensor) => normalizeSensorName(sensor)).filter(Boolean) : []),
    [sensors]
  );

  const series = useMemo(
    () =>
      normalizedSensors.map((sensor) => ({
        name: labelForSensor(sensor),
        data: prepareSensorChartPoints(rows, sensor).map((point) => [point.x, point.y])
      })),
    [normalizedSensors, rows]
  );

  const colors = useMemo(
    () => normalizedSensors.map((sensor) => SENSOR_COLORS[sensor] ?? "#34cfff"),
    [normalizedSensors]
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
          formatter: (value) => formatSensorNumber(value)
        }
      },
      tooltip: {
        shared: true,
        intersect: false,
        x: {
          formatter: (value) => `${formatTime(Number(value))} WIB`
        },
        y: {
          formatter: (value) => `${formatSensorNumber(value)} ppm`
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
