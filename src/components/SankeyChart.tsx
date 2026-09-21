"use client";

import dynamic from "next/dynamic";

const SankeyPlot = dynamic(() => import("./SankeyPlot"), {
  ssr: false,
  loading: () => <div className="h-80" />,
});

type Node = { id: string; color: string };
type Link = { source: string; target: string; value: number };

export function SankeyChart({ nodes, links }: { nodes: Node[]; links: Link[] }) {
  return <SankeyPlot nodes={nodes} links={links} />;
}
