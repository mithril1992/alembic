import type { RecipeIndex } from '../index.ts';
import { Rational } from '../rational.ts';
import { pickRecipe, type ResolutionChoice } from '../resolution.ts';
import type { ItemId, RecipeId, RecipeSet } from '../schema.ts';

export type DiscreteSolveResult = {
  // アイテムごとの累計必要量（消費された合計。表示用の「必要量」）
  totalDemand: Map<ItemId, Rational>;
  // レシピごとの実行回数
  craftCounts: Map<RecipeId, bigint>;
  // 最終的な余り在庫
  leftover: Map<ItemId, Rational>;
};

// 離散モード（アトリエ）の必要量計算（SPEC.md 6.3節）。
// ceil(必要量 / レシピ産出量) で実行回数を求め、端数の余りを在庫として次の消費に回す。
// この初版は expand.ts と同じ前提（循環なし・カテゴリ材料なし）に立つ。
// 複数候補レシピは resolutionChoice（SPEC.md 4章）で解決する。未解決の場合は
// グラフが完全には解決されていないということであり、呼び出し側（UI）で
// 先に ResolutionChoice を確定させてから呼ぶ想定のため、ここでは throw する。
//
// 在庫を経由した逐次処理のため、同一アイテムへの複数の消費要求をどの順で処理しても
// 最終的な実行回数・余りは変わらない（後から来た要求は先に生産した余りを先に消費するだけ）。
export function solveDiscrete(
  recipeSet: RecipeSet,
  index: RecipeIndex,
  target: ItemId,
  targetQty: Rational,
  resolutionChoice: ResolutionChoice = new Map(),
): DiscreteSolveResult {
  const rawItemIds = new Set(recipeSet.rawItems);
  const totalDemand = new Map<ItemId, Rational>();
  const craftCounts = new Map<RecipeId, bigint>();
  const stock = new Map<ItemId, Rational>();

  function request(item: ItemId, qty: Rational, onStack: Set<ItemId>): void {
    totalDemand.set(item, (totalDemand.get(item) ?? Rational.of(0n)).add(qty));

    const recipes = index.get(item) ?? [];
    const isTerminal = recipes.length === 0 || rawItemIds.has(item);
    if (isTerminal) {
      return;
    }

    let recipe;
    if (recipes.length === 1) {
      recipe = recipes[0];
      if (recipe === undefined) throw new Error('unreachable');
    } else {
      const chosen = pickRecipe(recipes, item, resolutionChoice);
      if (chosen === undefined) {
        throw new Error(
          `solveDiscrete: item "${item}" has multiple candidate recipes and no ResolutionChoice was provided`,
        );
      }
      recipe = chosen;
    }

    const currentStock = stock.get(item) ?? Rational.of(0n);
    if (currentStock.cmp(qty) >= 0) {
      stock.set(item, currentStock.sub(qty));
      return;
    }

    if (onStack.has(item)) {
      throw new Error(
        `solveDiscrete: cyclic dependency detected at item "${item}" (scc.ts で扱う予定、未対応)`,
      );
    }

    const outputEntry = recipe.outputs.find((o) => o.item === item);
    if (outputEntry === undefined) throw new Error('unreachable: recipe indexed by its own output');

    const shortfall = qty.sub(currentStock);
    const times = shortfall.div(outputEntry.qty).ceilToBigInt();
    craftCounts.set(recipe.id, (craftCounts.get(recipe.id) ?? 0n) + times);
    const timesR = Rational.of(times);

    onStack.add(item);
    for (const input of recipe.inputs) {
      if (input.kind === 'category') {
        throw new Error(
          `solveDiscrete: recipe "${recipe.id}" has a category ingredient; ResolutionChoice is not yet supported`,
        );
      }
      request(input.item, input.qty.mul(timesR), onStack);
    }
    onStack.delete(item);

    for (const output of recipe.outputs) {
      const produced = output.qty.mul(timesR);
      const before = stock.get(output.item) ?? Rational.of(0n);
      stock.set(output.item, before.add(produced));
    }

    const after = stock.get(item) ?? Rational.of(0n);
    stock.set(item, after.sub(qty));
  }

  request(target, targetQty, new Set());

  return { totalDemand, craftCounts, leftover: stock };
}
