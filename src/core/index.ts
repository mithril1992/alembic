import type { CatId, ItemId, Recipe, RecipeId, RecipeSet } from './schema.ts';

// アイテムID → そのアイテムを生成できるレシピ群。
// 1アイテムに対して生成レシピは複数ありうる（石油処理、炉種別）ため Map<ItemId, Recipe> にしない。
export type RecipeIndex = Map<ItemId, Recipe[]>;

export function buildRecipeIndex(recipeSet: RecipeSet): RecipeIndex {
  const index: RecipeIndex = new Map();
  for (const recipe of recipeSet.recipes) {
    for (const output of recipe.outputs) {
      const list = index.get(output.item);
      if (list) {
        list.push(recipe);
      } else {
        index.set(output.item, [recipe]);
      }
    }
  }
  return index;
}

// 8.1節の警告: どのレシピからも作られず rawItems にも含まれないアイテム
export function findOrphanItems(recipeSet: RecipeSet, index: RecipeIndex): ItemId[] {
  const rawItemIds = new Set(recipeSet.rawItems);
  return recipeSet.items
    .map((item) => item.id)
    .filter((id) => !index.has(id) && !rawItemIds.has(id));
}

function buildCategoriesByItem(recipeSet: RecipeSet): Map<ItemId, Set<CatId>> {
  return new Map(recipeSet.items.map((item) => [item.id, new Set(item.categories)]));
}

// 8.1節の警告: どこからも参照されないレシピ（出力がどのレシピの入力にもならない）。
// この関数は「目標アイテム」を知らないため、実際に選ばれた目標製品のレシピも
// 構造上は必ずここに含まれる。呼び出し側（UI）で選択中の目標アイテムを除外して表示する想定。
export function findOrphanRecipes(recipeSet: RecipeSet): RecipeId[] {
  const categoriesByItem = buildCategoriesByItem(recipeSet);
  const consumedItemIds = new Set<ItemId>();

  for (const recipe of recipeSet.recipes) {
    for (const input of recipe.inputs) {
      if (input.kind === 'item') {
        consumedItemIds.add(input.item);
        continue;
      }
      for (const [itemId, categories] of categoriesByItem) {
        if (categories.has(input.category)) {
          consumedItemIds.add(itemId);
        }
      }
    }
  }

  return recipeSet.recipes
    .filter((recipe) => recipe.outputs.every((output) => !consumedItemIds.has(output.item)))
    .map((recipe) => recipe.id);
}

function buildRecipeGraph(recipeSet: RecipeSet): Map<RecipeId, Recipe[]> {
  const categoriesByItem = buildCategoriesByItem(recipeSet);
  const graph = new Map<RecipeId, Recipe[]>();

  for (const producer of recipeSet.recipes) {
    const successors: Recipe[] = [];
    for (const consumer of recipeSet.recipes) {
      const consumes = producer.outputs.some((output) =>
        consumer.inputs.some((input) =>
          input.kind === 'item'
            ? input.item === output.item
            : (categoriesByItem.get(output.item)?.has(input.category) ?? false),
        ),
      );
      if (consumes) successors.push(consumer);
    }
    graph.set(producer.id, successors);
  }

  return graph;
}

// 8.1節の警告: 循環の検出。
// レシピを頂点、「あるレシピの出力が別レシピの入力になる」を辺とする有向グラフ上で、
// 自分自身に戻れるレシピを検出する簡易版。強連結成分への分解（求解用）は scc.ts の責務。
export function findCyclicRecipeIds(recipeSet: RecipeSet): Set<RecipeId> {
  const graph = buildRecipeGraph(recipeSet);
  const cyclic = new Set<RecipeId>();

  for (const start of recipeSet.recipes) {
    const visited = new Set<RecipeId>([start.id]);
    const stack = [...(graph.get(start.id) ?? [])];
    while (stack.length > 0) {
      const current = stack.pop();
      if (current === undefined) break;
      if (current.id === start.id) {
        cyclic.add(start.id);
        continue;
      }
      if (visited.has(current.id)) continue;
      visited.add(current.id);
      stack.push(...(graph.get(current.id) ?? []));
    }
  }

  return cyclic;
}
