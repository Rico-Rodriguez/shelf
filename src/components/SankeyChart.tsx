"use client";

import { useMemo } from "react";
import { sankey, sankeyLinkHorizontal, type SankeyGraph } from "d3-sankey";

type Node = { id: string; color: string };
type Link = { source: string; target: string; value: number };

export function SankeyChart({
  nodes,
  links,
  width = 640,
  height = 320,
}: {
  nodes: Node[];
  links: Link[];
  width?: number;
  height?: number;
}) {
  const graph = useMemo(() => {
    if (!nodes.length || !links.length) return null;
    const layout = sankey<Node, Link>()
      .nodeId((d) => d.id)
      .nodeWidth(16)
      .nodePadding(18)
      .extent([
        [8, 8],
        [width - 8, height - 8],
      ]);
    const copy: SankeyGraph<Node, Link> = {
      nodes: nodes.map((n) => ({ ...n })),
      links: links.filter((l) => l.value > 0).map((l) => ({ ...l })),
    };
    try {
      return layout(copy);
    } catch {
      return null;
    }
  }, [nodes, links, width, height]);

  if (!graph) {
    return <p className="text-sm text-ink-soft">Not enough flow to draw a Sankey yet.</p>;
  }

  const path = sankeyLinkHorizontal();

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" shapeRendering="crispEdges">
      {graph.links.map((l, i) => (
        <path
          key={i}
          d={path(l) ?? ""}
          fill="none"
          stroke="#D97757"
          strokeOpacity={0.45}
          strokeWidth={Math.max(2, (l.width ?? 2) - 1)}
        />
      ))}
      {graph.nodes.map((n) => (
        <g key={n.id}>
          <rect
            x={n.x0}
            y={n.y0}
            width={Math.max(2, (n.x1 ?? 0) - (n.x0 ?? 0))}
            height={Math.max(2, (n.y1 ?? 0) - (n.y0 ?? 0))}
            fill={n.color}
            stroke="#2D2623"
            strokeWidth={2}
          />
          <text
            x={(n.x0 ?? 0) < width / 2 ? (n.x1 ?? 0) + 6 : (n.x0 ?? 0) - 6}
            y={((n.y0 ?? 0) + (n.y1 ?? 0)) / 2}
            textAnchor={(n.x0 ?? 0) < width / 2 ? "start" : "end"}
            dominantBaseline="middle"
            fontSize="11"
            fill="#2D2623"
          >
            {n.id}
          </text>
        </g>
      ))}
    </svg>
  );
}
