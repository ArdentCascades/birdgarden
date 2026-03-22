/**
 * seasonality.ts — Month/temperature filtering logic
 *
 * Handles:
 *   - Wrap-around bloom periods (e.g., Nov–Feb: bloom_start > bloom_end)
 *   - Temperature range filtering
 *   - Current month detection
 */

/**
 * Check if a plant is currently blooming in the given month.
 * Handles wrap-around periods (e.g., bloom_start=11, bloom_end=2 = Nov–Feb).
 */
export function isBloomingInMonth(
  bloomStart: number | null,
  bloomEnd: number | null,
  month: number,
): boolean {
  if (bloomStart === null || bloomEnd === null) return false;

  if (bloomStart <= bloomEnd) {
    // Normal case: e.g., March (3) to September (9)
    return month >= bloomStart && month <= bloomEnd;
  } else {
    // Wrap-around: e.g., November (11) to February (2)
    return month >= bloomStart || month <= bloomEnd;
  }
}

/**
 * Check if a bird's temperature range includes the given temperature.
 */
export function isInTempRange(
  tempMinC: number | null,
  tempMaxC: number | null,
  currentTempC: number,
): boolean {
  if (tempMinC === null && tempMaxC === null) return true; // No range restriction
  if (tempMinC !== null && currentTempC < tempMinC) return false;
  if (tempMaxC !== null && currentTempC > tempMaxC) return false;
  return true;
}

/**
 * Convert Fahrenheit to Celsius.
 */
export function fahrenheitToCelsius(f: number): number {
  return (f - 32) * (5 / 9);
}

/**
 * Get the current month (1–12).
 * Extracted as a function so it can be mocked in tests.
 */
export function getCurrentMonth(): number {
  return new Date().getMonth() + 1;
}

/** Full month names, index 0 = January. */
export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

/**
 * Get a human-readable month name from a month number (1–12).
 */
export function getMonthName(month: number): string {
  return MONTH_NAMES[month - 1] ?? 'Unknown';
}

/**
 * Format a bloom period as a human-readable string.
 * e.g., bloomStart=3, bloomEnd=5 → "March – May"
 * e.g., bloomStart=11, bloomEnd=2 → "November – February"
 */
export function formatBloomPeriod(bloomStart: number | null, bloomEnd: number | null): string {
  if (bloomStart === null || bloomEnd === null) return 'Year-round';
  if (bloomStart === bloomEnd) return getMonthName(bloomStart);
  return `${getMonthName(bloomStart)} – ${getMonthName(bloomEnd)}`;
}
