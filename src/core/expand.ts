import type { RecipeIndex } from './index.ts';
import type { ItemId, Recipe, RecipeId, RecipeSet } from './schema.ts';
import type { Rational } from './rational.ts';

export type ExpandEdge = {
  consumer: ItemId; // このレシピで消費する側のアイテム
  ingredient: ItemId; // 消費される側のアイテム
  recipeId: RecipeId;
  qtyPerCraft: Rational; // レシピ1回あたりの消費量
};

export type ExpandedGraph = {
  target: ItemId;
  // アイテムID → 生成レシピ。終端（レシピなし、または rawItems に含まれる）は null。
  nodes: Map<ItemId, Recipe | null>;
  edges: ExpandEdge[];
};

// 目標アイテムから逆方向に深さ優先探索し、DAG を構築する（SPEC.md 6.1節）。
// この初版は「循環なし・レシピ一意・カテゴリ材料なし」を前提とする。
// 複数候補レシピやカテゴリ材料は ResolutionChoice（SPEC.md 4章、実装順序 8番目）で扱う。
export function expand(recipeSet: RecipeSet, index: RecipeIndex, target: ItemId): ExpandedGraph {
  const rawItemIds = new Set(recipeSet.rawItems);
  const nodes = new Map<ItemId, Recipe | null>();
  const edges: ExpandEdge[] = [];

  function visit(item: ItemId, onStack: Set<ItemId>): void {
    // 循環チェックは訪問済みチェックより先に行う。nodes は子を辿る前にセットするため、
    // 訪問済みチェックを先にすると現在の探索経路上での再訪問（＝循環）を見逃す。
    if (onStack.has(item)) {
      throw new Error(
        `expand: cyclic dependency detected at item "${item}" (scc.ts で扱う予定、未対応)`,
      );
    }
    if (nodes.has(item)) return; // 既に訪問済み。DAG として共有ノードを潰さない。

    const recipes = index.get(item) ?? [];
    const isTerminal = recipes.length === 0 || rawItemIds.has(item);
    if (isTerminal) {
      nodes.set(item, null);
      return;
    }
    if (recipes.length > 1) {
      throw new Error(
        `expand: item "${item}" has multiple candidate recipes; ResolutionChoice is not yet supported`,
      );
    }
    const recipe = recipes[0];
    if (recipe === undefined) throw new Error('unreachable');

    nodes.set(item, recipe);
    onStack.add(item);
    for (const input of recipe.inputs) {
      if (input.kind === 'category') {
        throw new Error(
          `expand: recipe "${recipe.id}" has a category ingredient; ResolutionChoice is not yet supported`,
        );
      }
      edges.push({
        consumer: item,
        ingredient: input.item,
        recipeId: recipe.id,
        qtyPerCraft: input.qty,
      });
      visit(input.item, onStack);
    }
    onStack.delete(item);
  }

  visit(target, new Set());
  return { target, nodes, edges };
}
