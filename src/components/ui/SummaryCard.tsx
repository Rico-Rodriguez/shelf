"use client";

import { useId, useRef, useState } from "react";
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
  const values = points.map((point) => point.cents);
  if (reference) values.push(reference.cents);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const raw = max - min;
  const pad = raw === 0 ? Math.max(Math.abs(max) * 0.22, 1) : raw * 0.22;
  const lo = min - pad;
  const hi = max + pad;
  const span = hi - lo || 1;
  const height = 36;
  const inset = 4;

  function xOf(i: number) {
    if (points.length <= 1) return 50;
    return 2 + (i / (points.length - 1)) * 96;
  }

  function yOf(cents: number) {
    return inset + ((hi - cents) / span) * (height - inset * 2);
  }

  const coords = points.map((point, i) => ({ x: xOf(i), y: yOf(point.cents) }));
  const line = coords.map((coord, i) => `${i === 0 ? "M" : "L"}${coord.x.toFixed(2)},${coord.y.toFixed(2)}`).join(" ");
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
      <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" role="img" aria-label={chartLabel ?? "Trend"}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.34" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${gradientId})`} />
        {refY != null ? (
          <line
            x1="0"
            x2="100"
            y1={refY}
            y2={refY}
            stroke="var(--tertiary)"
            strokeOpacity="0.9"
            strokeWidth="1"
            strokeDasharray="1.5 1.4"
            vectorEffect="non-scaling-stroke"
          />
        ) : null}
        <path d={line} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      {active != null ? <span className="summary-scrub" style={{ left: `${coords[active].x}%` }} /> : null}
      {dot ? <span className="summary-dot" style={{ left: `${dot.x}%`, top: `${(dot.y / height) * 100}%` }} /> : null}
      {reference && refY != null ? (
        <span className="summary-ref" style={{ top: `${(refY / height) * 100}%` }}>
          {reference.label}
        </span>
      ) : null}
      {caption ? <span className="summary-caption">{caption}</span> : null}
    </div>
  );
}
