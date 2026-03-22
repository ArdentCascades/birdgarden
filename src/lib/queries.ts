/**
 * queries.ts — Typed query functions for all database access
 *
 * RULES:
 *   - ALL queries use parameterized statements — no string concatenation in SQL
 *   - All parameters must be validated by validate.ts BEFORE reaching these functions
 *   - Return typed results only — never expose raw DB objects
 *
 * Named-parameter compatibility note:
 *   Production runs under Node.js + better-sqlite3. Tests run under Bun + bun:sqlite.
 *   To avoid API differences, all queries use ? positional parameters.
 */

import type { Database } from 'better-sqlite3';
import { getDb } from './db.ts';

// --- Type Definitions ---

export interface Region {
  id: number;
  slug: string;
  name: string;
  level: 'continent' | 'country' | 'state_province' | 'ecoregion' | 'hardiness_zone';
  parent_id: number | null;
  latitude: number | null;
  longitude: number | null;
}

export interface Plant {
  id: number;
  slug: string;
  common_name: string;
  scientific_name: string;
  family: string | null;
  plant_type: string | null;
  description: string | null;
  usda_zone_min: number | null;
  usda_zone_max: number | null;
  bloom_start: number | null;
  bloom_end: number | null;
  bird_count?: number; // Computed — how many birds this plant attracts
}

export interface Bird {
  id: number;
  slug: string;
  common_name: string;
  scientific_name: string;
  family: string | null;
  description: string | null;
  conservation_status: string | null;
}

export interface BirdWithPresence extends Bird {
  presence: 'resident' | 'breeding' | 'wintering' | 'migrating';
  temp_min_c: number | null;
  temp_max_c: number | null;
  attraction_type: string | null;
}

export interface Song {
  id: number;
  bird_id: number;
  filename: string;
  format: 'opus' | 'mp3';
  duration_sec: number | null;
  source_url: string;
  license: string;
  recordist: string | null;
  recording_date: string | null;
  recording_loc: string | null;
  metadata: string | null; // JSON string
}

export interface Image {
  id: number;
  entity_type: 'bird' | 'plant';
  entity_id: number;
  filename: string;
  alt_text: string;
  width: number | null;
  height: number | null;
  source_url: string;
  license: string;
  author: string | null;
  is_primary: 0 | 1;
}

export interface PlantListOptions {
  regionSlug: string;
  month?: number;
  plantType?: string;
  sort?: 'birds' | 'alpha' | 'bloom';
  search?: string;
  limit: number;
  offset: number;
}

export interface BirdListOptions {
  plantSlug: string;
  regionSlug: string;
  month: number;
  tempC?: number;
}

// ---------------------------------------------------------------------------
// Regions
// ---------------------------------------------------------------------------

export function getRegions(
  _db: Database,
  opts?: { level?: string; parentId?: number },
): Region[] {
  // Use conditional WHERE to avoid null-param binding differences between DB drivers
  const db = _db ?? getDb();

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (opts?.level !== undefined) {
    conditions.push('level = ?');
    params.push(opts.level);
  }
  if (opts?.parentId !== undefined) {
    conditions.push('parent_id = ?');
    params.push(opts.parentId);
  }

  const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

  return (db as any).prepare(
    `SELECT id, slug, name, level, parent_id, latitude, longitude FROM region ${where} ORDER BY name ASC`,
  ).all(...params) as Region[];
}

// ---------------------------------------------------------------------------
// Plants
// ---------------------------------------------------------------------------

