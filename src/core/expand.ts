import type { RecipeIndex } from './index.ts';
import { pickRecipe, type ResolutionChoice } from './resolution.ts';
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
  // 未解決のアイテム（下記 unresolved）はここには含まれない。
  nodes: Map<ItemId, Recipe | null>;
  edges: ExpandEdge[];
  // 複数候補レシピがあり、まだ resolutionChoice で解決されていないアイテムと候補一覧
  // （SPEC.md 4章）。UI はここを見て選択肢を提示し、選ばれたら再度 expand を呼び直すことで
  // 下流が生える。
  unresolved: Map<ItemId, Recipe[]>;
};

type VisitState = 'visiting' | 'done';

// 目標アイテムから逆方向に深さ優先探索し、グラフ（循環を含む場合は循環辺を印付けした
// もの）を構築する（SPEC.md 6.1/6.2節）。
// 複数候補レシピは resolutionChoice（SPEC.md 4章）で解決する。未解決の場合はそのアイテムを
// unresolved に記録し、そこで探索を止める。カテゴリ材料の解決は未対応（呼ぶとthrowする）。
export function expand(
  recipeSet: RecipeSet,
  index: RecipeIndex,
  target: ItemId,
  resolutionChoice: ResolutionChoice = new Map(),
): ExpandedGraph {
  const rawItemIds = new Set(recipeSet.rawItems);
  const nodes = new Map<ItemId, Recipe | null>();
  const edges: ExpandEdge[] = [];
  const unresolved = new Map<ItemId, Recipe[]>();
  const state = new Map<ItemId, VisitState>();

  function visit(item: ItemId): void {
    // 'done' は既に展開済み（DAG として共有ノードを潰さない）、または未解決として
    // 記録済み。'visiting' は現在の探索経路上の祖先で、back edge（＝循環）検出時に
    // 呼ばれるが、祖先側のフレームで処理が続くためここでは何もせず戻る。
    if (state.has(item)) return;

    const recipes = index.get(item) ?? [];
    const isTerminal = recipes.length === 0 || rawItemIds.has(item);
    if (isTerminal) {
      nodes.set(item, null);
      state.set(item, 'done');
      return;
    }

    let recipe: Recipe;
    if (recipes.length === 1) {
      const only = recipes[0];
      if (only === undefined) throw new Error('unreachable');
      recipe = only;
    } else {
      const chosen = pickRecipe(recipes, item, resolutionChoice);
      if (chosen === undefined) {
        unresolved.set(item, recipes);
        state.set(item, 'done'); // これ以上辿らない。選択後、再度 expand を呼び直す。
        return;
      }
      recipe = chosen;
    }

    nodes.set(item, recipe);
    state.set(item, 'visiting');
    for (const input of recipe.inputs) {
      if (input.kind === 'category') {
        throw new Error(
          `expand: recipe "${recipe.id}" has a category ingredient; category ResolutionChoice UI is not yet implemented`,
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
  return { target, nodes, edges, unresolved };
}
