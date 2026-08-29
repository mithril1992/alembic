import { describe, expect, it } from 'vitest';
import { expand } from '../expand.ts';
import { buildRecipeIndex } from '../index.ts';
import { Rational } from '../rational.ts';
import { parseRecipeSet, type ItemId, type RecipeSet } from '../schema.ts';
import { solveLinearSystem, solveRate } from './rate.ts';

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

describe('solveLinearSystem', () => {
  it('solves a simple 2x2 system exactly', () => {
    // 3x - y = 4, -x + y = 0  =>  x = 2, y = 2
    const a = [
      [Rational.of(3n), Rational.of(-1n)],
      [Rational.of(-1n), Rational.of(1n)],
    ];
    const b = [Rational.of(4n), Rational.of(0n)];

    const x = solveLinearSystem(a, b);

    expect(x[0]?.toString()).toBe('2/1');
    expect(x[1]?.toString()).toBe('2/1');
  });

  it('throws on a singular matrix', () => {
    const a = [
      [Rational.of(1n), Rational.of(2n)],
      [Rational.of(2n), Rational.of(4n)],
    ];
    const b = [Rational.of(1n), Rational.of(2n)];
    expect(() => solveLinearSystem(a, b)).toThrow(/singular/);
  });
});

describe('solveRate', () => {
  it('computes exact (non-integer) craft rates for a linear chain', () => {
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

    const result = solveRate(graph, Rational.of(1n, 3n));

    expect(result.craftRates.get('iron-gear-wheel' as never)?.toString()).toBe('1/3');
    expect(result.totalDemand.get('iron-plate' as ItemId)?.toString()).toBe('2/3');
  });

  it('accumulates demand for a shared item (diamond) without rounding', () => {
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
          outputs: [{ item: 'a', qty: '2' }],
          inputs: [{ kind: 'item', item: 'shared', qty: '1' }],
          time: '1',
          machineCategory: 'assembling',
          allowProductivity: true,
        },
        {
          id: 'make-b',
          name: 'make b',
          outputs: [{ item: 'b', qty: '3' }],
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

    const result = solveRate(graph, Rational.of(1n));

    // make-a: rate = 1/2 (a を 1 作るのに 2 個産出するレシピを 1/2 回)
    // make-b: rate = 1/3
    expect(result.craftRates.get('make-a' as never)?.toString()).toBe('1/2');
    expect(result.craftRates.get('make-b' as never)?.toString()).toBe('1/3');
    // shared 需要 = 1/2 + 1/3 = 5/6
    expect(result.totalDemand.get('shared' as ItemId)?.toString()).toBe('5/6');
  });

  it('takes the max required rate across a byproduct recipe demanded via independent paths', () => {
    const set = parse({
      schemaVersion: 1,
      profile: baseProfile(),
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
    const graph = expand(set, index, 'product' as ItemId);

    const result = solveRate(graph, Rational.of(1n));

    // heavy-oil の要求(2)を満たすレート=2、light-oil の要求(4)には 4/3 で足りるため、
    // 大きい方の 2 が採用される（light は 2*3=6 産出され、4 を上回る余剰が出る）。
    expect(result.craftRates.get('oil-processing' as never)?.toString()).toBe('2/1');
    expect(result.craftRates.get('make-product' as never)?.toString()).toBe('1/1');
    expect(result.totalDemand.get('crude-oil' as ItemId)?.toString()).toBe('20/1');
  });

  it('solves a two-recipe cycle via simultaneous equations', () => {
    const set = parse({
      schemaVersion: 1,
      profile: baseProfile(),
      items: [
        { id: 'heavy-oil', name: 'heavy oil', categories: [] },
        { id: 'light-oil', name: 'light oil', categories: [] },
      ],
      recipes: [
        {
          id: 'light-to-heavy',
          name: 'light to heavy',
          outputs: [{ item: 'heavy-oil', qty: '3' }],
          inputs: [{ kind: 'item', item: 'light-oil', qty: '1' }],
          time: '1',
          machineCategory: 'chemical',
          allowProductivity: true,
        },
        {
          id: 'heavy-to-light',
          name: 'heavy to light',
          outputs: [{ item: 'light-oil', qty: '1' }],
          inputs: [{ kind: 'item', item: 'heavy-oil', qty: '1' }],
          time: '1',
          machineCategory: 'chemical',
          allowProductivity: true,
        },
      ],
      machines: [],
      rawItems: [],
    });
    const index = buildRecipeIndex(set);
    const graph = expand(set, index, 'heavy-oil' as ItemId);

    // 手計算: heavy 需要 D=4 のとき、
    //   heavy: 3*x1 - 1*x2 = 4
    //   light: 1*x2 - 1*x1 = 0  =>  x2 = x1
    //   => 2*x1 = 4 => x1 = 2, x2 = 2
    const result = solveRate(graph, Rational.of(4n));

    expect(result.craftRates.get('light-to-heavy' as never)?.toString()).toBe('2/1');
    expect(result.craftRates.get('heavy-to-light' as never)?.toString()).toBe('2/1');
  });

  it('propagates external demand out of a cyclic component to a raw item', () => {
    const set = parse({
      schemaVersion: 1,
      profile: baseProfile(),
      items: [
        { id: 'heavy-oil', name: 'heavy oil', categories: [] },
        { id: 'light-oil', name: 'light oil', categories: [] },
        { id: 'catalyst', name: 'catalyst', categories: [] },
      ],
      recipes: [
        {
          id: 'light-to-heavy',
          name: 'light to heavy',
          outputs: [{ item: 'heavy-oil', qty: '3' }],
          inputs: [{ kind: 'item', item: 'light-oil', qty: '1' }],
          time: '1',
          machineCategory: 'chemical',
          allowProductivity: true,
        },
        {
          id: 'heavy-to-light',
          name: 'heavy to light',
          outputs: [{ item: 'light-oil', qty: '1' }],
          inputs: [
            { kind: 'item', item: 'heavy-oil', qty: '1' },
            { kind: 'item', item: 'catalyst', qty: '5' },
          ],
          time: '1',
          machineCategory: 'chemical',
          allowProductivity: true,
        },
      ],
      machines: [],
      rawItems: ['catalyst'],
    });
    const index = buildRecipeIndex(set);
    const graph = expand(set, index, 'heavy-oil' as ItemId);

    const result = solveRate(graph, Rational.of(4n));

    expect(result.craftRates.get('heavy-to-light' as never)?.toString()).toBe('2/1');
    expect(result.totalDemand.get('catalyst' as ItemId)?.toString()).toBe('10/1');
  });
});
