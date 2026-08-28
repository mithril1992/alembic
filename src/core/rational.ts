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
  return x === 0n ? 1n : x;
}
