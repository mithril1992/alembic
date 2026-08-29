import { decomposeForSolving, isCyclicComponent } from '../scc.ts';
import type { ExpandedGraph } from '../expand.ts';
import { Rational } from '../rational.ts';
import type { ItemId, Recipe, RecipeId } from '../schema.ts';

export type RateSolveResult = {
  // アイテムごとの毎秒必要量
  totalDemand: Map<ItemId, Rational>;
  // レシピごとの毎秒実行回数
  craftRates: Map<RecipeId, Rational>;
};

// レートモード（Factorio）の必要量計算（SPEC.md 6.3節）。
// 強連結成分に分解し、目標側から順に処理する。循環していない成分は
// 乗除算だけで済み、循環を含む成分だけ有理数ガウス消去法で連立方程式を解く。
export function solveRate(graph: ExpandedGraph, targetQty: Rational): RateSolveResult {
  const totalDemand = new Map<ItemId, Rational>();
  const craftRates = new Map<RecipeId, Rational>();
  totalDemand.set(graph.target, targetQty);

  const remainingOutputs = buildRemainingOutputs(graph);
  const components = decomposeForSolving(graph);

  for (const component of components) {
    if (isCyclicComponent(component, graph)) {
      solveCyclicComponent(component, graph, totalDemand, craftRates);
    } else {
      solveSingletonComponent(component, graph, totalDemand, craftRates, remainingOutputs);
    }
  }

  return { totalDemand, craftRates };
}

function demandOf(totalDemand: Map<ItemId, Rational>, item: ItemId): Rational {
  return totalDemand.get(item) ?? Rational.of(0n);
}

function addDemand(totalDemand: Map<ItemId, Rational>, item: ItemId, qty: Rational): void {
  totalDemand.set(item, demandOf(totalDemand, item).add(qty));
}

function outputQtyFor(recipe: Recipe, item: ItemId): Rational {
  let total = Rational.of(0n);
  for (const output of recipe.outputs) {
    if (output.item === item) total = total.add(output.qty);
  }
  return total;
}

function inputQtyFor(recipe: Recipe, item: ItemId): Rational {
  let total = Rational.of(0n);
  for (const input of recipe.inputs) {
    if (input.kind === 'item' && input.item === item) total = total.add(input.qty);
  }
  return total;
}

function uniqueRecipes(graph: ExpandedGraph): Recipe[] {
  const seen = new Set<RecipeId>();
  const recipes: Recipe[] = [];
  for (const recipe of graph.nodes.values()) {
    if (recipe === null || seen.has(recipe.id)) continue;
    seen.add(recipe.id);
    recipes.push(recipe);
  }
  return recipes;
}

// レシピごとに「グラフ上に現れる（＝どこかで要求されている）出力アイテムの集合」を
// 事前に数えておく。副産物を持つレシピは、そのうち最後の1つが処理されるまで
// レートを確定しない（すべての出力の需要が出揃うまで待つ）ことで、
// 強連結成分分解後の処理順序に依存せず正しい結果を得る。
function buildRemainingOutputs(graph: ExpandedGraph): Map<RecipeId, Set<ItemId>> {
  const remaining = new Map<RecipeId, Set<ItemId>>();
  for (const recipe of uniqueRecipes(graph)) {
    const outputsInGraph = new Set(
      recipe.outputs.map((o) => o.item).filter((itemId) => graph.nodes.has(itemId)),
    );
    remaining.set(recipe.id, outputsInGraph);
  }
  return remaining;
}

