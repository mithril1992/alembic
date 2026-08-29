import { describe, expect, it } from 'vitest';
import { buildRecipeIndex } from '../index.ts';
import { Rational } from '../rational.ts';
import { parseRecipeSet, type ItemId, type RecipeSet } from '../schema.ts';
import { solveDiscrete } from './discrete.ts';

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
    quantityMode: 'discrete' as const,
    allowCategoryInputs: false,
  };
}

describe('solveDiscrete', () => {
  it('computes craft count and leftover for an exact multiple', () => {
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

    const result = solveDiscrete(set, index, 'iron-gear-wheel' as ItemId, Rational.of(5n));

    expect(result.craftCounts.get('iron-gear-wheel' as never)).toBe(5n);
    expect(result.totalDemand.get('iron-plate' as ItemId)?.toString()).toBe('10/1');
    expect(result.leftover.get('iron-gear-wheel' as ItemId)?.isZero()).toBe(true);
  });

  it('rounds up and carries the remainder as leftover stock', () => {
    const set = parse({
      schemaVersion: 1,
      profile: baseProfile(),
      items: [
        { id: 'wood', name: 'wood', categories: [] },
        { id: 'plank', name: 'plank', categories: [] },
      ],
      recipes: [
        {
          id: 'plank',
          name: 'plank',
          outputs: [{ item: 'plank', qty: '3' }],
          inputs: [{ kind: 'item', item: 'wood', qty: '1' }],
          time: '1',
          machineCategory: 'sawmill',
          allowProductivity: false,
        },
      ],
      machines: [],
      rawItems: ['wood'],
    });
    const index = buildRecipeIndex(set);

    const result = solveDiscrete(set, index, 'plank' as ItemId, Rational.of(7n));

    expect(result.craftCounts.get('plank' as never)).toBe(3n); // ceil(7/3) = 3, produces 9
    expect(result.leftover.get('plank' as ItemId)?.toString()).toBe('2/1'); // 9 - 7
    expect(result.totalDemand.get('wood' as ItemId)?.toString()).toBe('3/1');
  });

  it('accumulates demand for an item shared by two branches (diamond)', () => {
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

    const result = solveDiscrete(set, index, 'target' as ItemId, Rational.of(1n));

    expect(result.totalDemand.get('shared' as ItemId)?.toString()).toBe('2/1');
    expect(result.craftCounts.get('make-a' as never)).toBe(1n);
    expect(result.craftCounts.get('make-b' as never)).toBe(1n);
  });

  it('credits a byproduct toward a later request for the same item', () => {
    const set = parse({
      schemaVersion: 1,
      profile: { ...baseProfile(), quantityMode: 'rate' as const },
      items: [
        { id: 'crude-oil', name: 'crude oil', categories: [] },
        { id: 'heavy-oil', name: 'heavy oil', categories: [] },
        { id: 'light-oil', name: 'light oil', categories: [] },
        { id: 'product', name: 'product', categories: [] },
      ],
      recipes: [
        {
          id: 'oil-processing',
          name: 'oil processing',
          outputs: [
            { item: 'heavy-oil', qty: '1' },
            { item: 'light-oil', qty: '3' },
          ],
          inputs: [{ kind: 'item', item: 'crude-oil', qty: '10' }],
          time: '5',
          machineCategory: 'chemical',
          allowProductivity: true,
        },
        {
          id: 'make-product',
          name: 'make product',
          outputs: [{ item: 'product', qty: '1' }],
          // heavy-oil を先に、light-oil を後から要求する順序にする。
          inputs: [
            { kind: 'item', item: 'heavy-oil', qty: '2' },
            { kind: 'item', item: 'light-oil', qty: '4' },
          ],
          time: '1',
          machineCategory: 'assembling',
          allowProductivity: true,
        },
      ],
      machines: [],
      rawItems: ['crude-oil'],
    });
    const index = buildRecipeIndex(set);

    const result = solveDiscrete(set, index, 'product' as ItemId, Rational.of(1n));

    // heavy-oil を 2 要求する時点で oil-processing が 2 回実行され、
    // 副産物として light-oil が 6 生まれる。light-oil の要求は 4 なので
    // 副産物だけで賄え、oil-processing の追加実行は発生しない。
    expect(result.craftCounts.get('oil-processing' as never)).toBe(2n);
    expect(result.craftCounts.get('make-product' as never)).toBe(1n);
    expect(result.leftover.get('light-oil' as ItemId)?.toString()).toBe('2/1');
    expect(result.leftover.get('heavy-oil' as ItemId)?.isZero()).toBe(true);
    expect(result.totalDemand.get('crude-oil' as ItemId)?.toString()).toBe('20/1');
  });
});
