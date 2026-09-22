"use client";

import { useId, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { MoneyText } from "@/components/MoneyText";
import { ProgressBar } from "@/components/ProgressBar";

export type SummaryPoint = { date?: string; cents: number };
export type SummaryTone = "good" | "warn" | "bad" | "neutral";

type Status = { label: string; tone: SummaryTone };
type Share = { label: string; cents: number; color: string };

/** Puts a zero at the start so a short cumulative series still draws a rise. */
export function seriesFromZero(points: SummaryPoint[], originDate?: string): SummaryPoint[] {
  if (!points.length) return points;
  if (points.length >= 2 && points[0].cents === 0) return points;
  return [{ date: originDate ?? points[0].date, cents: 0 }, ...points];
}

export function SummaryCard({
  label,
  labelEmphasis = false,
  cents,
  signed = false,
  suffix,
  href,
  empty,
  status,
  points,
  reference,
  caption,
  chartLabel,
  onScrub,
  shares,
  meter,
  footer,
  footerIcon,
  detail,
  note,
  compact = false,
  onClick,
  className = "",
}: {
  label: string;
  labelEmphasis?: boolean;
  cents: number;
  signed?: boolean;
  suffix?: string;
  href?: string;
  empty?: string;
  status?: Status | null;
  points?: SummaryPoint[];
  reference?: { cents: number; label: string };
  caption?: string;
  chartLabel?: string;
  onScrub?: (point: SummaryPoint | null) => void;
  shares?: Share[];
  meter?: { value: number; max: number; color?: string };
  footer?: React.ReactNode;
  footerIcon?: string;
  detail?: React.ReactNode;
  /** Always-visible one-line explanation under the figure. */
  note?: React.ReactNode;
  compact?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  const gradientId = `summary-${useId().replace(/:/g, "")}`;
  const chartRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState<number | null>(null);
  const series = points ?? [];
  const live = series.length >= 2;
  const shownShares = (shares ?? []).filter((share) => share.cents > 0);
  const active = index != null && index >= 0 && index < series.length ? index : null;

  const figure = empty ? (
    <p className="summary-empty">{empty}</p>
  ) : (
    <p className="summary-figure">
      {href ? (
        <Link href={href} className="summary-figure-link">
          <MoneyText hero cents={cents} signed={signed} />
        </Link>
      ) : (
        <MoneyText hero cents={cents} signed={signed} />
      )}
      {suffix ? <span className="summary-unit">{suffix}</span> : null}
    </p>
  );

  const info = detail ? (
    <button
      type="button"
      className="summary-info"
      aria-expanded={open}
      aria-label="How this number is calculated"
      onClick={(event) => {
        event.stopPropagation();
        setOpen((value) => !value);
      }}
    >
      <Icon name="info" size={16} />
    </button>
  ) : null;

  const statusNode = status?.label ? (
    <span className={`summary-status ${status.tone}`}>
      {status.tone === "good" ? (
        <span className="summary-mark" aria-hidden>
          <Icon name="check" size={11} />
        </span>
      ) : null}
      <span>{status.label}</span>
    </span>
  ) : null;

  const Tag = onClick ? "button" : "section";

  return (
    <Tag
      className={`summary-card ${compact ? "is-compact" : ""} ${className}`.trim()}
      aria-label={onClick ? undefined : label}
      {...(onClick ? { type: "button" as const, onClick } : {})}
    >
      <div className="summary-top">
        <p className={`summary-label ${labelEmphasis ? "is-title" : ""}`}>{label}</p>
        <div className="summary-top-side">
          {statusNode}
          {footer ? null : info}
        </div>
      </div>
      {figure}
      {live ? (
        <Chart
          chartRef={chartRef}
          gradientId={gradientId}
          points={series}
          reference={reference}
          caption={caption}
          chartLabel={chartLabel}
          active={active}
          interactive={Boolean(onScrub)}
          onPick={(next) => {
            setIndex(next);
            onScrub?.(next == null ? null : series[next] ?? null);
          }}
        />
      ) : shownShares.length ? (
        <div className="summary-split">
          <div className="summary-split-bar" aria-hidden>
            {shownShares.map((share) => (
              <span key={share.label} style={{ flexGrow: share.cents, background: share.color }} />
            ))}
          </div>
          <div className="summary-split-legend">
            {shownShares.map((share) => (
              <span key={share.label}>
                {share.label} <MoneyText cents={share.cents} />
              </span>
            ))}
          </div>
        </div>
      ) : meter ? (
        <div className="summary-meter">
          <ProgressBar value={meter.value} max={meter.max} color={meter.color} />
        </div>
      ) : null}
      {note ? <div className="summary-note">{note}</div> : null}
      {footer || (detail && open) ? (
        <div className="summary-foot">
          <div className="summary-foot-main">
            {footerIcon ? <Icon name={footerIcon} size={16} /> : null}
            <div className="summary-foot-copy">{footer}</div>
            {footer ? info : null}
          </div>
          {open && detail ? <div className="summary-detail">{detail}</div> : null}
        </div>
      ) : null}
    </Tag>
  );
}

function smoothLine(coords: { x: number; y: number }[]) {
  if (!coords.length) return "";
  let d = `M${coords[0].x.toFixed(2)},${coords[0].y.toFixed(2)}`;
  for (let i = 0; i < coords.length - 1; i++) {
    const current = coords[i];
    const next = coords[i + 1];
    const mid = (current.x + next.x) / 2;
    d += ` C${mid.toFixed(2)},${current.y.toFixed(2)} ${mid.toFixed(2)},${next.y.toFixed(2)} ${next.x.toFixed(2)},${next.y.toFixed(2)}`;
  }
  return d;
}

function Chart({
  chartRef,
  gradientId,
  points,
  reference,
  caption,
  chartLabel,
  active,
  interactive,
  onPick,
}: {
  chartRef: React.RefObject<HTMLDivElement | null>;
  gradientId: string;
  points: SummaryPoint[];
  reference?: { cents: number; label: string };
  caption?: string;
  chartLabel?: string;
  active: number | null;
  interactive: boolean;
  onPick: (index: number | null) => void;
}) {
  const [box, setBox] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const node = chartRef.current;
    if (!node) return;
    const measure = () => {
      const rect = node.getBoundingClientRect();
      const w = Math.round(rect.width);
      const h = Math.round(rect.height);
      setBox((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [chartRef]);

  const values = points.map((point) => point.cents);
  if (reference) values.push(reference.cents);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const raw = max - min;
  const pad = raw === 0 ? Math.max(Math.abs(max) * 0.22, 1) : raw * 0.22;
  const lo = min - pad;
  const hi = max + pad;
  const span = hi - lo || 1;
  const width = box.w || 320;
  const height = box.h || 112;

  function xOf(i: number) {
    const inset = 10;
    if (points.length <= 1) return width / 2;
    return inset + (i / (points.length - 1)) * (width - inset * 2);
  }

  function yOf(cents: number) {
    const inset = 14;
    return inset + ((hi - cents) / span) * (height - inset * 2);
  }

  const coords = points.map((point, i) => ({ x: xOf(i), y: yOf(point.cents) }));
  const line = smoothLine(coords);
  const area = `${line} L${coords[coords.length - 1].x.toFixed(2)},${height} L${coords[0].x.toFixed(2)},${height} Z`;
  const dot = coords[active ?? coords.length - 1];
  const refY = reference ? yOf(reference.cents) : null;

  function pick(clientX: number) {
    const node = chartRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const t = rect.width ? Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)) : 0;
    onPick(Math.round(t * (points.length - 1)));
  }

  return (
    <div
      ref={chartRef}
      className={`summary-chart ${interactive ? "is-live" : ""}`}
      onPointerDown={
        interactive
          ? (event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              pick(event.clientX);
            }
          : undefined
      }
      onPointerMove={
        interactive
          ? (event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) pick(event.clientX);
            }
          : undefined
      }
      onPointerUp={interactive ? () => onPick(null) : undefined}
      onPointerCancel={interactive ? () => onPick(null) : undefined}
    >
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={chartLabel ?? "Trend"}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.34" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path className="summary-area" pathLength={1} d={area} fill={`url(#${gradientId})`} />
        {refY != null ? (
          <line
            x1="0"
            x2={width}
            y1={refY}
            y2={refY}
            stroke="var(--tertiary)"
            strokeOpacity="0.9"
            strokeWidth="1"
            strokeDasharray="4 4"
          />
        ) : null}
        <path className="summary-line" pathLength={1} d={line} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      {active != null ? <span className="summary-scrub" style={{ left: `${(coords[active].x / width) * 100}%` }} /> : null}
      {dot ? <span className="summary-dot" style={{ left: `${(dot.x / width) * 100}%`, top: `${(dot.y / height) * 100}%` }} /> : null}
      {reference && refY != null ? (
        <span className="summary-ref" style={{ top: `${(refY / height) * 100}%` }}>
          {reference.label}
        </span>
      ) : null}
      {caption ? <span className="summary-caption">{caption}</span> : null}
    </div>
  );
}
