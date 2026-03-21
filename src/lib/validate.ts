/**
 * validate.ts — Centralized input validation module
 *
 * All API endpoints MUST call these validators before passing any input
 * to query functions. Invalid input throws ValidationError, which the
 * API route converts to a 400 response with a generic message.
 *
 * Rules:
 *   - Never expose internal details in error messages
 *   - All validators return the validated (and possibly sanitized) value
 *   - Fail closed: when in doubt, reject
 */

export class ValidationError extends Error {
  readonly code = 'VALIDATION_ERROR';

  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

// Slug pattern: lowercase alphanumeric and hyphens, 2–100 chars
// Must start and end with alphanumeric character
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,98}[a-z0-9]$|^[a-z0-9]$/;

const MAX_LIMIT = 100;
const MAX_OFFSET = 10_000;
const MAX_SEARCH_LENGTH = 200;

export const MAX_GARDEN_PLANTS = 50;

export function validateSlug(input: unknown): string {
  if (typeof input !== 'string' || !SLUG_PATTERN.test(input)) {
    throw new ValidationError('Invalid identifier');
  }
  return input;
}

export function validateMonth(input: unknown): number {
  const month = Number(input);
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new ValidationError('Invalid month');
  }
  return month;
}

export function validateTemp(input: unknown): number {
  const temp = Number(input);
  if (!Number.isFinite(temp) || temp < -60 || temp > 60) {
    throw new ValidationError('Invalid temperature');
  }
  return temp;
}

export function validateLimit(input: unknown): number {
  const limit = Number(input);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw new ValidationError('Invalid limit');
  }
  return limit;
}

export function validateOffset(input: unknown): number {
  const offset = Number(input);
  if (!Number.isInteger(offset) || offset < 0 || offset > MAX_OFFSET) {
    throw new ValidationError('Invalid offset');
  }
  return offset;
}

/**
 * Sanitize and validate free-text search input.
 * - Strips ASCII control characters
 * - Limits length to MAX_SEARCH_LENGTH
 * - Removes FTS5 special characters that could cause query parse errors
 * - Removes FTS5 boolean operators to prevent operator injection
 */
export function validateSearch(input: unknown): string {
  if (typeof input !== 'string') throw new ValidationError('Invalid search');

  // Strip ASCII control characters (0x00–0x1F)
  // Limit length
  const cleaned = input
    .replace(/[\x00-\x1f]/g, '')
    .slice(0, MAX_SEARCH_LENGTH);

  // Remove FTS5 special characters: * " and boolean keywords
  return cleaned
    .replace(/[*"]/g, '')
    .replace(/\b(NEAR|AND|OR|NOT)\b/gi, ' ')
    .trim();
}

export function validatePlantList(input: unknown): string[] {
  if (typeof input !== 'string') throw new ValidationError('Invalid plant list');

  const slugs = input.split(',').slice(0, MAX_GARDEN_PLANTS);
  return slugs.map((s) => validateSlug(s.trim()));
}

/** Validate plant sort parameter */
export function validatePlantSort(input: unknown): 'birds' | 'alpha' | 'bloom' {
  if (input === 'birds' || input === 'alpha' || input === 'bloom') return input;
  throw new ValidationError('Invalid sort parameter');
}

/** Validate plant type filter */
export function validatePlantType(input: unknown): 'tree' | 'shrub' | 'perennial' | 'grass' | 'vine' {
  const valid = ['tree', 'shrub', 'perennial', 'grass', 'vine'];
  if (typeof input === 'string' && valid.includes(input)) {
    return input as 'tree' | 'shrub' | 'perennial' | 'grass' | 'vine';
  }
  throw new ValidationError('Invalid plant type');
}

/** Validate region level filter */
export function validateRegionLevel(
  input: unknown,
): 'continent' | 'country' | 'state_province' | 'ecoregion' | 'hardiness_zone' {
  const valid = ['continent', 'country', 'state_province', 'ecoregion', 'hardiness_zone'];
  if (typeof input === 'string' && valid.includes(input)) {
    return input as 'continent' | 'country' | 'state_province' | 'ecoregion' | 'hardiness_zone';
  }
  throw new ValidationError('Invalid region level');
}

/** Validate a positive integer ID (for song/image IDs from URL params) */
export function validatePositiveIntId(input: unknown): number {
  const id = Number(input);
  if (!Number.isInteger(id) || id < 1 || id > 2_147_483_647) {
    throw new ValidationError('Invalid identifier');
  }
  return id;
}

/** Validate optional boolean parameter (from query string: "true" | "false" | "1" | "0") */
export function validateOptionalBool(input: unknown): boolean | undefined {
  if (input === undefined || input === null || input === '') return undefined;
  if (input === 'true' || input === '1') return true;
  if (input === 'false' || input === '0') return false;
  throw new ValidationError('Invalid boolean parameter');
}
