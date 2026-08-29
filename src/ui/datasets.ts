// 同梱データセットは動的 import() で遅延ロードする（SPEC.md 2章）。
// Factorio の全レシピは数百 KB を超えうるため、初期バンドルに含めない。
export type BundledDataset = {
  id: string;
  name: string;
  load: () => Promise<unknown>;
};

export const BUNDLED_DATASETS: BundledDataset[] = [
  {
    id: 'sample-factorio',
    name: 'サンプル（デモ用）',
    load: async () => (await import('../data/sample-factorio.json')).default,
  },
  {
    id: 'sample-multi-recipe',
    name: 'サンプル：複数候補レシピ（デモ用）',
    load: async () => (await import('../data/sample-multi-recipe.json')).default,
  },
];
