/**
 * seasonality.test.ts — Tests for bloom and presence logic
 */
import { describe, test, expect } from 'bun:test';
import { isBloomingInMonth, isInTempRange, formatBloomPeriod } from '../src/lib/seasonality.ts';

describe('isBloomingInMonth', () => {
  test('normal range — month in range', () => {
    expect(isBloomingInMonth(3, 9, 5)).toBe(true);
  });

  test('normal range — month at start', () => {
    expect(isBloomingInMonth(3, 9, 3)).toBe(true);
  });

  test('normal range — month at end', () => {
    expect(isBloomingInMonth(3, 9, 9)).toBe(true);
  });

  test('normal range — month before start', () => {
    expect(isBloomingInMonth(3, 9, 2)).toBe(false);
  });

  test('normal range — month after end', () => {
    expect(isBloomingInMonth(3, 9, 10)).toBe(false);
  });

  test('wrap-around (Nov–Feb) — month in range (December)', () => {
    expect(isBloomingInMonth(11, 2, 12)).toBe(true);
  });

  test('wrap-around (Nov–Feb) — month in range (January)', () => {
    expect(isBloomingInMonth(11, 2, 1)).toBe(true);
  });

  test('wrap-around (Nov–Feb) — month in range (November)', () => {
    expect(isBloomingInMonth(11, 2, 11)).toBe(true);
  });

  test('wrap-around (Nov–Feb) — month in range (February)', () => {
    expect(isBloomingInMonth(11, 2, 2)).toBe(true);
  });

  test('wrap-around (Nov–Feb) — month out of range (March)', () => {
    expect(isBloomingInMonth(11, 2, 3)).toBe(false);
  });

  test('wrap-around (Nov–Feb) — month out of range (October)', () => {
    expect(isBloomingInMonth(11, 2, 10)).toBe(false);
  });

  test('null values return false', () => {
    expect(isBloomingInMonth(null, null, 6)).toBe(false);
    expect(isBloomingInMonth(3, null, 6)).toBe(false);
    expect(isBloomingInMonth(null, 9, 6)).toBe(false);
  });
});

describe('isInTempRange', () => {
  test('no range restriction — always true', () => {
    expect(isInTempRange(null, null, 25)).toBe(true);
  });

  test('temp within range', () => {
    expect(isInTempRange(0, 30, 15)).toBe(true);
  });

  test('temp at min boundary', () => {
    expect(isInTempRange(0, 30, 0)).toBe(true);
  });

  test('temp at max boundary', () => {
    expect(isInTempRange(0, 30, 30)).toBe(true);
  });

  test('temp below min', () => {
    expect(isInTempRange(5, 25, 3)).toBe(false);
  });

  test('temp above max', () => {
    expect(isInTempRange(5, 25, 26)).toBe(false);
  });

  test('only min set — temp above min', () => {
    expect(isInTempRange(10, null, 20)).toBe(true);
  });

  test('only min set — temp below min', () => {
    expect(isInTempRange(10, null, 5)).toBe(false);
  });

  test('only max set — temp below max', () => {
    expect(isInTempRange(null, 20, 15)).toBe(true);
  });

  test('only max set — temp above max', () => {
    expect(isInTempRange(null, 20, 25)).toBe(false);
  });
});

describe('formatBloomPeriod', () => {
  test('normal range', () => {
    expect(formatBloomPeriod(3, 5)).toBe('March – May');
  });

  test('single month', () => {
    expect(formatBloomPeriod(6, 6)).toBe('June');
  });

  test('wrap-around', () => {
    expect(formatBloomPeriod(11, 2)).toBe('November – February');
  });

  test('null values return Year-round', () => {
    expect(formatBloomPeriod(null, null)).toBe('Year-round');
  });
});
