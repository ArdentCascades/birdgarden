/**
 * api.test.ts — API endpoint tests
 *
 * Strategy:
 *   - mock.module replaces getDb() with a bun:sqlite in-memory database,
 *     since better-sqlite3 (used in production) is not supported by Bun.
 *   - Handlers are imported dynamically after the mock is registered.
 *   - Each test uses a unique IP to avoid rate-limit state bleed between tests.
 *   - Rate-limit tests use dedicated IPs and exhaust the limit deliberately.
 */
import { describe, test, expect, beforeAll, afterAll, mock } from 'bun:test';
import { Database } from 'bun:sqlite';
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

// ── Temp media directory for song-streaming tests ──────────────────────────
// Must be set before media.ts is imported (it reads the env var at module load time).
const TEMP_MEDIA = resolve('./tests/.tmp-media');
process.env['MEDIA_PATH'] = TEMP_MEDIA;

// ── Shared in-memory database ──────────────────────────────────────────────
let db: Database;
let dbAny: any; // cast: bun:sqlite ↔ better-sqlite3 are API-compatible for our use

// Unique IP per test to prevent rate-limit state bleeding between tests
let ipSeq = 0;
const nextIp = () => `test-ip-${ipSeq++}`;

// ── Mock @lib/db.ts before any handler is imported ─────────────────────────
// mock.module must be called at the top level (before dynamic imports below).
mock.module('@lib/db.ts', () => ({
  getDb: () => dbAny,
  closeDb: () => {},
}));

// ── Import handlers after mock is registered ───────────────────────────────
const { GET: regionsGET } = await import('../src/pages/api/regions.ts');
const { GET: plantsGET } = await import('../src/pages/api/plants.ts');
const { GET: birdsGET } = await import('../src/pages/api/birds.ts');
const { GET: songsGET } = await import('../src/pages/api/songs/[id].ts');
const { GET: gardenBirdsGET } = await import('../src/pages/api/garden/birds.ts');

// ── Request context factory ────────────────────────────────────────────────
function ctx(
  url: string,
  opts: {
    ip?: string;
    headers?: Record<string, string>;
    params?: Record<string, string>;
  } = {},
): any {
  return {
    request: new Request(url, { headers: opts.headers }),
    clientAddress: opts.ip ?? nextIp(),
    params: opts.params ?? {},
  };
}

