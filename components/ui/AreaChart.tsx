"use client";

import { useState } from "react";

export interface AreaChartPoint {
  label: string;
  value: number;
}

function formatValue(value: number, format: "usd" | "number"): string {
  return format === "usd"
    ? `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
    : value.toFixed(0);
}

// Hand-rolled SVG area chart (v2 spec §4.3): accent line + gradient fill,
// no axis clutter — just min/max labels and a hover tooltip. No charting
// library, consistent with the app's no-component-library ethos.
//
// `format` is a string flag, not a callback — this is a Client Component,
// and functions (like Decimal instances elsewhere in this app) can't cross
// the server/client boundary as props.
export function AreaChart({
  points,
  height = 160,
  format = "number",
}: {
  points: AreaChartPoint[];
  height?: number;
  format?: "usd" | "number";
}) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const width = 600;
  const padding = 8;

  if (points.length === 0) {
    return <div className="flex h-40 items-center justify-center text-sm text-text-3">No data yet</div>;
  }

  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const stepX = points.length > 1 ? (width - padding * 2) / (points.length - 1) : 0;
  const coords = points.map((p, i) => {
    const x = padding + i * stepX;
    const y = padding + (1 - (p.value - min) / range) * (height - padding * 2);
    return { x, y, point: p };
  });

  const linePath = coords.map((c, i) => `${i === 0 ? "M" : "L"} ${c.x} ${c.y}`).join(" ");
  const areaPath = `${linePath} L ${coords[coords.length - 1].x} ${height} L ${coords[0].x} ${height} Z`;

  const hovered = hoverIndex !== null ? coords[hoverIndex] : null;

  function handleMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const relativeX = ((e.clientX - rect.left) / rect.width) * width;
    let closest = 0;
    let closestDist = Infinity;
    coords.forEach((c, i) => {
      const dist = Math.abs(c.x - relativeX);
      if (dist < closestDist) {
        closestDist = dist;
        closest = i;
      }
    });
    setHoverIndex(closest);
  }

  return (
    <div className="relative">
      <div className="mb-1 flex justify-between text-xs text-text-3">
        <span>{formatValue(min, format)}</span>
        <span>{formatValue(max, format)}</span>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        style={{ height }}
        onMouseMove={handleMove}
        onMouseLeave={() => setHoverIndex(null)}
      >
        <defs>
          <linearGradient id="area-chart-gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.3" />
            <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#area-chart-gradient)" />
        <path d={linePath} fill="none" stroke="var(--color-accent)" strokeWidth="1.5" />
        {hovered && (
          <>
            <line
              x1={hovered.x}
              y1={0}
              x2={hovered.x}
              y2={height}
              stroke="var(--color-border)"
              strokeWidth="1"
            />
            <circle cx={hovered.x} cy={hovered.y} r="3" fill="var(--color-accent)" />
          </>
        )}
      </svg>
      {hovered && (
        <div
          className="pointer-events-none absolute top-0 -translate-x-1/2 rounded-md border border-border bg-surface-2 px-2 py-1 text-xs text-text shadow-lg"
          style={{ left: `${(hovered.x / width) * 100}%` }}
        >
          <div className="text-text-3">{hovered.point.label}</div>
          <div className="font-mono tabular-nums">{formatValue(hovered.point.value, format)}</div>
        </div>
      )}
    </div>
  );
}
