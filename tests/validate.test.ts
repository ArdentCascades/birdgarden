/**
 * validate.test.ts — Input validation boundary cases
 *
 * Tests all validation functions with:
 *   - Valid inputs (should pass)
 *   - Boundary values
 *   - Empty strings
 *   - Overlong inputs
 *   - Special characters / injection attempts
 *   - Negative numbers
 *   - Non-integer values where integers expected
 *   - Path traversal attempts (for validateSlug)
 *   - FTS5 injection attempts (for validateSearch)
 */
import { describe, test, expect } from 'bun:test';
import {
  ValidationError,
  validateSlug,
  validateMonth,
  validateTemp,
  validateLimit,
  validateOffset,
  validateSearch,
  validatePlantList,
  validatePositiveIntId,
} from '../src/lib/validate.ts';

// Helper — expect a function to throw ValidationError
function expectValidationError(fn: () => unknown) {
  expect(fn).toThrow(ValidationError);
}

describe('validateSlug', () => {
  test('valid slug', () => expect(validateSlug('northern-cardinal')).toBe('northern-cardinal'));
  test('single char slug', () => expect(validateSlug('a')).toBe('a'));
  test('slug with numbers', () => expect(validateSlug('oak-123')).toBe('oak-123'));

  test('empty string', () => expectValidationError(() => validateSlug('')));
  test('uppercase letters', () => expectValidationError(() => validateSlug('Northern-Cardinal')));
  test('spaces', () => expectValidationError(() => validateSlug('northern cardinal')));
  test('leading hyphen', () => expectValidationError(() => validateSlug('-northern-cardinal')));
  test('trailing hyphen', () => expectValidationError(() => validateSlug('northern-cardinal-')));
  test('path traversal ../', () => expectValidationError(() => validateSlug('../etc/passwd')));
  test('path traversal /', () => expectValidationError(() => validateSlug('/etc/passwd')));
  test('SQL injection attempt', () => expectValidationError(() => validateSlug("'; DROP TABLE--")));
  test('null byte', () => expectValidationError(() => validateSlug('slug\x00evil')));
  test('too long (101 chars)', () => expectValidationError(() => validateSlug('a'.repeat(101))));
  test('non-string', () => expectValidationError(() => validateSlug(42)));
  test('undefined', () => expectValidationError(() => validateSlug(undefined)));
});

describe('validateMonth', () => {
  test('valid months 1–12', () => {
    for (let m = 1; m <= 12; m++) {
      expect(validateMonth(m)).toBe(m);
    }
  });
  test('string "6"', () => expect(validateMonth('6')).toBe(6));
  test('month 0', () => expectValidationError(() => validateMonth(0)));
  test('month 13', () => expectValidationError(() => validateMonth(13)));
  test('negative month', () => expectValidationError(() => validateMonth(-1)));
  test('float month', () => expectValidationError(() => validateMonth(6.5)));
  test('NaN', () => expectValidationError(() => validateMonth(NaN)));
  test('non-numeric string', () => expectValidationError(() => validateMonth('june')));
  test('empty string', () => expectValidationError(() => validateMonth('')));
});

describe('validateTemp', () => {
  test('valid temp 0', () => expect(validateTemp(0)).toBe(0));
  test('valid temp 25.5', () => expect(validateTemp(25.5)).toBe(25.5));
  test('boundary -60', () => expect(validateTemp(-60)).toBe(-60));
  test('boundary 60', () => expect(validateTemp(60)).toBe(60));
  test('below -60', () => expectValidationError(() => validateTemp(-61)));
  test('above 60', () => expectValidationError(() => validateTemp(61)));
  test('Infinity', () => expectValidationError(() => validateTemp(Infinity)));
  test('-Infinity', () => expectValidationError(() => validateTemp(-Infinity)));
  test('NaN', () => expectValidationError(() => validateTemp(NaN)));
  test('non-numeric string', () => expectValidationError(() => validateTemp('warm')));
});

