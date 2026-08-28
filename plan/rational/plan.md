# Plan: Rational クラス

## アプローチ

`src/core/rational.ts` に `Rational` クラスと非公開の `gcd` ヘルパーを実装する。
コンストラクタを private にし、生成はすべて内部の正規化ヘルパー `normalize(n, d)` を
経由させることで「常に約分済み、分母は正、符号は分子が持つ」という不変条件をコード上で
強制する。テストは `src/core/rational.test.ts` に Vitest で書く（設定追加不要、Research で確認済み）。

外部から見えるのは SPEC.md 3.1 節の API のみ。`normalize` と `gcd` はモジュール内 private とする。

## fromDecimal の仕様（Research で挙げた未規定点への回答）

以下を採用する。理由は「JSON の数量フィールドを誤差なく読む」という目的に対して、
曖昧な形式を許容するとレシピデータの誤りを静かに通してしまうため、最小限の形式だけを
受理し、それ以外は例外を投げる。

- 許容する形式: `^-?\d+(\.\d+)?$`（符号任意、整数部必須、小数点はある場合は小数部必須）
- `"3.2"` → `16/5`、`"-3.2"` → `-16/5`、`"5"` → `5/1`
- 拒否する形式（`RangeError` を投げる）: 空文字列、`"3."`、`".5"`、`"1e3"`、`"1.2.3"`、
  数字以外を含む文字列
- 指数表記・先頭ゼロ許容・空白許容などは今回スコープ外（同梱データセット・ユーザー投入 JSON
  ともに単純な10進文字列を想定するため、必要になった時点で拡張する）

## API 詳細

```ts
export class Rational {
  private constructor(
    readonly n: bigint,
    readonly d: bigint,
  ) {}

  private static normalize(n: bigint, d: bigint): Rational {
    if (d === 0n) {
      throw new RangeError('Rational: division by zero');
    }
    if (n === 0n) {
      return new Rational(0n, 1n);
    }
    const sign = d < 0n ? -1n : 1n;
    const an = n < 0n ? -n : n;
    const ad = d < 0n ? -d : d;
    const g = gcd(an, ad);
    return new Rational((sign * n) / g, ad / g);
  }

  static of(n: bigint | number, d: bigint | number = 1n): Rational {
    return Rational.normalize(toBigInt(n), toBigInt(d));
  }

  static fromDecimal(s: string): Rational {
    const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(s);
    if (m === null) {
      throw new RangeError(`Rational.fromDecimal: invalid decimal string: ${s}`);
    }
    const [, sign, intPart, fracPart = ''] = m;
    const n = BigInt(`${sign}${intPart}${fracPart}`);
    const d = 10n ** BigInt(fracPart.length);
    return Rational.normalize(n, d);
  }

  add(o: Rational): Rational {
    return Rational.normalize(this.n * o.d + o.n * this.d, this.d * o.d);
  }

  sub(o: Rational): Rational {
    return Rational.normalize(this.n * o.d - o.n * this.d, this.d * o.d);
  }

  mul(o: Rational): Rational {
    return Rational.normalize(this.n * o.n, this.d * o.d);
  }

  div(o: Rational): Rational {
    return Rational.normalize(this.n * o.d, this.d * o.n);
  }

  cmp(o: Rational): -1 | 0 | 1 {
    const l = this.n * o.d;
    const r = o.n * this.d;
    if (l < r) return -1;
    if (l > r) return 1;
    return 0;
  }

  isZero(): boolean {
    return this.n === 0n;
  }

  ceilToBigInt(): bigint {
    if (this.n >= 0n) {
      return (this.n + this.d - 1n) / this.d;
    }
    return this.n / this.d;
  }

  // 表示の最終段（UI 直前）以外で呼ばない。core/ 内部からの呼び出しは設計を疑うこと。
  toNumber(): number {
    return Number(this.n) / Number(this.d);
  }

  toString(): string {
    return `${this.n}/${this.d}`;
  }
}

function toBigInt(x: bigint | number): bigint {
  if (typeof x === 'bigint') return x;
  if (!Number.isInteger(x)) {
    throw new RangeError(`Rational: non-integer number passed to of(): ${x}`);
  }
  return BigInt(x);
}

function gcd(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) {
    [x, y] = [y, x % y];
  }
  return x === 0n ? 1n : x; // 0/0 は normalize の n===0n 分岐で先に処理されるため到達しない防御
}
```

補足:

- `Rational.of(n, d)` の `d` 省略時デフォルトは `1n`（整数の構築 `Rational.of(3)` 用）。
- `of()` に非整数の `number`（例 `0.5`）を渡すと例外を投げる。浮動小数点由来の誤差を
  構築前に持ち込ませないため。整数リテラルの利便性のためだけに `number` を許容する。
