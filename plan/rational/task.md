# Rational クラスの実装

- 管理ID: なし

## 目的 / 背景

SPEC.md の実装順序（12章）における最初のステップ。数量をすべて有理数（BigInt ベース）で
扱うという本プロジェクトの根幹となる制約を満たすため、`src/core/rational.ts` に `Rational`
クラスを実装する。以降のスキーマ検証・ソルバー実装はすべてこのクラスに依存する。

## 要件

SPEC.md 3.1 節および CLAUDE.md「数値は Rational で扱う」節に基づく。

- `Rational` クラス（`n: bigint`, `d: bigint`）。符号は `n` が持ち、`d` は常に正。
  `gcd(n, d) = 1` に常に正規化する。
- コンストラクタは private にし、生成は静的ファクトリ経由に限定する。
- 静的メソッド:
  - `Rational.of(n: bigint | number, d?: bigint | number): Rational`
  - `Rational.fromDecimal(s: string): Rational` — 例: `"3.2"` → `16/5`。
    `parseFloat` を経由せず、10進文字列から直接構築する。
- インスタンスメソッド:
  - `add(o: Rational): Rational`
  - `sub(o: Rational): Rational`
  - `mul(o: Rational): Rational`
  - `div(o: Rational): Rational`
  - `cmp(o: Rational): -1 | 0 | 1`
  - `isZero(): boolean`
  - `ceilToBigInt(): bigint`
  - `toNumber(): number` — 表示の最終段でのみ呼ぶ想定のコメントを付す
  - `toString(): string` — `"16/5"` 形式
- 演算のたびに gcd で約分する（ビット長の単調増加を防ぐ）。
- ゼロ除算、負数、大きな分母などの境界値をテストする。

## スコープ外(明示されたもの)

- `schema.ts` や他の `core/` モジュールの実装（SPEC.md 12章の後続ステップ）。
- UI・dagre 連携。

## 参照(関連ファイル、参考実装、リンク等)

- `SPEC.md` 3.1 節（Rational の型定義と根拠）
- `CLAUDE.md`「数値は Rational で扱う」節、「有理数の約分」節
- 既存コード: `src/core/` は未作成（本タスクで新規作成）
