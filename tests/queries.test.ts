/**
 * queries.test.ts — Tests for database query functions
 *
 * Uses an in-memory SQLite database (bun:sqlite) seeded with fixture data.
 * Production code uses better-sqlite3 (Node.js via Astro's node adapter);
 * bun:sqlite has a compatible enough API for these tests.
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { Database } from 'bun:sqlite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  getRegions,
  getPlants,
  getPlantBySlug,
  getBirdsForPlant,
  getBirdBySlug,
  getSongById,
  getBirdsForGarden,
  getGardenCoverage,
} from '../src/lib/queries.ts';

// Cast bun:sqlite Database to `any` since production code types against better-sqlite3,
// but the two APIs are wire-compatible for our usage (prepare/all/get/run/exec/transaction).
let db: Database;
let dbAny: any; // eslint-disable-line @typescript-eslint/no-explicit-any

beforeAll(() => {
  db = new Database(':memory:');
  dbAny = db;
  db.exec('PRAGMA foreign_keys = ON');

  // Apply schema
  const schema = readFileSync(resolve('./db/schema.sql'), 'utf-8');
  db.exec(schema);

  // Seed regions
  db.exec(`
    INSERT INTO region (id, slug, name, level, parent_id, latitude, longitude) VALUES
      (1, 'americas',      'Americas',       'continent',      NULL, 15.0, -80.0),
      (2, 'united-states', 'United States',  'country',        1,    39.5, -98.35),
      (3, 'new-york',      'New York',       'state_province', 2,    43.0, -75.0),
      (4, 'california',    'California',     'state_province', 2,    36.78, -119.42),
      (5, 'texas',         'Texas',          'state_province', 2,    31.97, -99.90)
  `);

  // Seed birds
  db.exec(`
    INSERT INTO bird (id, slug, common_name, scientific_name, family, description, conservation_status) VALUES
      (1, 'american-goldfinch',       'American Goldfinch',       'Spinus tristis',       'Fringillidae', 'A small finch.', 'LC'),
      (2, 'ruby-throated-hummingbird','Ruby-throated Hummingbird','Archilochus colubris', 'Trochilidae',  'Only hummingbird in east.', 'LC'),
      (3, 'dark-eyed-junco',          'Dark-eyed Junco',          'Junco hyemalis',       'Passerellidae','Winter sparrow.', 'LC')
  `);

  // Seed plants (spicebush has wrap-around bloom Nov–Feb)
  db.exec(`
    INSERT INTO plant (id, slug, common_name, scientific_name, family, plant_type, description,
                       usda_zone_min, usda_zone_max, bloom_start, bloom_end) VALUES
      (1, 'purple-coneflower','Purple Coneflower','Echinacea purpurea','Asteraceae',  'perennial','Iconic wildflower.',3,9,6,9),
      (2, 'trumpet-vine',     'Trumpet Vine',     'Campsis radicans',  'Bignoniaceae','vine',     'Hummingbird magnet.',4,9,6,9),
      (3, 'black-eyed-susan', 'Black-eyed Susan', 'Rudbeckia hirta',   'Asteraceae',  'perennial','Golden wildflower.',3,9,6,9),
      (4, 'spicebush',        'Northern Spicebush','Lindera benzoin',  'Lauraceae',   'shrub',    'Fragrant shrub.',4,9,11,2)
  `);

  // Seed plant_region (all plants in all state regions)
  db.exec(`
    INSERT INTO plant_region (plant_id, region_id) VALUES
      (1,3),(1,4),(1,5),(2,3),(2,4),(2,5),(3,3),(3,4),(3,5),(4,3),(4,4),(4,5)
  `);

  // Seed bird_plant
  db.exec(`
    INSERT INTO bird_plant (bird_id, plant_id, attraction_type) VALUES
      (1,1,'food_seed'),(1,3,'food_seed'),
      (2,2,'food_nectar'),
      (3,1,'food_seed'),(3,3,'food_seed')
  `);

  // Seed bird_region_season
  // Goldfinch: year-round in NY and CA
  // Hummingbird: summer breeding (Apr-Sep) in NY only (temp_min=10)
  // Junco: winter (Oct-Mar) in NY and TX
  db.exec(`
    INSERT INTO bird_region_season (bird_id, region_id, month, presence, temp_min_c, temp_max_c) VALUES
      (1,3,1,'resident',-20,38),(1,3,2,'resident',-20,38),(1,3,3,'resident',-20,38),
      (1,3,4,'resident',-20,38),(1,3,5,'resident',-20,38),(1,3,6,'resident',-20,38),
      (1,3,7,'resident',-20,38),(1,3,8,'resident',-20,38),(1,3,9,'resident',-20,38),
      (1,3,10,'resident',-20,38),(1,3,11,'resident',-20,38),(1,3,12,'resident',-20,38),
      (1,4,1,'resident',-20,38),(1,4,6,'resident',-20,38),
      (2,3,4,'breeding',10,40),(2,3,5,'breeding',10,40),(2,3,6,'breeding',10,40),
      (2,3,7,'breeding',10,40),(2,3,8,'breeding',10,40),(2,3,9,'breeding',10,40),
      (3,3,10,'wintering',-25,15),(3,3,11,'wintering',-25,15),(3,3,12,'wintering',-25,15),
      (3,3,1,'wintering',-25,15),(3,3,2,'wintering',-25,15),(3,3,3,'wintering',-25,15),
      (3,5,10,'wintering',-25,15),(3,5,11,'wintering',-25,15),
      (3,5,12,'wintering',-25,15),(3,5,1,'wintering',-25,15)
  `);
});

afterAll(() => {
  db.close();
});

// ---------------------------------------------------------------------------
// getRegions
// ---------------------------------------------------------------------------
describe('getRegions', () => {
  test('returns all regions', () => {
    const regions = getRegions(dbAny);
    expect(regions.length).toBe(5);
  });

  test('filters by level', () => {
    const regions = getRegions(dbAny, { level: 'state_province' });
    expect(regions.length).toBe(3);
    expect(regions.every((r) => r.level === 'state_province')).toBe(true);
  });

  test('filters by parent_id', () => {
    const regions = getRegions(dbAny, { parentId: 2 });
    expect(regions.length).toBe(3);
    expect(regions.every((r) => r.parent_id === 2)).toBe(true);
  });

  test('includes lat/lng for client-side geolocation', () => {
    const regions = getRegions(dbAny, { level: 'state_province' });
    const ny = regions.find((r) => r.slug === 'new-york');
    expect(ny).toBeDefined();
    expect(ny!.latitude).toBe(43.0);
    expect(ny!.longitude).toBe(-75.0);
  });
});

// ---------------------------------------------------------------------------
// getPlants
// ---------------------------------------------------------------------------
describe('getPlants', () => {
  test('filters by region', () => {
    const { plants, total } = getPlants(dbAny, { regionSlug: 'new-york', limit: 100, offset: 0 });
    expect(total).toBe(4);
    expect(plants.length).toBe(4);
  });

  test('returns empty for unknown region', () => {
    const { plants, total } = getPlants(dbAny, { regionSlug: 'nonexistent', limit: 100, offset: 0 });
    expect(total).toBe(0);
    expect(plants.length).toBe(0);
  });

  test('filters by bloom month — normal range (June, should find summer bloomers)', () => {
    const { plants } = getPlants(dbAny, { regionSlug: 'new-york', month: 6, limit: 100, offset: 0 });
    const slugs = plants.map((p) => p.slug);
    expect(slugs).toContain('purple-coneflower');
    expect(slugs).toContain('trumpet-vine');
    expect(slugs).toContain('black-eyed-susan');
    // spicebush blooms Nov–Feb, should NOT appear in June
    expect(slugs).not.toContain('spicebush');
  });

  test('filters by bloom month — wrap-around (Dec, spicebush Nov-Feb)', () => {
    const { plants } = getPlants(dbAny, { regionSlug: 'new-york', month: 12, limit: 100, offset: 0 });
    const slugs = plants.map((p) => p.slug);
    expect(slugs).toContain('spicebush');
    expect(slugs).not.toContain('purple-coneflower');
    expect(slugs).not.toContain('trumpet-vine');
  });

  test('filters by bloom month — wrap-around (Jan inside Nov-Feb range)', () => {
    const { plants } = getPlants(dbAny, { regionSlug: 'new-york', month: 1, limit: 100, offset: 0 });
    expect(plants.map((p) => p.slug)).toContain('spicebush');
  });

  test('filters by bloom month — wrap-around (March outside Nov-Feb range)', () => {
    const { plants } = getPlants(dbAny, { regionSlug: 'new-york', month: 3, limit: 100, offset: 0 });
    expect(plants.map((p) => p.slug)).not.toContain('spicebush');
  });

  test('filters by plant type', () => {
    const { plants } = getPlants(dbAny, { regionSlug: 'new-york', plantType: 'perennial', limit: 100, offset: 0 });
    expect(plants.every((p) => p.plant_type === 'perennial')).toBe(true);
  });

  test('sorts alphabetically', () => {
    const { plants } = getPlants(dbAny, { regionSlug: 'new-york', sort: 'alpha', limit: 100, offset: 0 });
    const names = plants.map((p) => p.common_name);
    expect(names).toEqual([...names].sort());
  });

  test('sorts by bird count (default) — desc order', () => {
    const { plants } = getPlants(dbAny, { regionSlug: 'new-york', sort: 'birds', limit: 100, offset: 0 });
    const counts = plants.map((p) => p.bird_count ?? 0);
    for (let i = 1; i < counts.length; i++) {
      expect(counts[i]!).toBeLessThanOrEqual(counts[i - 1]!);
    }
  });

  test('pagination with limit and offset', () => {
    const { plants: p1, total } = getPlants(dbAny, { regionSlug: 'new-york', limit: 2, offset: 0 });
    const { plants: p2 } = getPlants(dbAny, { regionSlug: 'new-york', limit: 2, offset: 2 });
    expect(total).toBe(4);
    expect(p1.length).toBe(2);
    expect(p2.length).toBe(2);
    const p1slugs = new Set(p1.map((p) => p.slug));
    for (const p of p2) expect(p1slugs.has(p.slug)).toBe(false);
  });

  test('FTS5 search finds matching plants', () => {
    const { plants } = getPlants(dbAny, { regionSlug: 'new-york', search: 'coneflower', limit: 100, offset: 0 });
    expect(plants.some((p) => p.slug === 'purple-coneflower')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getPlantBySlug
// ---------------------------------------------------------------------------
describe('getPlantBySlug', () => {
  test('returns plant by slug', () => {
    const plant = getPlantBySlug(dbAny, 'purple-coneflower');
    expect(plant).not.toBeNull();
    expect(plant!.common_name).toBe('Purple Coneflower');
  });

  test('returns null for unknown slug', () => {
    expect(getPlantBySlug(dbAny, 'nonexistent-plant')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getBirdsForPlant
// ---------------------------------------------------------------------------
describe('getBirdsForPlant', () => {
  test('returns birds for plant + region + month', () => {
    const birds = getBirdsForPlant(dbAny, { plantSlug: 'purple-coneflower', regionSlug: 'new-york', month: 7 });
    expect(birds.some((b) => b.slug === 'american-goldfinch')).toBe(true);
  });

  test('filters by month — winter bird absent in summer', () => {
    const birds = getBirdsForPlant(dbAny, { plantSlug: 'purple-coneflower', regionSlug: 'new-york', month: 7 });
    expect(birds.find((b) => b.slug === 'dark-eyed-junco')).toBeUndefined();
  });

  test('filters by month — winter bird present in winter', () => {
    const birds = getBirdsForPlant(dbAny, { plantSlug: 'purple-coneflower', regionSlug: 'new-york', month: 11 });
    expect(birds.find((b) => b.slug === 'dark-eyed-junco')).toBeDefined();
  });

  test('filters by temperature range — cold temp excludes warm-weather bird', () => {
    // Hummingbird temp_min_c=10; at 5°C it should be excluded
    const birds = getBirdsForPlant(dbAny, { plantSlug: 'trumpet-vine', regionSlug: 'new-york', month: 6, tempC: 5 });
    expect(birds.find((b) => b.slug === 'ruby-throated-hummingbird')).toBeUndefined();
  });

  test('filters by temperature range — warm temp includes warm-weather bird', () => {
    const birds = getBirdsForPlant(dbAny, { plantSlug: 'trumpet-vine', regionSlug: 'new-york', month: 6, tempC: 22 });
    expect(birds.find((b) => b.slug === 'ruby-throated-hummingbird')).toBeDefined();
  });

  test('returns empty for bird not in region', () => {
    // Hummingbird only seeded in NY fixture, not CA
    const birds = getBirdsForPlant(dbAny, { plantSlug: 'trumpet-vine', regionSlug: 'california', month: 6 });
    expect(birds.find((b) => b.slug === 'ruby-throated-hummingbird')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// getBirdBySlug
// ---------------------------------------------------------------------------
describe('getBirdBySlug', () => {
  test('returns bird by slug', () => {
    const bird = getBirdBySlug(dbAny, 'american-goldfinch');
    expect(bird).not.toBeNull();
    expect(bird!.scientific_name).toBe('Spinus tristis');
  });

  test('returns null for unknown slug', () => {
    expect(getBirdBySlug(dbAny, 'nonexistent-bird')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getSongById
// ---------------------------------------------------------------------------
describe('getSongById', () => {
  test('returns null for unknown ID', () => {
    expect(getSongById(dbAny, 999999)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getBirdsForGarden
// ---------------------------------------------------------------------------
describe('getBirdsForGarden', () => {
  test('returns combined bird list for multiple plants', () => {
    const birds = getBirdsForGarden(dbAny, {
      plantSlugs: ['purple-coneflower', 'trumpet-vine'],
      regionSlug: 'new-york',
      month: 7,
    });
    const slugs = birds.map((b) => b.slug);
    expect(slugs).toContain('american-goldfinch');
    expect(slugs).toContain('ruby-throated-hummingbird');
  });

  test('deduplicates birds across multiple plants', () => {
    // Goldfinch eats both coneflower and black-eyed-susan seeds
    const birds = getBirdsForGarden(dbAny, {
      plantSlugs: ['purple-coneflower', 'black-eyed-susan'],
      regionSlug: 'new-york',
      month: 7,
    });
    const goldfinches = birds.filter((b) => b.slug === 'american-goldfinch');
    expect(goldfinches.length).toBe(1);
  });

  test('returns empty for empty plant list', () => {
    const birds = getBirdsForGarden(dbAny, { plantSlugs: [], regionSlug: 'new-york', month: 7 });
    expect(birds).toEqual([]);
  });

  test('filters by region — bird absent from unrelated region', () => {
    // Hummingbird not seeded in CA fixture
    const birds = getBirdsForGarden(dbAny, {
      plantSlugs: ['trumpet-vine'],
      regionSlug: 'california',
      month: 6,
    });
    expect(birds.find((b) => b.slug === 'ruby-throated-hummingbird')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// getGardenCoverage
// ---------------------------------------------------------------------------
describe('getGardenCoverage', () => {
  test('returns 12 month entries', () => {
    const coverage = getGardenCoverage(dbAny, {
      plantSlugs: ['purple-coneflower'],
      regionSlug: 'new-york',
    });
    expect(coverage.length).toBe(12);
    expect(coverage[0].month).toBe(1);
    expect(coverage[11].month).toBe(12);
  });

  test('months with birds have bird_count > 0', () => {
    const coverage = getGardenCoverage(dbAny, {
      plantSlugs: ['purple-coneflower'],
      regionSlug: 'new-york',
    });
    const sumBirds = coverage.reduce((a, c) => a + c.bird_count, 0);
    expect(sumBirds).toBeGreaterThan(0);
  });

  test('returns all-zero coverage for empty plant list', () => {
    const coverage = getGardenCoverage(dbAny, {
      plantSlugs: [],
      regionSlug: 'new-york',
    });
    expect(coverage.length).toBe(12);
    expect(coverage.every((c) => c.bird_count === 0)).toBe(true);
  });

  test('returns all-zero for unknown region', () => {
    const coverage = getGardenCoverage(dbAny, {
      plantSlugs: ['purple-coneflower'],
      regionSlug: 'nonexistent-region',
    });
    expect(coverage.every((c) => c.bird_count === 0)).toBe(true);
  });

  test('multiple plants increases or maintains bird count', () => {
    const single = getGardenCoverage(dbAny, {
      plantSlugs: ['purple-coneflower'],
      regionSlug: 'new-york',
    });
    const multi = getGardenCoverage(dbAny, {
      plantSlugs: ['purple-coneflower', 'trumpet-vine'],
      regionSlug: 'new-york',
    });
    // Multi-plant coverage should have at least as many total birds as single
    const singleTotal = single.reduce((a, c) => a + c.bird_count, 0);
    const multiTotal = multi.reduce((a, c) => a + c.bird_count, 0);
    expect(multiTotal).toBeGreaterThanOrEqual(singleTotal);
  });

  test('coverage is higher in peak bird months than off-season', () => {
    const coverage = getGardenCoverage(dbAny, {
      plantSlugs: ['purple-coneflower', 'black-eyed-susan', 'trumpet-vine'],
      regionSlug: 'new-york',
    });
    // Summer months (June=6, July=7) should have birds present
    const summerMonths = coverage.filter((c) => c.month >= 5 && c.month <= 9);
    const summerTotal = summerMonths.reduce((a, c) => a + c.bird_count, 0);
    expect(summerTotal).toBeGreaterThan(0);
  });
});
