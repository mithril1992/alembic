import type { ItemId, RecipeId } from '../../core/schema.ts';
import { useAppStore } from '../store/appStore.ts';

// SPEC.md 4章: 複数候補レシピがあり未解決のアイテムを一覧し、選択させる。
// 選ぶと ResolutionChoice に記録され、再度 expand が走って下流が生える。
export function ResolutionPanel() {
  const recipeSet = useAppStore((s) => s.recipeSet);
  const graph = useAppStore((s) => s.graph);
  const chooseRecipe = useAppStore((s) => s.chooseRecipe);

  if (recipeSet === null || graph === null || graph.unresolved.size === 0) {
    return null;
  }

  const itemNameById = new Map(recipeSet.items.map((item) => [item.id, item.name]));

  return (
    <section>
      <h2 style={{ fontSize: 14, margin: '0 0 8px' }}>未解決の選択</h2>
      <p style={{ fontSize: 12, color: '#ccc', margin: '0 0 8px' }}>
        複数のレシピで作れるアイテムがあります。使うレシピを選んでください。
      </p>
      {Array.from(graph.unresolved.entries()).map(([item, candidates]) => (
        <div key={item} style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 13 }}>{itemNameById.get(item) ?? item}</div>
          <select
            defaultValue=""
            onChange={(e) => {
              const recipeId = e.target.value as RecipeId;
              if (recipeId === '') return;
              chooseRecipe(item as ItemId, recipeId);
            }}
          >
            <option value="" disabled>
              レシピを選択
            </option>
            {candidates.map((recipe) => (
              <option key={recipe.id} value={recipe.id}>
                {recipe.name}
              </option>
            ))}
          </select>
        </div>
      ))}
    </section>
  );
}
