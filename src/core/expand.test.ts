import { describe, expect, it } from 'vitest';
import { expand } from './expand.ts';
import { buildRecipeIndex } from './index.ts';
import { parseRecipeSet, type ItemId, type RecipeSet } from './schema.ts';

function parse(input: unknown): RecipeSet {
  const result = parseRecipeSet(input);
  if (!result.success) {
    throw new Error(`invalid fixture: ${JSON.stringify(result.error.issues)}`);
  }
  return result.data;
}

function baseProfile() {
  return {
    id: 'test',
    name: 'test',
    quantityMode: 'rate' as const,
    allowCategoryInputs: false,
    maxProductivityBonus: '0',
  };
}

describe('expand', () => {
  it('builds a linear chain down to a raw item', () => {
    const set = parse({
      schemaVersion: 1,
      profile: baseProfile(),
      items: [
        { id: 'iron-plate', name: 'iron plate', categories: [] },
        { id: 'iron-gear-wheel', name: 'iron gear wheel', categories: [] },
      ],
      recipes: [
        {
          id: 'iron-gear-wheel',
          name: 'iron gear wheel',
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

    const index = buildRecipeIndex(set);
    const graph = expand(set, index, 'iron-gear-wheel' as ItemId);

    expect(graph.nodes.get('iron-gear-wheel' as ItemId)?.id).toBe('iron-gear-wheel');
    expect(graph.nodes.get('iron-plate' as ItemId)).toBeNull();
    expect(graph.edges).toHaveLength(1);
    expect(graph.edges[0]?.consumer).toBe('iron-gear-wheel');
    expect(graph.edges[0]?.ingredient).toBe('iron-plate');
    expect(graph.edges[0]?.qtyPerCraft.toString()).toBe('2/1');
  });

  it('shares a node reached via two different paths instead of duplicating it', () => {
    // target -> a -> shared, target -> b -> shared
    const set = parse({
      schemaVersion: 1,
      profile: baseProfile(),
      items: [
        { id: 'target', name: 'target', categories: [] },
        { id: 'a', name: 'a', categories: [] },
        { id: 'b', name: 'b', categories: [] },
        { id: 'shared', name: 'shared', categories: [] },
      ],
      recipes: [
        {
          id: 'make-target',
          name: 'make target',
          outputs: [{ item: 'target', qty: '1' }],
          inputs: [
            { kind: 'item', item: 'a', qty: '1' },
            { kind: 'item', item: 'b', qty: '1' },
          ],
          time: '1',
          machineCategory: 'assembling',
          allowProductivity: true,
        },
        {
          id: 'make-a',
          name: 'make a',
          outputs: [{ item: 'a', qty: '1' }],
          inputs: [{ kind: 'item', item: 'shared', qty: '1' }],
          time: '1',
          machineCategory: 'assembling',
          allowProductivity: true,
        },
        {
          id: 'make-b',
          name: 'make b',
          outputs: [{ item: 'b', qty: '1' }],
          inputs: [{ kind: 'item', item: 'shared', qty: '1' }],
          time: '1',
          machineCategory: 'assembling',
          allowProductivity: true,
        },
      ],
      machines: [],
      rawItems: ['shared'],
    });

    const index = buildRecipeIndex(set);
    const graph = expand(set, index, 'target' as ItemId);

    expect(graph.nodes.size).toBe(4); // target, a, b, shared がそれぞれ1つずつ
    expect(graph.edges.filter((e) => e.ingredient === 'shared')).toHaveLength(2);
  });

  it('treats an item with no recipe as terminal even if not listed in rawItems', () => {
    const set = parse({
      schemaVersion: 1,
      profile: baseProfile(),
      items: [
        { id: 'target', name: 'target', categories: [] },
        { id: 'mystery', name: 'mystery', categories: [] },
      ],
      recipes: [
        {
          id: 'make-target',
          name: 'make target',
          outputs: [{ item: 'target', qty: '1' }],
          inputs: [{ kind: 'item', item: 'mystery', qty: '1' }],
          time: '1',
          machineCategory: 'assembling',
          allowProductivity: true,
        },
      ],
      machines: [],
      rawItems: [],
    });

    const index = buildRecipeIndex(set);
    const graph = expand(set, index, 'target' as ItemId);
    expect(graph.nodes.get('mystery' as ItemId)).toBeNull();
  });

  it('throws when an item has multiple candidate recipes', () => {
    const set = parse({
      schemaVersion: 1,
      profile: baseProfile(),
      items: [{ id: 'petroleum-gas', name: 'petroleum gas', categories: [] }],
      recipes: [
        {
          id: 'basic-oil-processing',
          name: 'basic oil processing',
          outputs: [{ item: 'petroleum-gas', qty: '4.5' }],
          inputs: [],
          time: '5',
          machineCategory: 'chemical',
          allowProductivity: true,
        },
        {
          id: 'advanced-oil-processing',
          name: 'advanced oil processing',
          outputs: [{ item: 'petroleum-gas', qty: '5.5' }],
          inputs: [],
          time: '5',
          machineCategory: 'chemical',
          allowProductivity: true,
        },
      ],
      machines: [],
      rawItems: [],
    });

    const index = buildRecipeIndex(set);
    expect(() => expand(set, index, 'petroleum-gas' as ItemId)).toThrow(
      /multiple candidate recipes/,
    );
  });

  it('marks the back edge of a cycle as isCyclic instead of throwing', () => {
    const set = parse({
      schemaVersion: 1,
      profile: baseProfile(),
      items: [
        { id: 'a', name: 'a', categories: [] },
        { id: 'b', name: 'b', categories: [] },
      ],
      recipes: [
        {
          id: 'a-to-b',
          name: 'a to b',
          outputs: [{ item: 'b', qty: '1' }],
          inputs: [{ kind: 'item', item: 'a', qty: '1' }],
          time: '1',
          machineCategory: 'chemical',
          allowProductivity: true,
        },
        {
          id: 'b-to-a',
          name: 'b to a',
          outputs: [{ item: 'a', qty: '1' }],
          inputs: [{ kind: 'item', item: 'b', qty: '1' }],
          time: '1',
          machineCategory: 'chemical',
          allowProductivity: true,
        },
      ],
      machines: [],
      rawItems: [],
    });

    const index = buildRecipeIndex(set);
    const graph = expand(set, index, 'a' as ItemId);

    expect(graph.nodes.size).toBe(2);
    expect(graph.edges).toHaveLength(2);

    const aToB = graph.edges.find((e) => e.consumer === 'a' && e.ingredient === 'b');
    const bToA = graph.edges.find((e) => e.consumer === 'b' && e.ingredient === 'a');
    expect(aToB?.isCyclic).toBe(false); // 探索が最初に a から b へ辿った辺
    expect(bToA?.isCyclic).toBe(true); // b から祖先 a へ戻る back edge
  });
});
