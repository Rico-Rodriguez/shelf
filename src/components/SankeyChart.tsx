"use client";

import { useMemo } from "react";
import { sankey, sankeyLinkHorizontal, type SankeyGraph } from "d3-sankey";
import { shelfColor } from "@/lib/palette";

type Node = { id: string; color: string };
type Link = { source: string; target: string; value: number };
type LaidNode = Node & { x0?: number; x1?: number; y0?: number; y1?: number };
type LaidLink = {
  source: LaidNode;
  target: LaidNode;
  width?: number;
  value?: number;
};

const WIDTH = 860;

export function SankeyChart({ nodes, links }: { nodes: Node[]; links: Link[] }) {
  const model = useMemo(() => layout(nodes, links), [nodes, links]);
  if (!model) return <p className="px-2 text-[15px] text-[var(--muted)]">Not enough flow yet.</p>;

  const { graph, width, height, gutterL, gutterR } = model;
  const path = sankeyLinkHorizontal();

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="block h-auto w-full"
      role="img"
      aria-label="Income flowing into shelves"
      style={{ aspectRatio: `${width} / ${height}` }}
    >
      {graph.links.map((link, i) => {
        const laid = link as unknown as LaidLink;
        return (
          <path
            key={i}
            d={path(link) ?? ""}
            fill="none"
            stroke={shelfColor(laid.target.color)}
            strokeOpacity={0.28}
            strokeWidth={Math.max(2, laid.width ?? 2)}
            strokeLinecap="round"
          />
        );
      })}
      {graph.nodes.map((node) => {
        const n = node as LaidNode;
        const x0 = n.x0 ?? 0;
        const x1 = n.x1 ?? 0;
        const y0 = n.y0 ?? 0;
        const y1 = n.y1 ?? 0;
        const midY = (y0 + y1) / 2;
        const onLeft = x0 <= gutterL + 1;
        const onRight = x1 >= width - gutterR - 1;
        const labelX = onLeft ? x0 - 10 : x1 + 10;
        return (
          <g key={n.id}>
            <rect x={x0} y={y0} width={Math.max(6, x1 - x0)} height={Math.max(3, y1 - y0)} rx={3} fill={shelfColor(n.color)} />
            <text
              x={labelX}
              y={midY}
              textAnchor={onLeft ? "end" : "start"}
              dominantBaseline="middle"
              fontSize={onRight || onLeft ? 13 : 12}
              fill="#1c1c1e"
              stroke="#fff"
              strokeWidth={4}
              paintOrder="stroke"
              style={{ fontFamily: "inherit" }}
            >
              {n.id}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function layout(nodes: Node[], links: Link[]) {
  const focused = focus(nodes, links);
  if (!focused.links.length) return null;

  const sources = new Set(focused.links.map((l) => l.source));
  const targets = new Set(focused.links.map((l) => l.target));
  const right = focused.nodes.filter((n) => targets.has(n.id) && !sources.has(n.id)).length;
  const mid = focused.nodes.filter((n) => targets.has(n.id) && sources.has(n.id)).length;
  const busiest = Math.max(right, mid, focused.nodes.length, 1);
  const gutterL = 92;
  const gutterR = 156;
  const height = Math.max(300, busiest * 36 + 24);
  const sankeyLayout = sankey<Node, Link>()
    .nodeId((d) => d.id)
    .nodeWidth(8)
    .nodePadding(16)
    .nodeSort((a, b) => (b.value ?? 0) - (a.value ?? 0))
    .extent([
      [gutterL, 16],
      [WIDTH - gutterR, height - 16],
    ]);
  const copy: SankeyGraph<Node, Link> = {
    nodes: focused.nodes.map((n) => ({ ...n, color: shelfColor(n.color) })),
    links: focused.links.map((l) => ({ ...l })),
  };
  try {
    return { graph: sankeyLayout(copy), width: WIDTH, height, gutterL, gutterR };
  } catch {
    return null;
  }
}

function focus(nodes: Node[], links: Link[]) {
  const detail = links.filter((l) => l.source !== "Income");
  const income = links.filter((l) => l.source === "Income");
  const total = detail.reduce((sum, l) => sum + l.value, 0);
  const min = Math.max(40, total * 0.02);
  let keptDetail = detail.filter((l) => l.value >= min);
  if (keptDetail.length < 4) {
    keptDetail = [...detail].sort((a, b) => b.value - a.value).slice(0, 8);
  }
  const groups = new Set(keptDetail.map((l) => l.source));
  const keptIncome = income.filter((l) => groups.size === 0 || groups.has(l.target));
  const kept = [...keptIncome, ...keptDetail];
  const ids = new Set(kept.flatMap((l) => [l.source, l.target]));
  return {
    nodes: nodes.filter((n) => ids.has(n.id)),
    links: kept,
  };
}
