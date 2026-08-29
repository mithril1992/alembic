import { create } from 'zustand';
import { buildRecipeIndex } from '../../core/index.ts';
import { expand, type ExpandedGraph } from '../../core/expand.ts';
import { Rational } from '../../core/rational.ts';
import { resolutionKeyToString, type ResolutionChoice } from '../../core/resolution.ts';
import { parseRecipeSet, type ItemId, type RecipeId, type RecipeSet } from '../../core/schema.ts';
import { solveDiscrete, type DiscreteSolveResult } from '../../core/solve/discrete.ts';
import { solveRate, type RateSolveResult } from '../../core/solve/rate.ts';

export type SolveResult =
  | { mode: 'discrete'; result: DiscreteSolveResult }
  | { mode: 'rate'; result: RateSolveResult };

type AppState = {
  recipeSet: RecipeSet | null;
  datasetId: string | null;
  targetItem: ItemId | null;
  targetQtyInput: string;
  // SPEC.md 4章: ResolutionChoice はグローバルに一意。データセットを差し替えない限り、
  // 目標アイテムを変えても選択は保持する。
  resolutionChoice: ResolutionChoice;
  graph: ExpandedGraph | null;
  solveResult: SolveResult | null;
  error: string | null;
};

type AppActions = {
  loadRecipeSet: (datasetId: string, json: unknown) => void;
  setTargetItem: (item: ItemId) => void;
  setTargetQtyInput: (input: string) => void;
  chooseRecipe: (item: ItemId, recipeId: RecipeId) => void;
  recompute: () => void;
};

// core/ から返るのは Rational や ExpandedGraph であり、UI 層の状態としてそのまま保持してよい。
// toNumber() は各コンポーネントが実際に文字列を描画する直前にのみ呼ぶ。
export const useAppStore = create<AppState & AppActions>((set, get) => ({
  recipeSet: null,
  datasetId: null,
  targetItem: null,
  targetQtyInput: '1',
  resolutionChoice: new Map(),
  graph: null,
  solveResult: null,
  error: null,

  loadRecipeSet: (datasetId, json) => {
    const parsed = parseRecipeSet(json);
    if (!parsed.success) {
      const message = parsed.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join(' / ');
      set({
        error: `データセットの検証に失敗しました: ${message}`,
        recipeSet: null,
        datasetId: null,
        targetItem: null,
        resolutionChoice: new Map(),
        graph: null,
        solveResult: null,
      });
      return;
    }
    set({
      recipeSet: parsed.data,
      datasetId,
      targetItem: null,
      resolutionChoice: new Map(),
      graph: null,
      solveResult: null,
      error: null,
    });
  },

  setTargetItem: (item) => {
    set({ targetItem: item });
    get().recompute();
  },

  setTargetQtyInput: (input) => {
    set({ targetQtyInput: input });
    get().recompute();
  },

  chooseRecipe: (item, recipeId) => {
    const next = new Map(get().resolutionChoice);
    next.set(resolutionKeyToString({ kind: 'recipe', item }), recipeId);
    set({ resolutionChoice: next });
    get().recompute();
  },

  recompute: () => {
    const { recipeSet, targetItem, targetQtyInput, resolutionChoice } = get();
    if (recipeSet === null || targetItem === null) {
      set({ graph: null, solveResult: null });
      return;
    }

    let qty: Rational;
    try {
      qty = Rational.fromDecimal(targetQtyInput);
    } catch {
      set({ error: `数量が不正です: "${targetQtyInput}"`, graph: null, solveResult: null });
      return;
    }

    try {
      const index = buildRecipeIndex(recipeSet);
      const graph = expand(recipeSet, index, targetItem, resolutionChoice);
      // 未解決のアイテムが残っている間は、部分的なグラフだけを表示し求解はしない
      // （solveDiscrete/solveRate は未解決の複数候補レシピに出会うと throw する）。
      if (graph.unresolved.size > 0) {
        set({ graph, solveResult: null, error: null });
        return;
      }
      const solveResult: SolveResult =
        recipeSet.profile.quantityMode === 'discrete'
          ? {
              mode: 'discrete',
              result: solveDiscrete(recipeSet, index, targetItem, qty, resolutionChoice),
            }
          : { mode: 'rate', result: solveRate(graph, qty) };
      set({ graph, solveResult, error: null });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      set({ error: message, graph: null, solveResult: null });
    }
  },
}));
