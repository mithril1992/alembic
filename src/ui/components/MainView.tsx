import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { ItemId } from '../../core/schema.ts';
import { BUNDLED_DATASETS } from '../datasets.ts';
import { useAppStore } from '../store/appStore.ts';
import { ControlPanel } from './ControlPanel.tsx';
import { GraphView } from './GraphView.tsx';

export function MainView() {
  const [searchParams, setSearchParams] = useSearchParams();
  const recipeSet = useAppStore((s) => s.recipeSet);
  const datasetId = useAppStore((s) => s.datasetId);
  const targetItem = useAppStore((s) => s.targetItem);
  const targetQtyInput = useAppStore((s) => s.targetQtyInput);
  const graph = useAppStore((s) => s.graph);
  const solveResult = useAppStore((s) => s.solveResult);
  const loadRecipeSet = useAppStore((s) => s.loadRecipeSet);
  const setTargetItem = useAppStore((s) => s.setTargetItem);
  const setTargetQtyInput = useAppStore((s) => s.setTargetQtyInput);

  // 初回マウント時のみ、URL の ds/target/qty から状態を復元する（同梱データセットのみ対応）。
  useEffect(() => {
    const ds = searchParams.get('ds');
    if (ds === null) return;
    const dataset = BUNDLED_DATASETS.find((d) => d.id === ds);
    if (dataset === undefined) return;
    void dataset.load().then((json) => {
      loadRecipeSet(dataset.id, json);
      const target = searchParams.get('target');
      if (target !== null) setTargetItem(target as ItemId);
      const qty = searchParams.get('qty');
      if (qty !== null) setTargetQtyInput(qty);
    });
    // 初回マウント時にのみ URL から復元する意図的な設計のため、依存配列は空にする。
  }, []);

  // 同梱データセット使用時のみ完全な共有リンクを発行する（SPEC.md 8.2節）。
  // ユーザー投入データは URL に載せると現実的でないサイズになるため対象外とする。
  useEffect(() => {
    if (datasetId === null) return;
    const isBundled = BUNDLED_DATASETS.some((d) => d.id === datasetId);
    if (!isBundled) {
      setSearchParams({}, { replace: true });
      return;
    }
    const next = new URLSearchParams();
    next.set('ds', datasetId);
    if (targetItem !== null) next.set('target', targetItem);
    next.set('qty', targetQtyInput);
    setSearchParams(next, { replace: true });
  }, [datasetId, targetItem, targetQtyInput, setSearchParams]);

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      <ControlPanel />
      <div style={{ flex: 1 }}>
        {recipeSet !== null && graph !== null ? (
          <GraphView recipeSet={recipeSet} graph={graph} solveResult={solveResult} />
        ) : (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              color: '#888',
            }}
          >
            データセットと目標アイテムを選択してください
          </div>
        )}
      </div>
    </div>
  );
}
