import dagre from '@dagrejs/dagre';
import type { ExpandedGraph } from '../../core/expand.ts';

export const NODE_WIDTH = 200;
export const NODE_HEIGHT = 64;

export type NodeLayout = { x: number; y: number; width: number; height: number };
export type EdgeLayout = { points: Array<{ x: number; y: number }> };

export type GraphLayout = {
  width: number;
  height: number;
  nodes: Map<string, NodeLayout>;
  edges: Map<string, EdgeLayout>;
};

export function edgeKey(consumer: string, ingredient: string): string {
  return `${consumer}=>${ingredient}`;
}

// dagre はレイアウト座標（画面上の位置）だけを扱う。ここで生成する x/y/width/height は
// SVG に描画するための単なる数値であり、core/ が管理する数量の Rational とは無関係。
// CLAUDE.md の「toNumber() は表示直前のみ」というルールに抵触しない。
export function computeLayout(graph: ExpandedGraph): GraphLayout {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'TB', nodesep: 32, ranksep: 56 });
  g.setDefaultEdgeLabel(() => ({}));

  for (const itemId of graph.nodes.keys()) {
    g.setNode(itemId, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  for (const edge of graph.edges) {
    g.setEdge(edge.consumer, edge.ingredient);
  }

  dagre.layout(g);

  const nodes = new Map<string, NodeLayout>();
  for (const itemId of graph.nodes.keys()) {
    const n = g.node(itemId);
    nodes.set(itemId, { x: n.x, y: n.y, width: n.width, height: n.height });
  }

  const edges = new Map<string, EdgeLayout>();
  for (const edge of graph.edges) {
    const e = g.edge(edge.consumer, edge.ingredient);
    edges.set(edgeKey(edge.consumer, edge.ingredient), { points: e.points });
  }

  const graphLabel = g.graph();
  return {
    width: graphLabel.width ?? 0,
    height: graphLabel.height ?? 0,
    nodes,
    edges,
  };
}
