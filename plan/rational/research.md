# Research: Rational クラス

## 現状

`src/core/` はまだ存在しない。プロジェクトは前タスクで Vite + React + TS の空ページと
GitHub Pages デプロイのみが用意された状態で、`src/` には `App.tsx` / `main.tsx` /
`vite-env.d.ts` の3ファイルしかない。

## ビルド・型チェック・テストの構成

- `package.json` の scripts:
  - `build`: `tsc -b && vite build`
  - `typecheck`: `tsc -b --noEmit`
  - `test`: `vitest run`
- `tsconfig.json` はルートで、`tsconfig.app.json`（`src` 対象、`strict: true`,
  `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch` 有効）と
  `tsconfig.node.json`（`vite.config.ts` 対象）を project references で束ねる構成。
  → `src/core/rational.ts` はこの `tsconfig.app.json` の対象になり、strict の恩恵をそのまま受ける。
- `vitest` は devDependencies に導入済み（`^3.0.4`）だが、`vitest.config.ts` は存在せず、
  専用の `test` ブロックも `vite.config.ts` に無い。`npx vitest run` を実際に実行して確認した
  ところ、`include: **/*.{test,spec}.?(c|m)[jt]s?(x)` のデフォルト設定で解決され、
  `No test files found` 以外のエラーは出なかった。設定追加なしで
  `src/core/rational.test.ts` を置けばそのまま拾われる。
- Biome/ESLint は未導入（前タスクでは意図的にスコープ外とした）。今回も導入しない。

## SPEC.md 3.1 節の要求（再掲・確認済み）

```ts
class Rational {
  readonly n: bigint;  // 符号は n が持つ
  readonly d: bigint;  // 常に正、gcd(n, d) = 1

  static of(n: bigint | number, d?: bigint | number): Rational;
  static fromDecimal(s: string): Rational;   // "3.2" → 16/5
  add(o: Rational): Rational;
  sub(o: Rational): Rational;
  mul(o: Rational): Rational;
  div(o: Rational): Rational;
  cmp(o: Rational): -1 | 0 | 1;
  isZero(): boolean;
  ceilToBigInt(): bigint;
  toNumber(): number;    // 表示の最終段でのみ呼ぶ
  toString(): string;    // "16/5"
}
```

- コンストラクタは private、正規化（符号を `n` に寄せる、`gcd` で約分、`d` は正）を必ず通す。
- 演算のたびに gcd で約分する（CLAUDE.md「有理数の約分」節）。
- JSON の数量フィールドは文字列であり、`fromDecimal` で読む。`parseFloat` を経由させない。

## fromDecimal の仕様確定（SPEC/CLAUDE に明記が無い箇所の設計判断）

SPEC.md / CLAUDE.md は `fromDecimal("3.2")` → `16/5` という一例のみを示し、以下は未規定。
Research 段階では実装せず、次の Plan で判断を明示する。

- 符号（`-3.2` の扱い）
- 指数表記（`1e3` 等）を受け付けるか
- 整数のみの文字列（`"5"`）を受け付けるか
- 空文字列・不正文字列時の扱い（例外を投げるべき）
- 先頭ゼロ・末尾の `.`（`"3."` や `".5"`）の扱い

これらは実装が誤ると「JSON の数量フィールドを誤差なく読む」という SPEC の目的そのものを
破壊する（致命的な入力を静かに誤解釈する）ため、Plan で仕様を明文化してからテストを書く。

## ceilToBigInt の仕様確認

SPEC.md には定義の詳細が無いが、6.3節の離散モードで `ceil(必要量 / レシピ産出量)` に使う
想定であることから、天井関数（0以上なら切り上げ、負数なら 0 方向への切り上げ、つまり
数学的な `ceil`）として実装する。境界値（ちょうど割り切れる場合、負数の場合、ゼロの場合）
をテストする。

## 依存・影響範囲

- 現時点で `Rational` を利用するコードは存在しない（`schema.ts` 等は未実装）。
  本タスクは他コードに影響を与えない独立した追加。
- 今後 `schema.ts` が `Rational.fromDecimal` を使う前提のため、エラー時の挙動
  （例外を投げる／投げない）は後続タスクの Zod 検証設計に影響する。今回は
  「不正な入力は例外を投げる」方針とし、Zod 側で `refine`/`transform` を通して
  検証エラーに変換する設計を前提に置く（後続タスクで詳細化）。

## オープンな疑問（ユーザー確認が必要な場合はここに記録）

- 特になし。SPEC.md 3.1 節の記述で実装に必要な情報は揃っている。
  `fromDecimal` の細部（上記）は Plan で妥当な解釈を提示し、レビューを仰ぐ。
