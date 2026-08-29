import { describe, expect, it } from 'vitest';
import {
  buildRecipeIndex,
  findCyclicRecipeIds,
  findOrphanItems,
  findOrphanRecipes,
} from './index.ts';
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
  };
}

describe('buildRecipeIndex', () => {
  it('maps an item id to the recipes that produce it', () => {
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
    expect(index.get('iron-gear-wheel' as ItemId)?.map((r) => r.id)).toEqual(['iron-gear-wheel']);
    expect(index.has('iron-plate' as ItemId)).toBe(false);
  });

  it('collects multiple recipes producing the same item', () => {
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
    expect(index.get('petroleum-gas' as ItemId)?.map((r) => r.id)).toEqual([
      'basic-oil-processing',
      'advanced-oil-processing',
    ]);
  });
});

describe('findOrphanItems', () => {
  it('flags items with no producing recipe that are not raw', () => {
    const set = parse({
      schemaVersion: 1,
      profile: baseProfile(),
      items: [
        { id: 'iron-plate', name: 'iron plate', categories: [] },
        { id: 'mystery-item', name: 'mystery', categories: [] },
      ],
      recipes: [],
      machines: [],
      rawItems: ['iron-plate'],
    });

    const index = buildRecipeIndex(set);
    expect(findOrphanItems(set, index)).toEqual(['mystery-item']);
  });
});

describe('findOrphanRecipes', () => {
  it('flags a recipe whose output is never consumed', () => {
    const set = parse({
      schemaVersion: 1,
      profile: baseProfile(),
      items: [
        { id: 'iron-plate', name: 'iron plate', categories: [] },
        { id: 'iron-gear-wheel', name: 'iron gear wheel', categories: [] },
        { id: 'engine-unit', name: 'engine unit', categories: [] },
        { id: 'unused-item', name: 'unused', categories: [] },
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
        {
          id: 'engine-unit',
          name: 'engine unit',
          outputs: [{ item: 'engine-unit', qty: '1' }],
          inputs: [{ kind: 'item', item: 'iron-gear-wheel', qty: '1' }],
          time: '10',
          machineCategory: 'assembling',
          allowProductivity: true,
        },
        {
          id: 'unused-recipe',
          name: 'unused recipe',
          outputs: [{ item: 'unused-item', qty: '1' }],
          inputs: [],
          time: '1',
          machineCategory: 'assembling',
          allowProductivity: true,
        },
      ],
      machines: [],
      rawItems: ['iron-plate'],
    });

    // iron-gear-wheel は engine-unit に消費されるため orphan ではない。
    // engine-unit（最終製品相当）と unused-recipe はどこからも消費されないため orphan になる。
    expect(findOrphanRecipes(set)).toEqual(['engine-unit', 'unused-recipe']);
  });

  it('treats a category ingredient as consuming any item declaring that category', () => {
    const set = parse({
      schemaVersion: 1,
      profile: { ...baseProfile(), quantityMode: 'discrete', allowCategoryInputs: true },
      items: [
        { id: 'water', name: 'water', categories: ['liquid'] },
        { id: 'potion', name: 'potion', categories: [] },
      ],
      recipes: [
        {
          id: 'make-water',
          name: 'make water',
          outputs: [{ item: 'water', qty: '1' }],
          inputs: [],
          time: '1',
          machineCategory: 'kettle',
          allowProductivity: false,
        },
        {
          id: 'make-potion',
          name: 'make potion',
          outputs: [{ item: 'potion', qty: '1' }],
          inputs: [{ kind: 'category', category: 'liquid', qty: '1' }],
          time: '1',
          machineCategory: 'kettle',
          allowProductivity: false,
        },
      ],
      machines: [],
      rawItems: [],
    });

    // water は category 'liquid' 経由で make-potion に消費されるため orphan ではない。
    // potion（最終製品相当）はどこからも消費されないため orphan になる。
    expect(findOrphanRecipes(set)).toEqual(['make-potion']);
  });
});

describe('findCyclicRecipeIds', () => {
  it('returns an empty set for an acyclic graph', () => {
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

    expect(findCyclicRecipeIds(set)).toEqual(new Set());
  });

  it('detects a two-recipe cycle', () => {
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

    expect(findCyclicRecipeIds(set)).toEqual(new Set(['a-to-b', 'b-to-a']));
  });
});
