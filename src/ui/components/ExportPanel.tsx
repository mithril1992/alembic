import { toCsv, toDot, toMermaid, type DemandInfo } from '../../core/export.ts';
import { useAppStore } from '../store/appStore.ts';

function download(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function ExportPanel() {
  const recipeSet = useAppStore((s) => s.recipeSet);
  const graph = useAppStore((s) => s.graph);
  const solveResult = useAppStore((s) => s.solveResult);

  if (recipeSet === null || graph === null || graph.nodes.size === 0) {
    return null;
  }

  const demand: DemandInfo | undefined =
    solveResult === null
      ? undefined
      : solveResult.mode === 'discrete'
        ? { totalDemand: solveResult.result.totalDemand, craftCounts: solveResult.result.craftCounts }
        : { totalDemand: solveResult.result.totalDemand, craftCounts: solveResult.result.craftRates };

  return (
    <section>
      <h2 style={{ fontSize: 14, margin: '0 0 8px' }}>エクスポート</h2>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={() => download('graph.mmd', toMermaid(recipeSet, graph, demand), 'text/plain')}>
          Mermaid
        </button>
        <button type="button" onClick={() => download('graph.dot', toDot(recipeSet, graph, demand), 'text/plain')}>
          DOT
        </button>
        <button type="button" onClick={() => download('graph.csv', toCsv(recipeSet, graph, demand), 'text/csv')}>
          CSV
        </button>
      </div>
    </section>
  );
}
