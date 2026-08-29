import type { ExpandedGraph } from './expand.ts';
import type { ItemId } from './schema.ts';

export type Component = ItemId[];

// Tarjan のアルゴリズムで強連結成分に分解する。
// graph.edges は consumer → ingredient（依存元→依存先）の辺なので、
// DFS の post-order でコンポーネントが確定する順序は「依存先（原材料側）が先、
// 依存元（目標側）が後」になる。求解時は目標側から処理したいため、
// 呼び出し側の decomposeForSolving() で順序を反転する。
function findStronglyConnectedComponentsRaw(graph: ExpandedGraph): Component[] {
  const adjacency = new Map<ItemId, ItemId[]>();
  for (const edge of graph.edges) {
    const list = adjacency.get(edge.consumer);
    if (list) {
      list.push(edge.ingredient);
    } else {
      adjacency.set(edge.consumer, [edge.ingredient]);
    }
  }

  let nextIndex = 0;
  const indices = new Map<ItemId, number>();
  const lowlink = new Map<ItemId, number>();
  const onStack = new Set<ItemId>();
  const stack: ItemId[] = [];
  const components: Component[] = [];

  function strongConnect(v: ItemId): void {
    const vIndex = nextIndex;
    nextIndex += 1;
    indices.set(v, vIndex);
    lowlink.set(v, vIndex);
    stack.push(v);
    onStack.add(v);

    for (const w of adjacency.get(v) ?? []) {
      if (!indices.has(w)) {
        strongConnect(w);
        const wLow = lowlink.get(w);
        if (wLow !== undefined) {
          lowlink.set(v, Math.min(lowlink.get(v) ?? vIndex, wLow));
        }
      } else if (onStack.has(w)) {
        const wIndex = indices.get(w);
        if (wIndex !== undefined) {
          lowlink.set(v, Math.min(lowlink.get(v) ?? vIndex, wIndex));
        }
      }
    }

    if (lowlink.get(v) === indices.get(v)) {
      const component: Component = [];
      let w: ItemId | undefined;
      do {
        w = stack.pop();
        if (w === undefined) throw new Error('unreachable: Tarjan stack underflow');
        onStack.delete(w);
        component.push(w);
      } while (w !== v);
      components.push(component);
    }
  }

  for (const item of graph.nodes.keys()) {
    if (!indices.has(item)) {
      strongConnect(item);
    }
  }

  return components;
}

// 強連結成分を、求解にそのまま使える順序（目標アイテム側が先、原材料側が後）で返す。
// 循環していない成分は要素数1（自己ループがない限り）で、単純な乗除算だけで処理できる。
// 要素数が2以上、または自己ループを持つ成分は連立方程式（solve/rate.ts）で解く必要がある。
export function decomposeForSolving(graph: ExpandedGraph): Component[] {
  return findStronglyConnectedComponentsRaw(graph).reverse();
}

export function isCyclicComponent(component: Component, graph: ExpandedGraph): boolean {
  if (component.length > 1) return true;
  const [only] = component;
  if (only === undefined) return false;
  return graph.edges.some(
    (edge) => edge.consumer === only && edge.ingredient === only && edge.isCyclic,
  );
}
