import { describe, expect, it } from 'vitest';
import { expand } from './expand.ts';
import { buildRecipeIndex } from './index.ts';
import { parseRecipeSet, type ItemId, type RecipeSet } from './schema.ts';
import { decomposeForSolving, isCyclicComponent } from './scc.ts';

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
  };
}

describe('decomposeForSolving', () => {
  it('returns singleton components in target-first topological order for a linear chain', () => {
    const set = parse({
      schemaVersion: 1,
      profile: baseProfile(),
      items: [
        { id: 'a', name: 'a', categories: [] },
        { id: 'b', name: 'b', categories: [] },
        { id: 'c', name: 'c', categories: [] },
      ],
      recipes: [
        {
          id: 'make-a',
          name: 'make a',
          outputs: [{ item: 'a', qty: '1' }],
          inputs: [{ kind: 'item', item: 'b', qty: '1' }],
          time: '1',
          machineCategory: 'assembling',
          allowProductivity: true,
        },
        {
          id: 'make-b',
          name: 'make b',
          outputs: [{ item: 'b', qty: '1' }],
          inputs: [{ kind: 'item', item: 'c', qty: '1' }],
          time: '1',
          machineCategory: 'assembling',
          allowProductivity: true,
        },
      ],
      machines: [],
      rawItems: ['c'],
    });
    const index = buildRecipeIndex(set);
    const graph = expand(set, index, 'a' as ItemId);

    const components = decomposeForSolving(graph);

    expect(components).toEqual([['a'], ['b'], ['c']]);
    for (const component of components) {
      expect(isCyclicComponent(component, graph)).toBe(false);
    }
  });

  it('places a two-item cycle after the target that depends on it', () => {
    const set = parse({
      schemaVersion: 1,
      profile: baseProfile(),
      items: [
        { id: 'target', name: 'target', categories: [] },
        { id: 'a', name: 'a', categories: [] },
        { id: 'b', name: 'b', categories: [] },
      ],
      recipes: [
        {
          id: 'make-target',
          name: 'make target',
          outputs: [{ item: 'target', qty: '1' }],
          inputs: [{ kind: 'item', item: 'a', qty: '1' }],
          time: '1',
          machineCategory: 'assembling',
          allowProductivity: true,
        },
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
    const graph = expand(set, index, 'target' as ItemId);

    const components = decomposeForSolving(graph);

    expect(components).toHaveLength(2);
    expect(components[0]).toEqual(['target']);
    expect(new Set(components[1])).toEqual(new Set(['a', 'b']));
    expect(isCyclicComponent(components[0] ?? [], graph)).toBe(false);
    expect(isCyclicComponent(components[1] ?? [], graph)).toBe(true);
  });

  it('treats a diamond (no cycle) as all-singleton components with the shared item last', () => {
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

    const components = decomposeForSolving(graph);

    expect(components).toHaveLength(4);
    expect(components.every((c) => c.length === 1)).toBe(true);
    expect(components[0]).toEqual(['target']);
    expect(components[components.length - 1]).toEqual(['shared']);
    for (const component of components) {
      expect(isCyclicComponent(component, graph)).toBe(false);
    }
  });
});
