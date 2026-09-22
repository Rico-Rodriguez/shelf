"use client";

import { useRef, useState } from "react";

export function ScrubChart({
  points,
  onScrub,
}: {
  points: { date: string; cents: number }[];
  onScrub?: (point: { date: string; cents: number } | null) => void;
}) {
  const ref = useRef<SVGSVGElement | null>(null);
  const [index, setIndex] = useState<number | null>(null);
  if (points.length < 2) return null;

  const values = points.map((point) => point.cents);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const raw = max - min;
  const pad = raw === 0 ? Math.max(Math.abs(max) * 0.08, 1) : raw * 0.24;
  const lo = min - pad;
  const hi = max + pad;
  const span = hi - lo || 1;
  const width = 100;
  const height = 36;
  const inset = 3;
  const inner = height - inset * 2;
  const coords = points.map((point, i) => ({
    x: (i / (points.length - 1)) * width,
    y: inset + ((hi - point.cents) / span) * inner,
  }));
  const line = coords.map((coord, i) => `${i === 0 ? "M" : "L"}${coord.x.toFixed(2)},${coord.y.toFixed(2)}`).join(" ");
  const area = `${line} L${width},${height} L0,${height} Z`;

  function pick(clientX: number) {
    const svg = ref.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const t = rect.width ? Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)) : 0;
    const next = Math.round(t * (points.length - 1));
    setIndex(next);
    onScrub?.(points[next] ?? null);
  }

  function clear() {
    setIndex(null);
    onScrub?.(null);
  }

  const active = index != null ? coords[index] : null;

  return (
    <svg
      ref={ref}
      className="scrub-chart"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label="Drag across the line to see a value"
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        pick(event.clientX);
      }}
      onPointerMove={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) pick(event.clientX);
      }}
      onPointerUp={clear}
      onPointerCancel={clear}
    >
      <path d={area} fill="var(--accent)" opacity="0.16" />
      <path d={line} fill="none" stroke="var(--accent)" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
      {active ? (
        <line x1={active.x} x2={active.x} y1="0" y2={height} stroke="var(--ink)" strokeWidth="1" vectorEffect="non-scaling-stroke" opacity="0.4" />
      ) : null}
    </svg>
  );
}
