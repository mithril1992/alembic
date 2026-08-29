import type { ExpandedGraph } from './expand.ts';
import type { ItemId, Recipe, RecipeId, RecipeSet } from './schema.ts';

export type DemandInfo = {
  totalDemand: Map<ItemId, { toString(): string }>;
  craftCounts: Map<RecipeId, bigint>;
};

function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_]/g, '_');
}

function buildItemNameLookup(recipeSet: RecipeSet): Map<ItemId, string> {
  return new Map(recipeSet.items.map((item) => [item.id, item.name]));
}

function nodeLabelParts(
  itemId: ItemId,
  recipe: Recipe | null,
  itemNameById: Map<ItemId, string>,
  demand: DemandInfo | undefined,
): string[] {
  const name = itemNameById.get(itemId) ?? itemId;
  const parts = [name];
  const qty = demand?.totalDemand.get(itemId);
  if (qty !== undefined) parts.push(`必要量: ${qty.toString()}`);
  if (recipe !== null) {
    parts.push(`レシピ: ${recipe.name}`);
    const count = demand?.craftCounts.get(recipe.id);
    if (count !== undefined) parts.push(`実行回数: ${count.toString()}`);
  } else {
    parts.push('(終端)');
  }
  return parts;
}

// UI なしでソルバーの結果を目視確認するためのエクスポート（SPEC.md 実装順序4番目）。
// 循環辺の区別描画（9章）は scc.ts 導入後、循環を含むグラフに対応してから行う。
export function toMermaid(recipeSet: RecipeSet, graph: ExpandedGraph, demand?: DemandInfo): string {
  const itemNameById = buildItemNameLookup(recipeSet);
  const lines: string[] = ['flowchart TD'];

  for (const [itemId, recipe] of graph.nodes) {
    const nodeId = `item_${sanitizeId(itemId)}`;
    const label = nodeLabelParts(itemId, recipe, itemNameById, demand)
      .join('<br/>')
      .replace(/"/g, '&quot;');
    lines.push(`  ${nodeId}["${label}"]`);
  }

  for (const edge of graph.edges) {
    const from = `item_${sanitizeId(edge.consumer)}`;
    const to = `item_${sanitizeId(edge.ingredient)}`;
    lines.push(`  ${from} -->|${edge.qtyPerCraft.toString()}/craft| ${to}`);
  }

  return lines.join('\n');
}

export function toDot(recipeSet: RecipeSet, graph: ExpandedGraph, demand?: DemandInfo): string {
  const itemNameById = buildItemNameLookup(recipeSet);
  const lines: string[] = ['digraph RecipeGraph {'];

  for (const [itemId, recipe] of graph.nodes) {
    const nodeId = sanitizeId(itemId);
    const label = nodeLabelParts(itemId, recipe, itemNameById, demand)
      .join('\\n')
      .replace(/"/g, '\\"');
    lines.push(`  ${nodeId} [label="${label}"];`);
  }

  for (const edge of graph.edges) {
    const from = sanitizeId(edge.consumer);
    const to = sanitizeId(edge.ingredient);
    lines.push(`  ${from} -> ${to} [label="${edge.qtyPerCraft.toString()}/craft"];`);
  }

  lines.push('}');
  return lines.join('\n');
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function toCsv(recipeSet: RecipeSet, graph: ExpandedGraph, demand?: DemandInfo): string {
  const itemNameById = buildItemNameLookup(recipeSet);
  const header = ['item', 'itemName', 'recipe', 'totalDemand', 'craftCount'];
  const rows = [header.join(',')];

  for (const [itemId, recipe] of graph.nodes) {
    const name = itemNameById.get(itemId) ?? itemId;
    const qty = demand?.totalDemand.get(itemId)?.toString() ?? '';
    const count = recipe !== null ? (demand?.craftCounts.get(recipe.id)?.toString() ?? '') : '';
    const row = [itemId, name, recipe?.name ?? '', qty, count].map(csvEscape);
    rows.push(row.join(','));
  }

  return rows.join('\n');
}
