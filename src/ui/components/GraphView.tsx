import { useMemo, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent, WheelEvent as ReactWheelEvent } from 'react';
import type { ExpandedGraph } from '../../core/expand.ts';
import type { ItemId, RecipeId, RecipeSet } from '../../core/schema.ts';
import type { SolveResult } from '../store/appStore.ts';
import { computeLayout, edgeKey } from '../layout/computeLayout.ts';

type Props = {
  recipeSet: RecipeSet;
  graph: ExpandedGraph;
  solveResult: SolveResult | null;
};

type Transform = { scale: number; x: number; y: number };

export function GraphView({ recipeSet, graph, solveResult }: Props) {
  const layout = useMemo(() => computeLayout(graph), [graph]);
  const itemNameById = useMemo(
    () => new Map<ItemId, string>(recipeSet.items.map((item) => [item.id, item.name])),
    [recipeSet],
  );

  const [transform, setTransform] = useState<Transform>({ scale: 1, x: 40, y: 40 });
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(
    null,
  );

  function handleWheel(e: ReactWheelEvent<SVGSVGElement>): void {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    setTransform((t) => ({ ...t, scale: Math.min(4, Math.max(0.2, t.scale * factor)) }));
  }

  function handleMouseDown(e: ReactMouseEvent<SVGSVGElement>): void {
    setIsDragging(true);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      originX: transform.x,
      originY: transform.y,
    };
  }

  function handleMouseMove(e: ReactMouseEvent<SVGSVGElement>): void {
    const drag = dragRef.current;
    if (drag === null) return;
    setTransform((t) => ({
      ...t,
      x: drag.originX + (e.clientX - drag.startX),
      y: drag.originY + (e.clientY - drag.startY),
    }));
  }

  function handleMouseUp(): void {
    setIsDragging(false);
    dragRef.current = null;
  }

  function demandText(itemId: ItemId): string | null {
    if (solveResult === null) return null;
    const qty = solveResult.result.totalDemand.get(itemId);
    return qty === undefined ? null : `必要量: ${qty.toString()}`;
  }

  function craftText(recipeId: RecipeId): string | null {
    if (solveResult === null) return null;
    if (solveResult.mode === 'discrete') {
      const count = solveResult.result.craftCounts.get(recipeId);
      return count === undefined ? null : `実行回数: ${count.toString()}`;
    }
    const rate = solveResult.result.craftRates.get(recipeId);
    return rate === undefined ? null : `毎秒実行回数: ${rate.toString()}`;
  }

  return (
    <svg
      width="100%"
      height="100%"
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      style={{ background: '#1e1e1e', cursor: isDragging ? 'grabbing' : 'grab' }}
    >
      <defs>
        <marker
          id="arrow"
          viewBox="0 0 10 10"
          refX={9}
          refY={5}
          markerWidth={6}
          markerHeight={6}
          orient="auto-start-reverse"
        >
          <path d="M0,0 L10,5 L0,10 z" fill="#888" />
        </marker>
      </defs>
      <g transform={`translate(${transform.x},${transform.y}) scale(${transform.scale})`}>
        {graph.edges.map((edge) => {
          const points = layout.edges.get(edgeKey(edge.consumer, edge.ingredient))?.points ?? [];
          const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
          return (
            <path
              key={`${edge.consumer}=>${edge.ingredient}`}
              d={d}
              fill="none"
              stroke={edge.isCyclic ? '#e06c75' : '#888'}
              strokeDasharray={edge.isCyclic ? '6 4' : undefined}
              strokeWidth={1.5}
              markerEnd="url(#arrow)"
            />
          );
        })}
        {Array.from(graph.nodes.entries()).map(([itemId, recipe]) => {
          const pos = layout.nodes.get(itemId);
          if (pos === undefined) return null;
          const name = itemNameById.get(itemId) ?? itemId;
          const demand = demandText(itemId);
          const craft = recipe !== null ? craftText(recipe.id) : null;
          return (
            <g key={itemId} transform={`translate(${pos.x - pos.width / 2},${pos.y - pos.height / 2})`}>
              <rect
                width={pos.width}
                height={pos.height}
                rx={8}
                fill={recipe === null ? '#2d2d2d' : '#2a3f5f'}
                stroke="#555"
              />
              <text x={pos.width / 2} y={18} textAnchor="middle" fontSize={13} fill="#fff">
                {name}
              </text>
              {demand !== null && (
                <text x={pos.width / 2} y={34} textAnchor="middle" fontSize={11} fill="#ccc">
                  {demand}
                </text>
              )}
              {recipe !== null ? (
                craft !== null && (
                  <text x={pos.width / 2} y={50} textAnchor="middle" fontSize={11} fill="#ccc">
                    {craft}
                  </text>
                )
              ) : (
                <text x={pos.width / 2} y={50} textAnchor="middle" fontSize={11} fill="#999">
                  (終端)
                </text>
              )}
            </g>
          );
        })}
      </g>
    </svg>
  );
}
