import { describe, expect, it } from 'vitest';
import { Rational } from './rational.ts';
import { parseRecipeSet } from './schema.ts';

function minimalRecipeSet(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    profile: {
      id: 'factorio-2.0',
      name: 'Factorio 2.0',
      quantityMode: 'rate',
      allowCategoryInputs: false,
      displayMode: 'reducedPair',
      maxProductivityBonus: '0.3',
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
    machines: [
      { id: 'assembling-machine-3', name: '組立機3', category: 'assembling', baseSpeed: '1.25' },
    ],
    rawItems: ['iron-plate'],
    ...overrides,
  };
}

describe('parseRecipeSet', () => {
  it('accepts a valid recipe set and parses quantities as Rational', () => {
    const result = parseRecipeSet(minimalRecipeSet());
    expect(result.success).toBe(true);
    if (!result.success) return;

    const recipe = result.data.recipes[0];
    expect(recipe?.outputs[0]?.qty).toBeInstanceOf(Rational);
    expect(recipe?.outputs[0]?.qty.toString()).toBe('1/1');
    expect(recipe?.time.toString()).toBe('1/2');
    expect(result.data.machines[0]?.baseSpeed.toString()).toBe('5/4');
    expect(result.data.profile.maxProductivityBonus.toString()).toBe('3/10');
  });

  it('rejects a profile missing maxProductivityBonus', () => {
    const set = minimalRecipeSet();
    const profile = set.profile as { maxProductivityBonus?: string };
    delete profile.maxProductivityBonus;
    const result = parseRecipeSet(set);
    expect(result.success).toBe(false);
  });

  it('rejects a schemaVersion other than 1', () => {
    const result = parseRecipeSet(minimalRecipeSet({ schemaVersion: 2 }));
    expect(result.success).toBe(false);
  });

  it('rejects a recipe with empty outputs', () => {
    const set = minimalRecipeSet();
    (set.recipes[0] as { outputs: unknown[] }).outputs = [];
    const result = parseRecipeSet(set);
    expect(result.success).toBe(false);
  });

  it('rejects an unknown item id referenced in recipe outputs', () => {
    const set = minimalRecipeSet();
    (set.recipes[0] as { outputs: unknown[] }).outputs = [{ item: 'no-such-item', qty: '1' }];
    const result = parseRecipeSet(set);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.some((i) => i.path.join('.') === 'recipes.0.outputs.0.item')).toBe(
      true,
    );
  });

  it('rejects an unknown item id referenced in recipe inputs', () => {
    const set = minimalRecipeSet();
    (set.recipes[0] as { inputs: unknown[] }).inputs = [
      { kind: 'item', item: 'no-such-item', qty: '1' },
    ];
    const result = parseRecipeSet(set);
    expect(result.success).toBe(false);
  });

  it('rejects an unknown item id in rawItems', () => {
    const result = parseRecipeSet(minimalRecipeSet({ rawItems: ['no-such-item'] }));
    expect(result.success).toBe(false);
  });

  it('rejects a category ingredient when allowCategoryInputs is false', () => {
    const set = minimalRecipeSet();
    (set.recipes[0] as { inputs: unknown[] }).inputs = [
      { kind: 'category', category: 'liquid', qty: '1' },
    ];
    const result = parseRecipeSet(set);
    expect(result.success).toBe(false);
  });

  it('accepts a category ingredient when allowCategoryInputs is true', () => {
    const set = minimalRecipeSet({
      profile: {
        id: 'atelier-ryza',
        name: 'Atelier Ryza',
        quantityMode: 'discrete',
        allowCategoryInputs: true,
        maxProductivityBonus: '0',
      },
    });
    (set.recipes[0] as { inputs: unknown[] }).inputs = [
      { kind: 'category', category: 'liquid', qty: '1' },
    ];
    const result = parseRecipeSet(set);
    expect(result.success).toBe(true);
  });

  it('rejects an invalid decimal string in a quantity field, with a path', () => {
    const set = minimalRecipeSet();
    (set.recipes[0] as { outputs: unknown[] }).outputs = [{ item: 'iron-gear-wheel', qty: '1.2.3' }];
    const result = parseRecipeSet(set);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.some((i) => i.path.join('.') === 'recipes.0.outputs.0.qty')).toBe(
      true,
    );
  });

  it('rejects an invalid displayMode value', () => {
    const set = minimalRecipeSet();
    (set.profile as { displayMode: unknown }).displayMode = 'invalidMode';
    const result = parseRecipeSet(set);
    expect(result.success).toBe(false);
  });
});
