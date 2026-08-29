import { z } from 'zod';
import { Rational } from './rational.ts';

export type ItemId = z.infer<typeof itemId>;
export type RecipeId = z.infer<typeof recipeId>;
export type CatId = z.infer<typeof catId>;
export type MachineId = z.infer<typeof machineId>;

const itemId = z.string().min(1).brand('ItemId');
const recipeId = z.string().min(1).brand('RecipeId');
const catId = z.string().min(1).brand('CatId');
const machineId = z.string().min(1).brand('MachineId');

// JSON の数量フィールドは文字列。parseFloat を経由させず Rational.fromDecimal で直接構築する。
const rationalString = z.string().transform((s, ctx) => {
  try {
    return Rational.fromDecimal(s);
  } catch {
    ctx.addIssue({ code: 'custom', message: `invalid decimal string: "${s}"` });
    return z.NEVER;
  }
});

const ingredientSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('item'), item: itemId, qty: rationalString }),
  z.object({ kind: z.literal('category'), category: catId, qty: rationalString }),
]);
export type Ingredient = z.infer<typeof ingredientSchema>;

const recipeSchema = z.object({
  id: recipeId,
  name: z.string().min(1),
  outputs: z.array(z.object({ item: itemId, qty: rationalString })).min(1),
  inputs: z.array(ingredientSchema),
  time: rationalString,
  machineCategory: z.string().min(1),
  allowProductivity: z.boolean(),
});
export type Recipe = z.infer<typeof recipeSchema>;

const machineSchema = z.object({
  id: machineId,
  name: z.string().min(1),
  category: z.string().min(1),
  baseSpeed: rationalString,
});
export type Machine = z.infer<typeof machineSchema>;

const itemSchema = z.object({
  id: itemId,
  name: z.string().min(1),
  categories: z.array(catId),
});
export type Item = z.infer<typeof itemSchema>;

const quantityModeSchema = z.enum(['discrete', 'rate']);
export type QuantityMode = z.infer<typeof quantityModeSchema>;

// rate のときのみ有効。discrete プロファイルでは無視される。
const displayModeSchema = z.enum(['reducedPair', 'perWindow', 'perSecond']);
export type DisplayMode = z.infer<typeof displayModeSchema>;

const profileSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  quantityMode: quantityModeSchema,
  allowCategoryInputs: z.boolean(),
  displayMode: displayModeSchema.optional(),
  // 生産力ボーナスの上限（SPEC.md 5.2節）。バージョン依存のためコードにハードコードせず、
  // データセット側の定数として持つ。生産力を使わないプロファイルは "0" を指定する。
  maxProductivityBonus: rationalString,
});
export type GameProfile = z.infer<typeof profileSchema>;

const recipeSetSchemaBase = z.object({
  schemaVersion: z.literal(1),
  profile: profileSchema,
  items: z.array(itemSchema),
  recipes: z.array(recipeSchema),
  machines: z.array(machineSchema),
  rawItems: z.array(itemId),
});

// 8.1節の致命的エラーのうち、フィールド単体では判定できないもの
// （アイテムID参照の存在確認、allowCategoryInputs との矛盾）をここで検査する。
// 警告（孤立アイテム・孤立レシピ・循環検出）は逆引きインデックスを要するため index.ts の責務とする。
export const recipeSetSchema = recipeSetSchemaBase.superRefine((data, ctx) => {
  const itemIds = new Set<ItemId>(data.items.map((item) => item.id));

  data.rawItems.forEach((id, i) => {
    if (!itemIds.has(id)) {
      ctx.addIssue({
        code: 'custom',
        path: ['rawItems', i],
        message: `unknown item id in rawItems: "${id}"`,
      });
    }
  });

  data.recipes.forEach((recipe, ri) => {
    recipe.outputs.forEach((output, oi) => {
      if (!itemIds.has(output.item)) {
        ctx.addIssue({
          code: 'custom',
          path: ['recipes', ri, 'outputs', oi, 'item'],
          message: `unknown item id: "${output.item}"`,
        });
      }
    });

    recipe.inputs.forEach((ingredient, ii) => {
      if (ingredient.kind === 'category' && !data.profile.allowCategoryInputs) {
        ctx.addIssue({
          code: 'custom',
          path: ['recipes', ri, 'inputs', ii, 'kind'],
          message: 'category ingredient is not allowed when profile.allowCategoryInputs is false',
        });
      }
      if (ingredient.kind === 'item' && !itemIds.has(ingredient.item)) {
        ctx.addIssue({
          code: 'custom',
          path: ['recipes', ri, 'inputs', ii, 'item'],
          message: `unknown item id: "${ingredient.item}"`,
        });
      }
    });
  });
});

export type RecipeSet = z.infer<typeof recipeSetSchema>;

export function parseRecipeSet(input: unknown): z.ZodSafeParseResult<RecipeSet> {
  return recipeSetSchema.safeParse(input);
}

