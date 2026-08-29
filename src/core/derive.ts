import { Rational } from './rational.ts';
import type { Ingredient, ItemId, MachineId, Recipe, RecipeId } from './schema.ts';

// 機械構成（速度・生産力・品質の効果をまとめたもの）。
// レシピデータには持たせず独立したデータとして扱う（SPEC.md 5章）。
// レシピ数 × 構成数で派生レシピを列挙しない設計上、JSON スキーマ（schema.ts）には含めない。
export type MachineSetup = {
  id: string;
  name: string;
  baseMachine: MachineId;
  speedMultiplier: Rational; // 機械速度 × (1 + 速度ボーナス)
  productivityBonus: Rational; // 0, 1/10, ...
  qualityChance?: Rational; // 初版では未使用
};

export type EffectiveRecipe = {
  recipe: Recipe;
  setup: MachineSetup;
  // 生産力ボーナス適用後の実効出力。入力は生産力の影響を受けない。
  effectiveOutputs: Array<{ item: ItemId; qty: Rational }>;
  effectiveInputs: Ingredient[];
  // 実効クラフト時間（速度ボーナス適用後）。機械台数計算にのみ使い、ソルバーには渡さない。
  effectiveCraftTime: Rational;
};

function clamp(value: Rational, min: Rational, max: Rational): Rational {
  if (value.cmp(min) < 0) return min;
  if (value.cmp(max) > 0) return max;
  return value;
}

// レシピと機械構成から実効レシピを導出する（SPEC.md 5.1/5.2節）。
// 速度ボーナスは物量比に影響しないためソルバーには渡さず、ここでクラフト時間にのみ反映する。
// 生産力ボーナスは物量比を変えるため出力数量に反映し、recipe.allowProductivity が false の
// レシピには適用しない。上限値はデータセット側の定数（profile.maxProductivityBonus）から読む。
export function derive(
  recipe: Recipe,
  setup: MachineSetup,
  maxProductivityBonus: Rational,
): EffectiveRecipe {
  const appliedProductivity = recipe.allowProductivity
    ? clamp(setup.productivityBonus, Rational.of(0n), maxProductivityBonus)
    : Rational.of(0n);
  const productivityMultiplier = Rational.of(1n).add(appliedProductivity);

  const effectiveOutputs = recipe.outputs.map((output) => ({
    item: output.item,
    qty: output.qty.mul(productivityMultiplier),
  }));

  const effectiveCraftTime = recipe.time.div(setup.speedMultiplier);

  return {
    recipe,
    setup,
    effectiveOutputs,
    effectiveInputs: recipe.inputs,
    effectiveCraftTime,
  };
}

// SPEC.md 5.3節: 構成の割り当てを三層のフォールバックで解決する。
// 1. レシピ個別の指定 2. machineCategory ごとの既定 3. データセット全体の既定
export type MachineAssignment = {
  perRecipe: Map<RecipeId, MachineSetup>;
  perMachineCategory: Map<string, MachineSetup>;
  fallback: MachineSetup;
};

export function resolveMachineSetup(recipe: Recipe, assignment: MachineAssignment): MachineSetup {
  return (
    assignment.perRecipe.get(recipe.id) ??
    assignment.perMachineCategory.get(recipe.machineCategory) ??
    assignment.fallback
  );
}

// TODO: 要検証。Factorio 2.0 のビーコン逓減式を一次情報で確認できていないため、
// ここでは未検証の仮の近似式（ビーコン1台あたりの効果が平方根で逓減する）を置く。
// 実データが揃い次第、正しい式に差し替えること。
// SPEC.md 5.4節の指示どおり、この計算だけは浮動小数点で行い、ゲーム内の丸め精度
// （仮に小数点以下2桁とする。これも要検証）に合わせて丸めてから Rational に変換する。
// 速度ボーナスは物量比に影響しないため、この丸めが上流の必要量計算を汚染することはない。
export function computeBeaconSpeedBonus(beaconCount: number, perBeaconEffect: Rational): Rational {
  if (beaconCount <= 0) return Rational.of(0n);
  const approxTotal = perBeaconEffect.toNumber() * Math.sqrt(beaconCount);
  const rounded = Math.round(approxTotal * 100) / 100;
  return Rational.fromDecimal(rounded.toFixed(2));
}
