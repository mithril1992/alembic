import type { RecipeIndex } from './index.ts';
import type { ItemId, Recipe, RecipeId, RecipeSet } from './schema.ts';
import type { Rational } from './rational.ts';

export type ExpandEdge = {
  consumer: ItemId; // このレシピで消費する側のアイテム
  ingredient: ItemId; // 消費される側のアイテム
  recipeId: RecipeId;
  qtyPerCraft: Rational; // レシピ1回あたりの消費量
  isCyclic: boolean; // 循環を構成する辺か（SPEC.md 6.2節、9章の描画要件）
};

export type ExpandedGraph = {
  target: ItemId;
  // アイテムID → 生成レシピ。終端（レシピなし、または rawItems に含まれる）は null。
  nodes: Map<ItemId, Recipe | null>;
  edges: ExpandEdge[];
};

type VisitState = 'visiting' | 'done';

// 目標アイテムから逆方向に深さ優先探索し、DAG（循環を含む場合は循環辺を印付けしたグラフ）を
// 構築する（SPEC.md 6.1/6.2節）。
// この初版は「レシピ一意・カテゴリ材料なし」を前提とする。複数候補レシピやカテゴリ材料は
// ResolutionChoice（SPEC.md 4章、実装順序 8番目）で扱う。
// 循環そのものは許容し、後段の scc.ts が強連結成分に分解して求解する。
export function expand(recipeSet: RecipeSet, index: RecipeIndex, target: ItemId): ExpandedGraph {
  const rawItemIds = new Set(recipeSet.rawItems);
  const nodes = new Map<ItemId, Recipe | null>();
  const edges: ExpandEdge[] = [];
  const state = new Map<ItemId, VisitState>();

  function visit(item: ItemId): void {
    // 'done' は既に展開済み（DAG として共有ノードを潰さない）。
    // 'visiting' は現在の探索経路上の祖先で、ここに到達するのは back edge（＝循環）を
    // 検出した呼び出し元が visit を呼んだ場合のみ。祖先側のフレームで処理が続くため、
    // ここでは何もせず戻る（再帰すると無限ループになる）。
    if (state.has(item)) return;

    const recipes = index.get(item) ?? [];
    const isTerminal = recipes.length === 0 || rawItemIds.has(item);
    if (isTerminal) {
      nodes.set(item, null);
      state.set(item, 'done');
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
    state.set(item, 'visiting');
    for (const input of recipe.inputs) {
      if (input.kind === 'category') {
        throw new Error(
          `expand: recipe "${recipe.id}" has a category ingredient; ResolutionChoice is not yet supported`,
        );
      }
      const isCyclic = state.get(input.item) === 'visiting';
      edges.push({
        consumer: item,
        ingredient: input.item,
        recipeId: recipe.id,
        qtyPerCraft: input.qty,
        isCyclic,
      });
      visit(input.item);
    }
    state.set(item, 'done');
  }

  visit(target);
  return { target, nodes, edges };
}