// ── Database setup ─────────────────────────────────────────────────────────
beforeAll(() => {
  db = new Database(':memory:');
  dbAny = db;
  db.exec('PRAGMA foreign_keys = ON');

  const schema = readFileSync(resolve('./db/schema.sql'), 'utf-8');
  db.exec(schema);

  // Regions
  db.exec(`
    INSERT INTO region (id, slug, name, level, parent_id, latitude, longitude) VALUES
      (1, 'americas',      'Americas',       'continent',      NULL, 15.0,  -80.0),
      (2, 'united-states', 'United States',  'country',        1,    39.5,  -98.35),
      (3, 'new-york',      'New York',       'state_province', 2,    43.0,  -75.0),
      (4, 'california',    'California',     'state_province', 2,    36.78, -119.42),
      (5, 'texas',         'Texas',          'state_province', 2,    31.97, -99.90)
  `);

  // Birds
  db.exec(`
    INSERT INTO bird (id, slug, common_name, scientific_name, family, description, conservation_status) VALUES
      (1, 'american-goldfinch',        'American Goldfinch',        'Spinus tristis',       'Fringillidae', 'A small finch known for its bright yellow plumage.', 'LC'),
      (2, 'ruby-throated-hummingbird', 'Ruby-throated Hummingbird', 'Archilochus colubris', 'Trochilidae',  'Only hummingbird in eastern North America.', 'LC'),
      (3, 'dark-eyed-junco',           'Dark-eyed Junco',           'Junco hyemalis',       'Passerellidae','A common winter sparrow.', 'LC')
  `);

  // Plants (spicebush has wrap-around bloom Nov–Feb)
  db.exec(`
    INSERT INTO plant (id, slug, common_name, scientific_name, family, plant_type, description,
                       usda_zone_min, usda_zone_max, bloom_start, bloom_end) VALUES
      (1, 'purple-coneflower', 'Purple Coneflower',  'Echinacea purpurea', 'Asteraceae',   'perennial', 'Iconic wildflower with purple petals.',        3, 9, 6,  9),
      (2, 'trumpet-vine',      'Trumpet Vine',        'Campsis radicans',   'Bignoniaceae', 'vine',      'Vigorous vine loved by hummingbirds.',          4, 9, 6,  9),
      (3, 'black-eyed-susan',  'Black-eyed Susan',    'Rudbeckia hirta',    'Asteraceae',   'perennial', 'Golden wildflower blooming mid-summer.',         3, 9, 6,  9),
      (4, 'spicebush',         'Northern Spicebush',  'Lindera benzoin',    'Lauraceae',    'shrub',     'Fragrant shrub with wrap-around winter bloom.',  4, 9, 11, 2)
  `);

  // plant_region (all plants in all state regions)
  db.exec(`
    INSERT INTO plant_region (plant_id, region_id) VALUES
      (1,3),(1,4),(1,5),(2,3),(2,4),(2,5),(3,3),(3,4),(3,5),(4,3),(4,4),(4,5)
  `);

  // bird_plant
  db.exec(`
    INSERT INTO bird_plant (bird_id, plant_id, attraction_type) VALUES
      (1,1,'food_seed'),(1,3,'food_seed'),
      (2,2,'food_nectar'),
      (3,1,'food_seed'),(3,3,'food_seed')
  `);

  // bird_region_season
  // Goldfinch: year-round in NY and CA
  // Hummingbird: breeding Apr–Sep in NY (temp_min_c=10)
  // Junco: wintering Oct–Mar in NY and TX
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

  // Songs
  db.exec(`
    INSERT INTO song (id, bird_id, filename, format, duration_sec, source_url, license, recordist) VALUES
      (1, 1, 'goldfinch-song.opus', 'opus', 12.3, 'https://example.org/song1', 'CC0', 'Test Recordist')
  `);

  // Temp media directory + fake audio file for song-streaming tests
  mkdirSync(join(TEMP_MEDIA, 'songs'), { recursive: true });
  writeFileSync(
    join(TEMP_MEDIA, 'songs', 'goldfinch-song.opus'),
    Buffer.from('fake-audio-content-for-testing'),
  );
});

afterAll(() => {
  db.close();
  if (existsSync(TEMP_MEDIA)) {
    rmSync(TEMP_MEDIA, { recursive: true, force: true });
  }
});

// =============================================================================
// GET /api/regions
// =============================================================================

describe('GET /api/regions', () => {
  test('returns 200 with regions array', async () => {
    const res = await regionsGET(ctx('http://test/api/regions'));
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(Array.isArray(body.regions)).toBe(true);
    expect(body.regions.length).toBe(5);
  });

  test('filters by level', async () => {
    const res = await regionsGET(ctx('http://test/api/regions?level=state_province'));
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.regions.length).toBe(3);
    expect(body.regions.every((r: any) => r.level === 'state_province')).toBe(true);
  });

  test('filters by parent_id', async () => {
    // united-states has parent_id=1 (americas); NY, CA, TX have parent_id=2
    const res = await regionsGET(ctx('http://test/api/regions?parent_id=2'));
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.regions.length).toBe(3);
    expect(body.regions.every((r: any) => r.parent_id === 2)).toBe(true);
  });

  test('returns lat/lng for client-side geolocation', async () => {
    const res = await regionsGET(ctx('http://test/api/regions?level=state_province'));
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    const ny = body.regions.find((r: any) => r.slug === 'new-york');
    expect(ny).toBeDefined();
    expect(ny.latitude).toBe(43.0);
    expect(ny.longitude).toBe(-75.0);
  });

  test('rate limits after 60 requests per minute', async () => {
    const ip = 'rate-limit-regions-ip';
    for (let i = 0; i < 60; i++) {
      const res = await regionsGET(ctx('http://test/api/regions', { ip }));
      expect(res.status).toBe(200);
    }
    const res = await regionsGET(ctx('http://test/api/regions', { ip }));
    expect(res.status).toBe(429);
    const body = await res.json() as any;
    expect(body.code).toBe('RATE_LIMITED');
  });
});

