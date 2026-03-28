"use client";

import { useEffect, useRef } from "react";
import {
  Chart,
  BarController, BarElement,
  LineController, LineElement, PointElement,
  PieController, ArcElement,
  DoughnutController,
  RadarController, RadialLinearScale,
  ScatterController,
  CategoryScale, LinearScale,
  Legend, Title, Tooltip,
} from "chart.js";

Chart.register(
  BarController, BarElement,
  LineController, LineElement, PointElement,
  PieController, ArcElement,
  DoughnutController,
  RadarController, RadialLinearScale,
  ScatterController,
  CategoryScale, LinearScale,
  Legend, Title, Tooltip,
);

export function ChartBlock({ config }: { config: object }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    chartRef.current?.destroy();
    try {
      chartRef.current = new Chart(canvas, config as any);
    } catch (e) {
      console.error("ChartBlock: failed to render chart", e);
    }
    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [config]);

  return (
    <div className="w-full max-h-80">
      <canvas ref={canvasRef} />
    </div>
  );
}