describe('validateLimit', () => {
  test('valid limit 20', () => expect(validateLimit(20)).toBe(20));
  test('boundary 1', () => expect(validateLimit(1)).toBe(1));
  test('boundary 100', () => expect(validateLimit(100)).toBe(100));
  test('limit 0', () => expectValidationError(() => validateLimit(0)));
  test('limit 101', () => expectValidationError(() => validateLimit(101)));
  test('float', () => expectValidationError(() => validateLimit(20.5)));
  test('negative', () => expectValidationError(() => validateLimit(-1)));
});

describe('validateOffset', () => {
  test('valid offset 0', () => expect(validateOffset(0)).toBe(0));
  test('valid offset 100', () => expect(validateOffset(100)).toBe(100));
  test('boundary 10000', () => expect(validateOffset(10000)).toBe(10000));
  test('above max', () => expectValidationError(() => validateOffset(10001)));
  test('negative', () => expectValidationError(() => validateOffset(-1)));
  test('float', () => expectValidationError(() => validateOffset(1.5)));
});

describe('validateSearch', () => {
  test('normal search query', () => {
    const result = validateSearch('red-tailed hawk');
    expect(result).toBe('red-tailed hawk');
  });

  test('strips control characters', () => {
    expect(validateSearch('bird\x00song')).toBe('birdsong');
    expect(validateSearch('bird\x1fsong')).toBe('birdsong');
  });

  test('removes FTS5 special chars *', () => {
    expect(validateSearch('bird*')).toBe('bird');
  });

  test('removes FTS5 boolean operators AND', () => {
    const result = validateSearch('bird AND tree');
    expect(result).not.toContain('AND');
  });

  test('removes FTS5 boolean operators OR', () => {
    const result = validateSearch('bird OR tree');
    expect(result).not.toContain('OR');
  });

  test('removes FTS5 boolean operators NOT', () => {
    const result = validateSearch('bird NOT tree');
    expect(result).not.toContain('NOT');
  });

  test('removes NEAR operator', () => {
    const result = validateSearch('bird NEAR tree');
    expect(result).not.toContain('NEAR');
  });

  test('limits length to 200 chars', () => {
    const long = 'a'.repeat(300);
    expect(validateSearch(long).length).toBe(200);
  });

  test('non-string throws', () => expectValidationError(() => validateSearch(42)));
  test('empty string returns empty string', () => expect(validateSearch('')).toBe(''));
});

describe('validatePlantList', () => {
  test('valid comma-separated slugs', () => {
    const result = validatePlantList('redbud,coneflower,serviceberry');
    expect(result).toEqual(['redbud', 'coneflower', 'serviceberry']);
  });

  test('caps at 50 plants', () => {
    const many = Array.from({ length: 60 }, (_, i) => `plant-${i}`).join(',');
    expect(validatePlantList(many)).toHaveLength(50);
  });

  test('invalid slug in list throws', () => {
    expectValidationError(() => validatePlantList('redbud,../etc/passwd,coneflower'));
  });

  test('non-string throws', () => expectValidationError(() => validatePlantList(42)));
});

describe('validatePositiveIntId', () => {
  test('valid id 1', () => expect(validatePositiveIntId(1)).toBe(1));
  test('valid id 999', () => expect(validatePositiveIntId(999)).toBe(999));
  test('string "42"', () => expect(validatePositiveIntId('42')).toBe(42));
  test('id 0', () => expectValidationError(() => validatePositiveIntId(0)));
  test('negative id', () => expectValidationError(() => validatePositiveIntId(-1)));
  test('float id', () => expectValidationError(() => validatePositiveIntId(1.5)));
  test('string path traversal', () => expectValidationError(() => validatePositiveIntId('../1')));
  test('too large', () => expectValidationError(() => validatePositiveIntId(2_147_483_648)));
});
