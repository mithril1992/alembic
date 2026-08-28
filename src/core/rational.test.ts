import { describe, expect, it } from 'vitest';
import { Rational } from './rational.ts';

describe('Rational.of', () => {
  it('reduces n/d by gcd', () => {
    const r = Rational.of(4n, 8n);
    expect(r.n).toBe(1n);
    expect(r.d).toBe(2n);
  });

  it('moves the sign of a negative denominator to the numerator', () => {
    const r = Rational.of(1n, -2n);
    expect(r.n).toBe(-1n);
    expect(r.d).toBe(2n);
  });

  it('normalizes zero numerator to denominator 1', () => {
    const r = Rational.of(0n, 5n);
    expect(r.n).toBe(0n);
    expect(r.d).toBe(1n);
  });

  it('throws on zero denominator', () => {
    expect(() => Rational.of(1n, 0n)).toThrow(RangeError);
  });

  it('accepts integer numbers', () => {
    const r = Rational.of(3);
    expect(r.n).toBe(3n);
    expect(r.d).toBe(1n);
  });

  it('throws on non-integer numbers', () => {
    expect(() => Rational.of(0.5)).toThrow(RangeError);
  });
});

describe('Rational.fromDecimal', () => {
  it('parses "3.2" as 16/5', () => {
    const r = Rational.fromDecimal('3.2');
    expect(r.n).toBe(16n);
    expect(r.d).toBe(5n);
  });

  it('parses a negative decimal', () => {
    const r = Rational.fromDecimal('-3.2');
    expect(r.n).toBe(-16n);
    expect(r.d).toBe(5n);
  });

  it('parses an integer-only string', () => {
    const r = Rational.fromDecimal('5');
    expect(r.n).toBe(5n);
    expect(r.d).toBe(1n);
  });

  it('parses "0.1" as 1/10', () => {
    const r = Rational.fromDecimal('0.1');
    expect(r.n).toBe(1n);
    expect(r.d).toBe(10n);
  });

  it.each(['', '3.', '.5', '1e3', '1.2.3', 'abc'])(
    'throws on invalid input %j',
    (input) => {
      expect(() => Rational.fromDecimal(input)).toThrow(RangeError);
    },
  );
});

describe('arithmetic', () => {
  it('adds fractions with different denominators', () => {
    const r = Rational.of(1n, 3n).add(Rational.of(1n, 6n));
    expect(r.n).toBe(1n);
    expect(r.d).toBe(2n);
  });

  it('subtracts to a negative result and normalizes it', () => {
    const r = Rational.of(1n, 3n).sub(Rational.of(1n, 2n));
    expect(r.n).toBe(-1n);
    expect(r.d).toBe(6n);
  });

  it('multiplies fractions', () => {
    const r = Rational.of(2n, 3n).mul(Rational.of(3n, 4n));
    expect(r.n).toBe(1n);
    expect(r.d).toBe(2n);
  });

  it('multiplying by zero yields 0/1', () => {
    const r = Rational.of(2n, 3n).mul(Rational.of(0n));
    expect(r.n).toBe(0n);
    expect(r.d).toBe(1n);
  });

  it('divides fractions', () => {
    const r = Rational.of(1n, 2n).div(Rational.of(1n, 3n));
    expect(r.n).toBe(3n);
    expect(r.d).toBe(2n);
  });

  it('throws when dividing by zero', () => {
    expect(() => Rational.of(1n, 2n).div(Rational.of(0n))).toThrow(RangeError);
  });

  it('keeps results reduced (gcd(n, d) === 1) across repeated operations', () => {
    let r = Rational.of(0n);
    for (let i = 0; i < 20; i++) {
      r = r.add(Rational.of(1n, 3n));
    }
    // 1/3 * 20 = 20/3, already reduced
    expect(r.n).toBe(20n);
    expect(r.d).toBe(3n);
  });
});

describe('cmp', () => {
  it('returns -1 when this < other', () => {
    expect(Rational.of(1n, 2n).cmp(Rational.of(2n, 3n))).toBe(-1);
  });

  it('returns 1 when this > other', () => {
    expect(Rational.of(2n, 3n).cmp(Rational.of(1n, 2n))).toBe(1);
  });

  it('returns 0 for equal values with different representations', () => {
    expect(Rational.of(1n, 2n).cmp(Rational.of(2n, 4n))).toBe(0);
  });

  it('handles negative values', () => {
    expect(Rational.of(-1n, 2n).cmp(Rational.of(1n, 3n))).toBe(-1);
  });
});

describe('isZero', () => {
  it('is true for zero', () => {
    expect(Rational.of(0n).isZero()).toBe(true);
  });

  it('is false for non-zero', () => {
    expect(Rational.of(1n, 100n).isZero()).toBe(false);
  });
});

describe('ceilToBigInt', () => {
  it('rounds a positive non-integer up', () => {
    expect(Rational.of(7n, 2n).ceilToBigInt()).toBe(4n);
  });

  it('returns the exact value for a positive integer ratio', () => {
    expect(Rational.of(6n, 2n).ceilToBigInt()).toBe(3n);
  });

  it('rounds a negative non-integer toward zero', () => {
    expect(Rational.of(-7n, 2n).ceilToBigInt()).toBe(-3n);
  });

  it('returns the exact value for a negative integer ratio', () => {
    expect(Rational.of(-6n, 2n).ceilToBigInt()).toBe(-3n);
  });

  it('returns 0 for zero', () => {
    expect(Rational.of(0n).ceilToBigInt()).toBe(0n);
  });
});

describe('toNumber', () => {
  it('converts to the expected floating point value', () => {
    expect(Rational.of(1n, 2n).toNumber()).toBe(0.5);
    expect(Rational.of(-3n, 4n).toNumber()).toBe(-0.75);
  });
});

describe('toString', () => {
  it('renders the reduced fraction', () => {
    expect(Rational.of(4n, 8n).toString()).toBe('1/2');
  });
});
