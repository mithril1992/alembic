import { create } from 'zustand';
import { buildRecipeIndex } from '../../core/index.ts';
import { expand, type ExpandedGraph } from '../../core/expand.ts';
import { Rational } from '../../core/rational.ts';
import { parseRecipeSet, type ItemId, type RecipeSet } from '../../core/schema.ts';
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
  graph: ExpandedGraph | null;
  solveResult: SolveResult | null;
  error: string | null;
};

type AppActions = {
  loadRecipeSet: (datasetId: string, json: unknown) => void;
  setTargetItem: (item: ItemId) => void;
  setTargetQtyInput: (input: string) => void;
  recompute: () => void;
};

// core/ から返るのは Rational や ExpandedGraph であり、UI 層の状態としてそのまま保持してよい。
// toNumber() は各コンポーネントが実際に文字列を描画する直前にのみ呼ぶ。
export const useAppStore = create<AppState & AppActions>((set, get) => ({
  recipeSet: null,
  datasetId: null,
  targetItem: null,
  targetQtyInput: '1',
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
        graph: null,
        solveResult: null,
      });
      return;
    }
    set({
      recipeSet: parsed.data,
      datasetId,
      targetItem: null,
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

  recompute: () => {
    const { recipeSet, targetItem, targetQtyInput } = get();
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
      const graph = expand(recipeSet, index, targetItem);
      const solveResult: SolveResult =
        recipeSet.profile.quantityMode === 'discrete'
          ? { mode: 'discrete', result: solveDiscrete(recipeSet, index, targetItem, qty) }
          : { mode: 'rate', result: solveRate(graph, qty) };
      set({ graph, solveResult, error: null });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      set({ error: message, graph: null, solveResult: null });
    }
  },
}));
