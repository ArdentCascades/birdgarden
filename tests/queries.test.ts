/**
 * queries.test.ts — Tests for database query functions
 * Implemented in Task 5.
 */
import { describe, test, expect } from 'bun:test';

describe('queries', () => {
  test.todo('getRegions returns all regions');
  test.todo('getPlants filters by region');
  test.todo('getPlants filters by bloom month (wrap-around)');
  test.todo('getBirdsForPlant filters by month and region');
  test.todo('getBirdsForPlant filters by temperature range');
  test.todo('getSongById returns null for unknown ID');
  test.todo('getBirdsForGarden deduplicates across multiple plants');
});
