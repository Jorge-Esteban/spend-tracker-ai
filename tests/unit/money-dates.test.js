import { describe, expect, it } from 'vitest';
import { lastMonths, monthKey, monthRange, shiftMonth } from '../../src/lib/dates.js';
import { centsToDecimal, scaledToCents, toCents } from '../../src/lib/money.js';

describe('toCents', () => {
  it.each([
    [12.34, 1234],
    ['12,34', 1234],
    ['12.3', 1230],
    ['7', 700],
    [0.1 + 0.2, 30],
  ])('%s -> %s', (input, expected) => expect(toCents(input)).toBe(expected));

  it.each([['abc'], ['1.234'], [''], [NaN], [Infinity], [null]])('rechaza %s', (input) => {
    expect(toCents(input)).toBeNaN();
  });
});

describe('centsToDecimal', () => {
  it('formatea con dos decimales', () => {
    expect(centsToDecimal(1234)).toBe('12.34');
    expect(centsToDecimal(5)).toBe('0.05');
    expect(centsToDecimal(-1500)).toBe('-15.00');
  });
});

describe('scaledToCents (importes Tink v2)', () => {
  it.each([
    ['-1300', '1', -13000], // -130.0
    ['-1300', '2', -1300], // -13.00
    ['-13', '0', -1300], // -13
    ['-12345', '3', -1235], // -12.345 -> redondeo
    ['-12344', '3', -1234],
    ['999', '2', 999],
  ])('unscaled %s scale %s -> %s céntimos', (u, s, expected) => {
    expect(scaledToCents(u, s)).toBe(expected);
  });

  it('lanza si scale no es entero', () => {
    expect(() => scaledToCents('100', 'x')).toThrow();
  });
});

describe('dates', () => {
  it('monthKey usa UTC', () => {
    expect(monthKey(new Date('2026-03-31T23:30:00Z'))).toBe('2026-03');
  });

  it('monthRange devuelve [inicio, fin)', () => {
    const { start, end } = monthRange('2026-12');
    expect(start.toISOString()).toBe('2026-12-01T00:00:00.000Z');
    expect(end.toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });

  it('shiftMonth y lastMonths cruzan años', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(lastMonths('2026-02', 3)).toEqual(['2025-12', '2026-01', '2026-02']);
  });
});