export function getPlants(
  _db: Database,
  opts: PlantListOptions,
): { plants: Plant[]; total: number } {
  const db = (_db ?? getDb()) as any;
  const { regionSlug, month, plantType, sort = 'birds', search, limit, offset } = opts;

  const conditions: string[] = ['r.slug = ?'];
  const params: unknown[] = [regionSlug];

  if (plantType !== undefined) {
    conditions.push('p.plant_type = ?');
    params.push(plantType);
  }

  if (month !== undefined) {
    // Wrap-around bloom: bloom_start > bloom_end means it crosses year-end
    // e.g., bloom_start=11, bloom_end=2 covers Nov–Feb
    conditions.push(`(
      p.bloom_start IS NULL OR p.bloom_end IS NULL OR
      (p.bloom_start <= p.bloom_end AND ? BETWEEN p.bloom_start AND p.bloom_end) OR
      (p.bloom_start > p.bloom_end AND (? >= p.bloom_start OR ? <= p.bloom_end))
    )`);
    // month appears three times in the condition
    params.push(month, month, month);
  }

  if (search && search.length > 0) {
    conditions.push('p.id IN (SELECT rowid FROM plant_fts WHERE plant_fts MATCH ?)');
    params.push(search + '*');
  }

  const whereClause = conditions.join(' AND ');

  const ORDER_BY: Record<string, string> = {
    alpha: 'p.common_name ASC',
    bloom: 'COALESCE(p.bloom_start, 13) ASC, p.common_name ASC',
    birds: 'bird_count DESC, p.common_name ASC',
  };
  const orderClause = ORDER_BY[sort] ?? ORDER_BY['birds']!;

  const baseJoins = `
    FROM plant p
    JOIN plant_region pr ON p.id = pr.plant_id
    JOIN region r ON pr.region_id = r.id
    LEFT JOIN bird_plant bp ON p.id = bp.plant_id
    WHERE ${whereClause}
    GROUP BY p.id
  `;

  // Count query — params same as above (no limit/offset)
  const countRow = db.prepare(
    `SELECT COUNT(*) as total FROM (SELECT p.id ${baseJoins})`,
  ).get(...params) as { total: number } | undefined;
  const total = countRow?.total ?? 0;

  // Data query — append limit/offset
  const rows = db.prepare(`
    SELECT
      p.id, p.slug, p.common_name, p.scientific_name, p.family,
      p.plant_type, p.description, p.usda_zone_min, p.usda_zone_max,
      p.bloom_start, p.bloom_end,
      COUNT(DISTINCT bp.bird_id) AS bird_count
    ${baseJoins}
    ORDER BY ${orderClause}
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset) as Plant[];

  return { plants: rows, total };
}

export function getPlantBySlug(
  _db: Database,
  slug: string,
): Plant | null {
  const db = (_db ?? getDb()) as any;
  const row = db.prepare(`
    SELECT
      p.id, p.slug, p.common_name, p.scientific_name, p.family,
      p.plant_type, p.description, p.usda_zone_min, p.usda_zone_max,
      p.bloom_start, p.bloom_end,
      COUNT(DISTINCT bp.bird_id) AS bird_count
    FROM plant p
    LEFT JOIN bird_plant bp ON p.id = bp.plant_id
    WHERE p.slug = ?
    GROUP BY p.id
  `).get(slug) as Plant | undefined;
  return row ?? null;
}

// ---------------------------------------------------------------------------
// Birds
// ---------------------------------------------------------------------------

export function getBirdsForPlant(
  _db: Database,
  opts: BirdListOptions,
): BirdWithPresence[] {
  const db = (_db ?? getDb()) as any;
  const { plantSlug, regionSlug, month, tempC } = opts;

  const conditions: string[] = [
    'bp.plant_id = (SELECT id FROM plant WHERE slug = ?)',
    'r.slug = ?',
    'brs.month = ?',
  ];
  const params: unknown[] = [plantSlug, regionSlug, month];

  if (tempC !== undefined) {
    conditions.push('(brs.temp_min_c IS NULL OR ? >= brs.temp_min_c)');
    conditions.push('(brs.temp_max_c IS NULL OR ? <= brs.temp_max_c)');
    params.push(tempC, tempC);
  }

  return db.prepare(`
    SELECT
      b.id, b.slug, b.common_name, b.scientific_name, b.family,
      b.description, b.conservation_status,
      brs.presence, brs.temp_min_c, brs.temp_max_c,
      bp.attraction_type
    FROM bird b
    JOIN bird_plant bp ON b.id = bp.bird_id
    JOIN bird_region_season brs ON b.id = brs.bird_id
    JOIN region r ON brs.region_id = r.id
    WHERE ${conditions.join(' AND ')}
    GROUP BY b.id
    ORDER BY b.common_name ASC
  `).all(...params) as BirdWithPresence[];
}

export function getBirdBySlug(
  _db: Database,
  slug: string,
): Bird | null {
  const db = (_db ?? getDb()) as any;
  const row = db.prepare(`
    SELECT id, slug, common_name, scientific_name, family, description, conservation_status
    FROM bird WHERE slug = ?
  `).get(slug) as Bird | undefined;
  return row ?? null;
}

// ---------------------------------------------------------------------------
// Songs
// ---------------------------------------------------------------------------

export function getSongsForBird(
  _db: Database,
  birdId: number,
): Song[] {
  const db = (_db ?? getDb()) as any;
  return db.prepare(`
    SELECT id, bird_id, filename, format, duration_sec, source_url,
           license, recordist, recording_date, recording_loc, metadata
    FROM song WHERE bird_id = ? ORDER BY id ASC
  `).all(birdId) as Song[];
}

export function getSongById(
  _db: Database,
  id: number,
): Song | null {
  const db = (_db ?? getDb()) as any;
  const row = db.prepare(`
    SELECT id, bird_id, filename, format, duration_sec, source_url,
           license, recordist, recording_date, recording_loc, metadata
    FROM song WHERE id = ?
  `).get(id) as Song | undefined;
  return row ?? null;
}

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

export function getImagesForEntity(
  _db: Database,
  entityType: 'bird' | 'plant',
  entityId: number,
): Image[] {
  const db = (_db ?? getDb()) as any;
  return db.prepare(`
    SELECT id, entity_type, entity_id, filename, alt_text, width, height,
           source_url, license, author, is_primary
    FROM image
    WHERE entity_type = ? AND entity_id = ?
    ORDER BY is_primary DESC, id ASC
  `).all(entityType, entityId) as Image[];
}

// ---------------------------------------------------------------------------
// Garden (multiple plants)
// ---------------------------------------------------------------------------

export function getBirdsForGarden(
  _db: Database,
  opts: {
    plantSlugs: string[];
    regionSlug: string;
    month: number;
    tempC?: number;
  },
): BirdWithPresence[] {
  const db = (_db ?? getDb()) as any;
  const { plantSlugs, regionSlug, month, tempC } = opts;

  if (plantSlugs.length === 0) return [];

  // Build positional placeholders for the IN clause
  const slugPlaceholders = plantSlugs.map(() => '?').join(', ');

  const conditions: string[] = [
    `p.slug IN (${slugPlaceholders})`,
    'r.slug = ?',
    'brs.month = ?',
  ];
  const params: unknown[] = [...plantSlugs, regionSlug, month];

  if (tempC !== undefined) {
    conditions.push('(brs.temp_min_c IS NULL OR ? >= brs.temp_min_c)');
    conditions.push('(brs.temp_max_c IS NULL OR ? <= brs.temp_max_c)');
    params.push(tempC, tempC);
  }

  return db.prepare(`
    SELECT
      b.id, b.slug, b.common_name, b.scientific_name, b.family,
      b.description, b.conservation_status,
      brs.presence, brs.temp_min_c, brs.temp_max_c,
      MIN(bp.attraction_type) AS attraction_type
    FROM bird b
    JOIN bird_plant bp ON b.id = bp.bird_id
    JOIN plant p ON bp.plant_id = p.id
    JOIN bird_region_season brs ON b.id = brs.bird_id
    JOIN region r ON brs.region_id = r.id
    WHERE ${conditions.join(' AND ')}
    GROUP BY b.id
    ORDER BY b.common_name ASC
  `).all(...params) as BirdWithPresence[];
}

// ---------------------------------------------------------------------------
// Garden 12-month bird coverage
// ---------------------------------------------------------------------------

export interface MonthCoverage {
  month: number;   // 1–12
  count: number;   // distinct bird species present
}

/**
 * Returns distinct bird species counts for each of the 12 months given
 * a set of plant slugs and a region. Used by the garden coverage chart.
 */
export function getGardenCoverage(
  _db: Database,
  opts: { plantSlugs: string[]; regionSlug: string },
): MonthCoverage[] {
  const db = (_db ?? getDb()) as any;
  const { plantSlugs, regionSlug } = opts;

  if (plantSlugs.length === 0) {
    return Array.from({ length: 12 }, (_, i) => ({ month: i + 1, count: 0 }));
  }

  const slugPlaceholders = plantSlugs.map(() => '?').join(', ');

  const rows = db.prepare(`
    SELECT brs.month, COUNT(DISTINCT b.id) AS count
    FROM bird b
    JOIN bird_plant bp ON b.id = bp.bird_id
    JOIN plant p ON bp.plant_id = p.id
    JOIN bird_region_season brs ON b.id = brs.bird_id
    JOIN region r ON brs.region_id = r.id
    WHERE p.slug IN (${slugPlaceholders})
      AND r.slug = ?
    GROUP BY brs.month
    ORDER BY brs.month ASC
  `).all(...plantSlugs, regionSlug) as { month: number; count: number }[];

  // Fill in months with zero count
  const byMonth = new Map(rows.map((r) => [r.month, r.count]));
  return Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    count: byMonth.get(i + 1) ?? 0,
  }));
}
