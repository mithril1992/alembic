import { describe, expect, it } from 'vitest';
import { expand } from './expand.ts';
import { toCsv, toDot, toMermaid } from './export.ts';
import { buildRecipeIndex } from './index.ts';
import { parseRecipeSet, type ItemId, type RecipeSet } from './schema.ts';
import { solveDiscrete } from './solve/discrete.ts';
import { Rational } from './rational.ts';

function parse(input: unknown): RecipeSet {
  const result = parseRecipeSet(input);
  if (!result.success) {
    throw new Error(`invalid fixture: ${JSON.stringify(result.error.issues)}`);
  }
  return result.data;
}

function buildFixture(): RecipeSet {
  return parse({
    schemaVersion: 1,
    profile: {
      id: 'test',
      name: 'test',
      quantityMode: 'discrete',
      allowCategoryInputs: false,
    },
    items: [
      { id: 'iron-plate', name: '鉄板', categories: [] },
      { id: 'iron-gear-wheel', name: '鉄の歯車', categories: [] },
    ],
    recipes: [
      {
        id: 'iron-gear-wheel',
        name: '鉄の歯車',
        outputs: [{ item: 'iron-gear-wheel', qty: '1' }],
        inputs: [{ kind: 'item', item: 'iron-plate', qty: '2' }],
        time: '0.5',
        machineCategory: 'assembling',
        allowProductivity: true,
      },
    ],
    machines: [],
    rawItems: ['iron-plate'],
  });
}

describe('toMermaid', () => {
  it('renders nodes and edges with quantities', () => {
    const set = buildFixture();
    const index = buildRecipeIndex(set);
    const graph = expand(set, index, 'iron-gear-wheel' as ItemId);
    const demand = solveDiscrete(set, index, 'iron-gear-wheel' as ItemId, Rational.of(5n));

    const mermaid = toMermaid(set, graph, demand);

    expect(mermaid).toContain('flowchart TD');
    expect(mermaid).toContain('鉄の歯車');
    expect(mermaid).toContain('鉄板');
    expect(mermaid).toContain('必要量: 5/1');
    expect(mermaid).toContain('必要量: 10/1');
    expect(mermaid).toContain('実行回数: 5');
    expect(mermaid).toContain('item_iron_gear_wheel -->|2/1/craft| item_iron_plate');
  });

  it('renders without demand info', () => {
    const set = buildFixture();
    const index = buildRecipeIndex(set);
    const graph = expand(set, index, 'iron-gear-wheel' as ItemId);

    const mermaid = toMermaid(set, graph);
    expect(mermaid).toContain('(終端)');
    expect(mermaid).not.toContain('必要量');
  });
});

describe('toDot', () => {
  it('renders a valid-looking DOT graph', () => {
    const set = buildFixture();
    const index = buildRecipeIndex(set);
    const graph = expand(set, index, 'iron-gear-wheel' as ItemId);

    const dot = toDot(set, graph);
    expect(dot.startsWith('digraph RecipeGraph {')).toBe(true);
    expect(dot).toContain('iron_gear_wheel -> iron_plate');
    expect(dot.trim().endsWith('}')).toBe(true);
  });
});

describe('toCsv', () => {
  it('renders one row per node', () => {
    const set = buildFixture();
    const index = buildRecipeIndex(set);
    const graph = expand(set, index, 'iron-gear-wheel' as ItemId);
    const demand = solveDiscrete(set, index, 'iron-gear-wheel' as ItemId, Rational.of(5n));

    const csv = toCsv(set, graph, demand);
    const lines = csv.split('\n');
    expect(lines[0]).toBe('item,itemName,recipe,totalDemand,craftCount');
    expect(lines).toHaveLength(3); // header + 2 nodes
    expect(csv).toContain('iron-gear-wheel,鉄の歯車,鉄の歯車,5/1,5');
    expect(csv).toContain('iron-plate,鉄板,,10/1,');
  });
});
