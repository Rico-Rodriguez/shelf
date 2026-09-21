"use client";

import { useMemo } from "react";
import ReactEChartsCore from "echarts-for-react/lib/core";
import * as echarts from "echarts/core";
import { SankeyChart } from "echarts/charts";
import { TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { shelfColor } from "@/lib/palette";

echarts.use([SankeyChart, TooltipComponent, CanvasRenderer]);

type Node = { id: string; color: string };
type Link = { source: string; target: string; value: number };

export default function SankeyPlot({ nodes, links }: { nodes: Node[]; links: Link[] }) {
  const model = useMemo(() => build(nodes, links), [nodes, links]);
  if (!model) return <p className="px-3 py-6 text-[15px] text-[var(--muted)]">Not enough flow yet.</p>;

  return (
    <ReactEChartsCore
      echarts={echarts}
      option={model.option}
      style={{ height: model.height, width: "100%" }}
      opts={{ renderer: "canvas" }}
      notMerge
    />
  );
}

function build(nodes: Node[], links: Link[]) {
  const kept = links.filter((link) => link.value > 0 && link.source !== link.target);
  if (!kept.length) return null;
  const ids = new Set(kept.flatMap((link) => [link.source, link.target]));
  const data = nodes
    .filter((node) => ids.has(node.id))
    .map((node) => ({
      name: node.id,
      itemStyle: { color: shelfColor(node.color), borderWidth: 0 },
    }));
  const names = new Set(data.map((node) => node.name));
  const seriesLinks = kept
    .filter((link) => names.has(link.source) && names.has(link.target))
    .map((link) => ({ source: link.source, target: link.target, value: link.value }));
  if (!seriesLinks.length) return null;

  const targets = new Set(seriesLinks.map((link) => link.target));
  const sources = new Set(seriesLinks.map((link) => link.source));
  const leaves = [...targets].filter((name) => !sources.has(name));
  const longest = leaves.reduce((max, name) => Math.max(max, name.length), 8);
  const rightPad = Math.min(240, Math.max(148, longest * 8 + 28));
  const height = Math.max(420, Math.max(leaves.length, 1) * 34 + 48);

  const option = {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "item",
      backgroundColor: "#fff",
      borderWidth: 0,
      padding: [8, 12],
      textStyle: { color: "#1c1c1e", fontSize: 13 },
      extraCssText: "border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,0.12);",
      formatter: (item: { dataType?: string; name?: string; data?: { source?: string; target?: string; value?: number } }) => {
        const value = item.data?.value;
        const money = typeof value === "number" ? usd(value) : "";
        if (item.dataType === "edge") return `${item.data?.source} → ${item.data?.target}<br/><b>${money}</b>`;
        return money ? `${item.name}<br/><b>${money}</b>` : (item.name ?? "");
      },
    },
    series: [
      {
        type: "sankey",
        left: 12,
        right: rightPad,
        top: 12,
        bottom: 12,
        nodeWidth: 14,
        nodeGap: 16,
        nodeAlign: "justify",
        layoutIterations: 48,
        draggable: false,
        emphasis: { focus: "adjacency" },
        label: {
          color: "#1c1c1e",
          fontSize: 13,
          fontWeight: 500,
          fontFamily: "inherit",
          overflow: "none",
        },
        lineStyle: { color: "gradient", curveness: 0.5, opacity: 0.4 },
        itemStyle: { borderWidth: 0 },
        data,
        links: seriesLinks,
      },
    ],
  };

  return { option, height };
}

function usd(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}
