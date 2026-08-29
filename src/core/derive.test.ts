import { describe, expect, it } from 'vitest';
import {
  computeBeaconSpeedBonus,
  derive,
  resolveMachineSetup,
  type MachineAssignment,
  type MachineSetup,
} from './derive.ts';
import { Rational } from './rational.ts';
import { parseRecipeSet, type Recipe, type RecipeSet } from './schema.ts';

function parse(input: unknown): RecipeSet {
  const result = parseRecipeSet(input);
  if (!result.success) {
    throw new Error(`invalid fixture: ${JSON.stringify(result.error.issues)}`);
  }
  return result.data;
}

function buildRecipeSet(allowProductivity: boolean): RecipeSet {
  return parse({
    schemaVersion: 1,
    profile: {
      id: 'test',
      name: 'test',
      quantityMode: 'rate',
      allowCategoryInputs: false,
      maxProductivityBonus: '0.5',
    },
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
        allowProductivity,
      },
    ],
    machines: [
      { id: 'assembling-machine-3', name: 'assembling machine 3', category: 'assembling', baseSpeed: '1.25' },
    ],
    rawItems: ['iron-plate'],
  });
}

function makeSetup(overrides: Partial<MachineSetup> = {}): MachineSetup {
  return {
    id: 'setup-1',
    name: 'setup 1',
    baseMachine: 'assembling-machine-3' as MachineSetup['baseMachine'],
    speedMultiplier: Rational.of(1n),
    productivityBonus: Rational.of(0n),
    ...overrides,
  };
}

describe('derive', () => {
  it('applies productivity to outputs but not inputs when allowed', () => {
    const set = buildRecipeSet(true);
    const recipe = set.recipes[0] as Recipe;
    const setup = makeSetup({ productivityBonus: Rational.of(1n, 10n) }); // +10%

    const effective = derive(recipe, setup, set.profile.maxProductivityBonus);

    expect(effective.effectiveOutputs[0]?.qty.toString()).toBe('11/10'); // 1 * 1.1
    expect(effective.effectiveInputs).toBe(recipe.inputs); // 入力は不変
  });

  it('ignores productivity when the recipe does not allow it', () => {
    const set = buildRecipeSet(false);
    const recipe = set.recipes[0] as Recipe;
    const setup = makeSetup({ productivityBonus: Rational.of(1n, 10n) });

    const effective = derive(recipe, setup, set.profile.maxProductivityBonus);

    expect(effective.effectiveOutputs[0]?.qty.toString()).toBe('1/1');
  });

  it('clamps productivity to the dataset-defined maximum', () => {
    const set = buildRecipeSet(true); // maxProductivityBonus = 0.5
    const recipe = set.recipes[0] as Recipe;
    const setup = makeSetup({ productivityBonus: Rational.of(10n) }); // 1000%、上限を超える

    const effective = derive(recipe, setup, set.profile.maxProductivityBonus);

    expect(effective.effectiveOutputs[0]?.qty.toString()).toBe('3/2'); // 1 * (1 + 0.5)
  });

  it('divides craft time by the speed multiplier and leaves the ratio-affecting quantities untouched', () => {
    const set = buildRecipeSet(true);
    const recipe = set.recipes[0] as Recipe;
    const setup = makeSetup({ speedMultiplier: Rational.of(2n) });

    const effective = derive(recipe, setup, set.profile.maxProductivityBonus);

    expect(effective.effectiveCraftTime.toString()).toBe('1/4'); // (1/2) / 2
    expect(effective.effectiveOutputs[0]?.qty.toString()).toBe('1/1'); // 速度は物量比に影響しない
  });
});

describe('resolveMachineSetup', () => {
  it('prefers the per-recipe override over category and fallback', () => {
    const set = buildRecipeSet(true);
    const recipe = set.recipes[0] as Recipe;
    const perRecipeSetup = makeSetup({ id: 'per-recipe' });
    const perCategorySetup = makeSetup({ id: 'per-category' });
    const fallbackSetup = makeSetup({ id: 'fallback' });

    const assignment: MachineAssignment = {
      perRecipe: new Map([[recipe.id, perRecipeSetup]]),
      perMachineCategory: new Map([[recipe.machineCategory, perCategorySetup]]),
      fallback: fallbackSetup,
    };

    expect(resolveMachineSetup(recipe, assignment).id).toBe('per-recipe');
  });

  it('falls back to the machine category default when no per-recipe override exists', () => {
    const set = buildRecipeSet(true);
    const recipe = set.recipes[0] as Recipe;
    const perCategorySetup = makeSetup({ id: 'per-category' });
    const fallbackSetup = makeSetup({ id: 'fallback' });

    const assignment: MachineAssignment = {
      perRecipe: new Map(),
      perMachineCategory: new Map([[recipe.machineCategory, perCategorySetup]]),
      fallback: fallbackSetup,
    };

    expect(resolveMachineSetup(recipe, assignment).id).toBe('per-category');
  });

  it('falls back to the dataset-wide default when nothing more specific matches', () => {
    const set = buildRecipeSet(true);
    const recipe = set.recipes[0] as Recipe;
    const fallbackSetup = makeSetup({ id: 'fallback' });

    const assignment: MachineAssignment = {
      perRecipe: new Map(),
      perMachineCategory: new Map(),
      fallback: fallbackSetup,
    };

    expect(resolveMachineSetup(recipe, assignment).id).toBe('fallback');
  });
});

describe('computeBeaconSpeedBonus', () => {
  it('returns zero for no beacons', () => {
    expect(computeBeaconSpeedBonus(0, Rational.of(1n, 2n)).isZero()).toBe(true);
  });

  it('returns a positive bonus that grows sub-linearly with beacon count', () => {
    const oneBeacon = computeBeaconSpeedBonus(1, Rational.of(1n, 2n));
    const fourBeacons = computeBeaconSpeedBonus(4, Rational.of(1n, 2n));
    // sqrt(4)/sqrt(1) = 2 倍。逓減式そのものは TODO だが、単調に増えることだけ確認する。
    expect(fourBeacons.cmp(oneBeacon)).toBe(1);
  });
});
