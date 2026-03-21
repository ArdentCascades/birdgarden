/**
 * api.test.ts — API endpoint tests
 * Implemented in Task 5.
 */
import { describe, test, expect } from 'bun:test';

describe('GET /api/regions', () => {
  test.todo('returns 200 with regions array');
  test.todo('filters by level');
  test.todo('filters by parent_id');
  test.todo('returns lat/lng for client-side geolocation');
  test.todo('rate limits after 60 requests per minute');
});

describe('GET /api/plants', () => {
  test.todo('returns 200 with plants for valid region');
  test.todo('returns 400 for missing region');
  test.todo('returns 400 for invalid region slug');
  test.todo('returns 400 for invalid month');
  test.todo('filters by month (blooming now)');
  test.todo('filters by plant type');
  test.todo('sorts by birds (default)');
  test.todo('sorts alphabetically');
  test.todo('FTS5 search works');
  test.todo('pagination with limit and offset');
  test.todo('never exposes SQL errors in response body');
  test.todo('generic error response on server error');
});

describe('GET /api/birds', () => {
  test.todo('returns birds for plant + region + month');
  test.todo('returns 400 for missing required params');
  test.todo('filters by temperature range');
  test.todo('returns songs with each bird');
});

describe('GET /api/songs/[id]', () => {
  test.todo('returns 200 with audio stream for valid id');
  test.todo('returns 400 for non-integer id');
  test.todo('returns 400 for negative id');
  test.todo('returns 400 for path traversal attempt');
  test.todo('returns 404 for unknown id');
  test.todo('supports HTTP Range headers for seeking');
  test.todo('sets Content-Disposition: inline');
  test.todo('path resolved stays within media root');
  test.todo('audio rate limits after 30 requests per minute');
});

describe('GET /api/garden/birds', () => {
  test.todo('returns combined bird list for multiple plants');
  test.todo('deduplicates birds across plants');
  test.todo('caps plant list at 50');
  test.todo('returns 400 for invalid slug in plant list');
});