function solveSingletonComponent(
  component: ItemId[],
  graph: ExpandedGraph,
  totalDemand: Map<ItemId, Rational>,
  craftRates: Map<RecipeId, Rational>,
  remainingOutputs: Map<RecipeId, Set<ItemId>>,
): void {
  const item = component[0];
  if (item === undefined) throw new Error('unreachable: empty component');

  const recipe = graph.nodes.get(item) ?? null;
  if (recipe === null) return; // 終端アイテム。これ以上辿らない。

  // 既に確定済み（他の出力アイテム経由、または循環成分の一部として解決済み）。
  if (craftRates.has(recipe.id)) return;

  const pending = remainingOutputs.get(recipe.id);
  if (pending === undefined) throw new Error('unreachable: recipe not registered');
  pending.delete(item);
  if (pending.size > 0) return; // 他の出力アイテムの需要がまだ確定していない

  // 副産物を持つレシピは、要求されている出力それぞれについて必要なレートのうち
  // 最大のものを採用する。他の出力は結果として供給過多（未使用の余剰）になる。
  let rate = Rational.of(0n);
  for (const output of recipe.outputs) {
    if (!graph.nodes.has(output.item)) continue;
    const candidate = demandOf(totalDemand, output.item).div(output.qty);
    if (candidate.cmp(rate) > 0) rate = candidate;
  }
  craftRates.set(recipe.id, rate);

  for (const input of recipe.inputs) {
    if (input.kind === 'category') {
      throw new Error(
        `solveRate: recipe "${recipe.id}" has a category ingredient; ResolutionChoice is not yet supported`,
      );
    }
    addDemand(totalDemand, input.item, input.qty.mul(rate));
  }
}

function solveCyclicComponent(
  component: ItemId[],
  graph: ExpandedGraph,
  totalDemand: Map<ItemId, Rational>,
  craftRates: Map<RecipeId, Rational>,
): void {
  const recipes: Recipe[] = [];
  const seenRecipeIds = new Set<RecipeId>();
  for (const item of component) {
    const recipe = graph.nodes.get(item) ?? null;
    if (recipe === null) {
      throw new Error(`solveRate: cyclic component contains a terminal item "${item}"`);
    }
    if (!seenRecipeIds.has(recipe.id)) {
      seenRecipeIds.add(recipe.id);
      recipes.push(recipe);
    }
    for (const input of recipe.inputs) {
      if (input.kind === 'category') {
        throw new Error(
          `solveRate: recipe "${recipe.id}" has a category ingredient; ResolutionChoice is not yet supported`,
        );
      }
    }
  }

  if (recipes.length !== component.length) {
    throw new Error(
      'solveRate: cyclic component does not form a square system (item count != recipe count); this shape is not yet supported',
    );
  }

  const componentItemSet = new Set(component);
  const matrix = component.map((item) =>
    recipes.map((recipe) => outputQtyFor(recipe, item).sub(inputQtyFor(recipe, item))),
  );
  const rhs = component.map((item) => demandOf(totalDemand, item));

  const solution = solveLinearSystem(matrix, rhs);

  recipes.forEach((recipe, i) => {
    const rate = solution[i];
    if (rate === undefined) throw new Error('unreachable');
    craftRates.set(recipe.id, rate);
  });

  for (const recipe of recipes) {
    const rate = craftRates.get(recipe.id);
    if (rate === undefined) throw new Error('unreachable');
    for (const input of recipe.inputs) {
      if (input.kind !== 'item') continue; // category は上の検証で既に弾かれている
      if (componentItemSet.has(input.item)) continue; // 成分内部の消費は行列側で考慮済み
      addDemand(totalDemand, input.item, input.qty.mul(rate));
    }
  }
}

// 有理数のガウス・ジョルダン消去法。A x = b を解いて x を返す。
// A は正方行列であることを要求する（成分の縮約が正方系にならない場合は呼び出し側で弾く）。
export function solveLinearSystem(a: Rational[][], b: Rational[]): Rational[] {
  const n = b.length;
  if (a.length !== n || a.some((row) => row.length !== n)) {
    throw new Error('solveLinearSystem: matrix must be square and match vector length');
  }

  const rows: Rational[][] = a.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    let pivotRow = -1;
    for (let r = col; r < n; r++) {
      if (!rows[r][col].isZero()) {
        pivotRow = r;
        break;
      }
    }
    if (pivotRow === -1) {
      throw new Error('solveLinearSystem: singular matrix (no unique solution)');
    }
    if (pivotRow !== col) {
      [rows[col], rows[pivotRow]] = [rows[pivotRow], rows[col]];
    }

    const pivot = rows[col][col];
    rows[col] = rows[col].map((cell) => cell.div(pivot));

    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = rows[r][col];
      if (factor.isZero()) continue;
      const pivotRowValues = rows[col];
      rows[r] = rows[r].map((cell, c) => cell.sub(factor.mul(pivotRowValues[c])));
    }
  }

  return rows.map((row) => row[n]);
}