- `ceilToBigInt()` は数学的な天井関数。正の値は `(n + d - 1) / d`、負の値は BigInt の
  ゼロ方向切り捨てがそのまま天井と一致することを利用する（0 は正側の分岐で処理）。
- `toString()` は常に `"n/d"` 形式（分母が 1 でも `"3/1"`）。人間向けの表示形式
  （SPEC.md 7章の reducedPair 等）は別モジュール `display.ts` の責務であり、ここでは
  デバッグ用の正確な表現のみを提供する。

## 変更対象ファイル

- 新規: `src/core/rational.ts`
- 新規: `src/core/rational.test.ts`

既存ファイルへの変更はない。`src/core/` ディレクトリを本タスクで新規作成する。

## テスト計画（`src/core/rational.test.ts`）

- `of` / 正規化
  - `Rational.of(4n, 8n)` が `1/2` に約分される
  - 分母に負数を渡すと符号が分子に移り、分母が正になる（`of(1n, -2n)` → `-1/2`）
  - 分子が 0 のとき分母は常に `1`（`of(0n, 5n)` → `0/1`）
  - 分母 0 で `RangeError`
  - `number` の整数を受け付ける（`of(3)` → `3/1`）
  - `number` の非整数で `RangeError`（`of(0.5)`）
- `fromDecimal`
  - `"3.2"` → `16/5`
  - `"-3.2"` → `-16/5`
  - `"5"` → `5/1`
  - `"0.1"` → `1/10`
  - 不正入力（`""`, `"3."`, `".5"`, `"1e3"`, `"1.2.3"`, `"abc"`）で `RangeError`
- 四則演算
  - `add`: `1/3 + 1/6` → `1/2`
  - `sub`: `1/3 - 1/2` → `-1/6`（負数の正規化）
  - `mul`: `2/3 * 3/4` → `1/2`、ゼロとの積 → `0/1`
  - `div`: `1/2 / 1/3` → `3/2`、ゼロ除算で `RangeError`
  - 演算結果の `n`/`d` の `gcd` が常に 1 であることを個別ケースで確認（約分の回帰防止）
- `cmp`
  - `1/2` vs `2/3` → `-1`、逆順で `1`、`1/2` vs `2/4` → `0`
  - 負数を含む比較（`-1/2` vs `1/3` → `-1`）
- `isZero`
  - `of(0n)` → `true`、`of(1n, 100n)` → `false`
- `ceilToBigInt`
  - `7/2` → `4n`、`6/2` → `3n`（割り切れる場合）
  - `-7/2` → `-3n`、`-6/2` → `-3n`
  - `0/1` → `0n`
- `toNumber`
  - `1/2` → `0.5`、`-3/4` → `-0.75`
- `toString`
  - `of(4n, 8n).toString()` → `"1/2"`（正規化後の文字列であることの確認）

## 既存システムとの接続点

- 現時点で他コードからの参照はない。次タスク（`schema.ts`）が `Rational.fromDecimal` を
  JSON 数量フィールドの読み込みに使う想定（SPEC.md 3.2 節）。今回定めた `fromDecimal` の
  受理形式・例外方針がそのまま次タスクの Zod 検証設計の前提になる。

## Todo

### 実装

- [x] `src/core/` ディレクトリを作成する
- [x] `src/core/rational.ts` を作成し、`gcd` / `toBigInt` ヘルパーと `Rational` クラス
      （`of` / `fromDecimal` / `add` / `sub` / `mul` / `div` / `cmp` / `isZero` /
      `ceilToBigInt` / `toNumber` / `toString`）を実装する

### テスト

- [x] `src/core/rational.test.ts` を作成する
- [x] `of` / 正規化のテスト（約分、負分母、ゼロ分子、ゼロ除算、number 整数、number 非整数）
- [x] `fromDecimal` のテスト（正常系4パターン、異常系6パターン）
- [x] `add` / `sub` / `mul` / `div` のテスト（正常系、ゼロ除算、gcd=1 の確認）
- [x] `cmp` のテスト（負数を含む）
- [x] `isZero` のテスト
- [x] `ceilToBigInt` のテスト（正・負・割り切れる場合・ゼロ）
- [x] `toNumber` のテスト
- [x] `toString` のテスト（正規化後であることの確認）

### 検証

- [x] `npm run typecheck` が通ることを確認する
- [x] `npm run test` が全テストパスすることを確認する（36 tests passed）
- [x] `npm run build` が通ることを確認する（`core/` 追加が既存ビルドを壊さないこと）