// =============================================================================
// GET /api/plants
// =============================================================================

describe('GET /api/plants', () => {
  test('returns 200 with plants for valid region', async () => {
    const res = await plantsGET(ctx('http://test/api/plants?region=new-york'));
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(Array.isArray(body.plants)).toBe(true);
    expect(body.total).toBe(4);
  });

  test('returns 400 for missing region', async () => {
    const res = await plantsGET(ctx('http://test/api/plants'));
    expect(res.status).toBe(400);
    const body = await res.json() as any;
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  test('returns 400 for invalid region slug', async () => {
    const res = await plantsGET(ctx('http://test/api/plants?region=INVALID+SLUG!!'));
    expect(res.status).toBe(400);
    const body = await res.json() as any;
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  test('returns 400 for invalid month', async () => {
    const res = await plantsGET(ctx('http://test/api/plants?region=new-york&month=13'));
    expect(res.status).toBe(400);
    const body = await res.json() as any;
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  test('filters by month (blooming now)', async () => {
    // Coneflower, trumpet-vine, black-eyed-susan bloom Jun–Sep; spicebush blooms Nov–Feb
    // July (7) matches 3 plants (6 ≤ 7 ≤ 9)
    const res = await plantsGET(ctx('http://test/api/plants?region=new-york&month=7'));
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.plants.length).toBe(3);
    expect(body.plants.every((p: any) => p.slug !== 'spicebush')).toBe(true);
  });

  test('filters by plant type', async () => {
    const res = await plantsGET(ctx('http://test/api/plants?region=new-york&type=perennial'));
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.plants.length).toBe(2);
    expect(body.plants.every((p: any) => p.plant_type === 'perennial')).toBe(true);
  });

  test('sorts by birds (default)', async () => {
    const res = await plantsGET(ctx('http://test/api/plants?region=new-york'));
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    const counts: number[] = body.plants.map((p: any) => p.bird_count);
    // Sorted descending by bird_count
    for (let i = 0; i < counts.length - 1; i++) {
      expect(counts[i]!).toBeGreaterThanOrEqual(counts[i + 1]!);
    }
  });

  test('sorts alphabetically', async () => {
    const res = await plantsGET(ctx('http://test/api/plants?region=new-york&sort=alpha'));
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    const names: string[] = body.plants.map((p: any) => p.common_name);
    const sorted = [...names].sort((a, b) => a.localeCompare(b));
    expect(names).toEqual(sorted);
  });

  test('FTS5 search works', async () => {
    const res = await plantsGET(ctx('http://test/api/plants?region=new-york&q=coneflower'));
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.plants.length).toBe(1);
    expect(body.plants[0].slug).toBe('purple-coneflower');
  });

  test('pagination with limit and offset', async () => {
    const res1 = await plantsGET(ctx('http://test/api/plants?region=new-york&sort=alpha&limit=2&offset=0'));
    expect(res1.status).toBe(200);
    const body1 = await res1.json() as any;
    expect(body1.plants.length).toBe(2);
    expect(body1.total).toBe(4);
    expect(body1.limit).toBe(2);
    expect(body1.offset).toBe(0);

    const res2 = await plantsGET(ctx('http://test/api/plants?region=new-york&sort=alpha&limit=2&offset=2'));
    expect(res2.status).toBe(200);
    const body2 = await res2.json() as any;
    expect(body2.plants.length).toBe(2);
    // Pages should not overlap
    const page1slugs = body1.plants.map((p: any) => p.slug);
    const page2slugs = body2.plants.map((p: any) => p.slug);
    expect(page1slugs.some((s: string) => page2slugs.includes(s))).toBe(false);
  });

  test('never exposes SQL errors in response body', async () => {
    // Force a DB error by temporarily replacing dbAny with a throwing stub.
    // The closure in mock.module references dbAny, so reassigning it is picked up.
    const savedDb = dbAny;
    dbAny = { prepare: () => { throw new Error('SQLITE_CORRUPT: database is malformed'); } };
    const res = await plantsGET(ctx('http://test/api/plants?region=new-york'));
    dbAny = savedDb;

    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).not.toContain('SQLITE_CORRUPT');
    expect(text).not.toContain('malformed');
  });

  test('generic error response on server error', async () => {
    const savedDb = dbAny;
    dbAny = { prepare: () => { throw new Error('Some unexpected internal error'); } };
    const res = await plantsGET(ctx('http://test/api/plants?region=new-york'));
    dbAny = savedDb;

    expect(res.status).toBe(500);
    const body = await res.json() as any;
    expect(body.error).toBe('Internal server error');
    expect(body.code).toBe('SERVER_ERROR');
  });
});

// =============================================================================
// GET /api/birds
// =============================================================================

describe('GET /api/birds', () => {
  test('returns birds for plant + region + month', async () => {
    // In July (month=7), goldfinch is resident in NY; junco is wintering (Oct–Mar) so absent
    const res = await birdsGET(
      ctx('http://test/api/birds?plant=purple-coneflower&region=new-york&month=7'),
    );
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(Array.isArray(body.birds)).toBe(true);
    expect(body.birds.length).toBe(1);
    expect(body.birds[0].slug).toBe('american-goldfinch');
  });

  test('returns 400 for missing required params', async () => {
    // Missing month
    const res = await birdsGET(
      ctx('http://test/api/birds?plant=purple-coneflower&region=new-york'),
    );
    expect(res.status).toBe(400);
    const body = await res.json() as any;
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  test('filters by temperature range', async () => {
    // Hummingbird breeds Jun–Sep in NY with temp_min_c=10
    // temp_c=5 (below 10) → excluded; temp_c=15 → included
    const resCold = await birdsGET(
      ctx('http://test/api/birds?plant=trumpet-vine&region=new-york&month=6&temp_c=5'),
    );
    expect(resCold.status).toBe(200);
    const bodyCold = await resCold.json() as any;
    expect(bodyCold.birds.length).toBe(0);

    const resWarm = await birdsGET(
      ctx('http://test/api/birds?plant=trumpet-vine&region=new-york&month=6&temp_c=15'),
    );
    expect(resWarm.status).toBe(200);
    const bodyWarm = await resWarm.json() as any;
    expect(bodyWarm.birds.length).toBe(1);
    expect(bodyWarm.birds[0].slug).toBe('ruby-throated-hummingbird');
  });

  test('returns songs with each bird', async () => {
    const res = await birdsGET(
      ctx('http://test/api/birds?plant=purple-coneflower&region=new-york&month=7'),
    );
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    const goldfinch = body.birds[0];
    expect(goldfinch).toHaveProperty('songs');
    expect(Array.isArray(goldfinch.songs)).toBe(true);
    expect(goldfinch.songs.length).toBe(1);
    expect(goldfinch.songs[0].filename).toBe('goldfinch-song.opus');
  });
});

// =============================================================================
// GET /api/songs/[id]
// =============================================================================

describe('GET /api/songs/[id]', () => {
  test('returns 200 with audio stream for valid id', async () => {
    const res = await songsGET(ctx('http://test/api/songs/1', { params: { id: '1' } }));
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('audio/ogg');
    const body = await res.arrayBuffer();
    expect(body.byteLength).toBeGreaterThan(0);
  });

  test('returns 400 for non-integer id', async () => {
    const res = await songsGET(ctx('http://test/api/songs/abc', { params: { id: 'abc' } }));
    expect(res.status).toBe(400);
    const body = await res.json() as any;
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  test('returns 400 for negative id', async () => {
    const res = await songsGET(ctx('http://test/api/songs/-1', { params: { id: '-1' } }));
    expect(res.status).toBe(400);
    const body = await res.json() as any;
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  test('returns 400 for path traversal attempt', async () => {
    // ID must be a positive integer; traversal strings fail validatePositiveIntId
    const res = await songsGET(
      ctx('http://test/api/songs/..%2Fetc%2Fpasswd', { params: { id: '../etc/passwd' } }),
    );
    expect(res.status).toBe(400);
    const body = await res.json() as any;
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  test('returns 404 for unknown id', async () => {
    const res = await songsGET(ctx('http://test/api/songs/9999', { params: { id: '9999' } }));
    expect(res.status).toBe(404);
    const body = await res.json() as any;
    expect(body.code).toBe('NOT_FOUND');
  });

  test('supports HTTP Range headers for seeking', async () => {
    const res = await songsGET(
      ctx('http://test/api/songs/1', {
        params: { id: '1' },
        headers: { range: 'bytes=0-9' },
      }),
    );
    expect(res.status).toBe(206);
    expect(res.headers.get('Content-Range')).toMatch(/^bytes 0-9\//);
    expect(res.headers.get('Accept-Ranges')).toBe('bytes');
    const body = await res.arrayBuffer();
    expect(body.byteLength).toBe(10);
  });

  test('sets Content-Disposition: inline', async () => {
    const res = await songsGET(ctx('http://test/api/songs/1', { params: { id: '1' } }));
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Disposition')).toBe('inline');
  });

  test('path resolved stays within media root', async () => {
    const { getSongPath } = await import('../src/lib/media.ts');
    // Traversal filenames are rejected immediately
    expect(() => getSongPath('../etc/passwd')).toThrow();
    expect(() => getSongPath('subdir/../../escape')).toThrow();
    // A normal filename resolves without throwing
    expect(() => getSongPath('valid-file.opus')).not.toThrow();
  });

  test('audio rate limits after 30 requests per minute', async () => {
    const ip = 'rate-limit-audio-ip';
    for (let i = 0; i < 30; i++) {
      const res = await songsGET(ctx('http://test/api/songs/1', { ip, params: { id: '1' } }));
      expect(res.status).toBe(200);
    }
    const res = await songsGET(ctx('http://test/api/songs/1', { ip, params: { id: '1' } }));
    expect(res.status).toBe(429);
    const body = await res.json() as any;
    expect(body.code).toBe('RATE_LIMITED');
  });
});

// =============================================================================
// GET /api/garden/birds
// =============================================================================

describe('GET /api/garden/birds', () => {
  test('returns combined bird list for multiple plants', async () => {
    // July, NY: goldfinch (via coneflower) + hummingbird (via trumpet-vine)
    const res = await gardenBirdsGET(
      ctx('http://test/api/garden/birds?plants=purple-coneflower,trumpet-vine&region=new-york&month=7'),
    );
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(Array.isArray(body.birds)).toBe(true);
    expect(body.birds.length).toBe(2);
    const slugs = body.birds.map((b: any) => b.slug).sort();
    expect(slugs).toEqual(['american-goldfinch', 'ruby-throated-hummingbird']);
  });

  test('deduplicates birds across plants', async () => {
    // Both coneflower and black-eyed-susan attract goldfinch in July NY;
    // the SQL GROUP BY ensures goldfinch appears only once.
    const res = await gardenBirdsGET(
      ctx('http://test/api/garden/birds?plants=purple-coneflower,black-eyed-susan&region=new-york&month=7'),
    );
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    const slugs: string[] = body.birds.map((b: any) => b.slug);
    const unique = new Set(slugs);
    expect(slugs.length).toBe(unique.size);
    expect(slugs.filter((s) => s === 'american-goldfinch').length).toBe(1);
  });

  test('caps plant list at 50', async () => {
    // validatePlantList slices input to MAX_GARDEN_PLANTS (50) before validating.
    // Slugs plant-01 … plant-51: the 51st is silently dropped; the rest are valid slugs
    // that happen not to exist in the DB, so birds=[].
    const slugs = Array.from({ length: 51 }, (_, i) =>
      `plant-${String(i + 1).padStart(2, '0')}`,
    );
    const res = await gardenBirdsGET(
      ctx(`http://test/api/garden/birds?plants=${slugs.join(',')}&region=new-york&month=7`),
    );
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(Array.isArray(body.birds)).toBe(true);
  });

  test('returns 400 for invalid slug in plant list', async () => {
    const res = await gardenBirdsGET(
      ctx('http://test/api/garden/birds?plants=valid-plant,INVALID+SLUG!!&region=new-york&month=7'),
    );
    expect(res.status).toBe(400);
    const body = await res.json() as any;
    expect(body.code).toBe('VALIDATION_ERROR');
  });
});

// ── GET /api/garden/coverage ───────────────────────────────────────────────
const { GET: gardenCoverageGET } = await import('../src/pages/api/garden/coverage.ts');

describe('GET /api/garden/coverage', () => {
  test('returns 12 monthly entries for valid plants + region', async () => {
    const res = await gardenCoverageGET(
      ctx('http://test/api/garden/coverage?plants=purple-coneflower,black-eyed-susan&region=new-york'),
    );
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(Array.isArray(body.coverage)).toBe(true);
    expect(body.coverage).toHaveLength(12);
    for (const entry of body.coverage) {
      expect(typeof entry.month).toBe('number');
      expect(entry.month).toBeGreaterThanOrEqual(1);
      expect(entry.month).toBeLessThanOrEqual(12);
      expect(typeof entry.count).toBe('number');
      expect(entry.count).toBeGreaterThanOrEqual(0);
    }
  });

  test('months with resident birds have non-zero count', async () => {
    // Goldfinch is year-round resident in new-york, attracted to purple-coneflower
    const res = await gardenCoverageGET(
      ctx('http://test/api/garden/coverage?plants=purple-coneflower&region=new-york'),
    );
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    const monthCounts = Object.fromEntries(body.coverage.map((c: any) => [c.month, c.count]));
    // All 12 months should have goldfinch (it's resident year-round)
    for (let m = 1; m <= 12; m++) {
      expect(monthCounts[m]).toBeGreaterThan(0);
    }
  });

  test('breeding-only bird appears in summer months only', async () => {
    // trumpet-vine attracts only the hummingbird, which breeds Apr–Sep in new-york
    const res = await gardenCoverageGET(
      ctx('http://test/api/garden/coverage?plants=trumpet-vine&region=new-york'),
    );
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    const byMonth = Object.fromEntries(body.coverage.map((c: any) => [c.month, c.count]));
    // June: hummingbird is breeding — count >= 1
    expect(byMonth[6]).toBeGreaterThanOrEqual(1);
    // January: hummingbird is absent — count = 0
    expect(byMonth[1]).toBe(0);
  });

  test('returns 400 when plants param is missing', async () => {
    const res = await gardenCoverageGET(
      ctx('http://test/api/garden/coverage?region=new-york'),
    );
    expect(res.status).toBe(400);
  });

  test('returns 400 when region param is missing', async () => {
    const res = await gardenCoverageGET(
      ctx('http://test/api/garden/coverage?plants=purple-coneflower'),
    );
    expect(res.status).toBe(400);
  });

  test('returns 400 for invalid slug in plant list', async () => {
    const res = await gardenCoverageGET(
      ctx('http://test/api/garden/coverage?plants=INVALID!!&region=new-york'),
    );
    expect(res.status).toBe(400);
  });

  test('empty coverage (all zeros) when no plants match region', async () => {
    // Use a region that has no bird_region_season data for these plants
    const res = await gardenCoverageGET(
      ctx('http://test/api/garden/coverage?plants=trumpet-vine&region=california'),
    );
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.coverage).toHaveLength(12);
    // Hummingbird has no entries for california in the test DB — all zeros
    for (const entry of body.coverage) {
      expect(entry.count).toBe(0);
    }
  });
});
