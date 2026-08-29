import type { CatId, ItemId, Recipe, RecipeId } from './schema.ts';

// グラフ展開時に下流を確定できない箇所（SPEC.md 4章）。
// 「複数候補レシピのどれを使うか」と「カテゴリ材料を具体アイテムに解決する」の
// 二種類だが、いずれも「選択が保留されているノード」という同一の構造として扱う。
export type ResolutionKey =
  | { kind: 'recipe'; item: ItemId }
  | { kind: 'category'; category: CatId; atRecipe: RecipeId };

// key の文字列化 → 選ばれた ID。グローバルに一意（同じアイテムを場所によって
// 別レシピで作ることは許さない）とすることで、ノードの同一性を recipe.id で保てる。
export type ResolutionChoice = Map<string, string>;

export function resolutionKeyToString(key: ResolutionKey): string {
  switch (key.kind) {
    case 'recipe':
      return `recipe:${key.item}`;
    case 'category':
      return `category:${key.category}@${key.atRecipe}`;
    default: {
      const exhaustive: never = key;
      return exhaustive;
    }
  }
}

// 複数候補レシピから、resolutionChoice で選ばれたものを返す。
// 未選択、または選択IDが候補に見つからない（データセット変更等で古い選択が
// 無効化された）場合は undefined を返す。
export function pickRecipe(
  candidates: Recipe[],
  item: ItemId,
  resolutionChoice: ResolutionChoice,
): Recipe | undefined {
  const chosenId = resolutionChoice.get(resolutionKeyToString({ kind: 'recipe', item }));
  if (chosenId === undefined) return undefined;
  return candidates.find((r) => r.id === chosenId);
}
