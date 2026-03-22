/**
 * validate-data.ts — Checks referential integrity of seed JSON files
 *
 * Validates:
 *   - All bird_plant entries reference valid bird and plant slugs
 *   - All song entries reference valid bird slugs
 *   - All image entries reference valid bird/plant slugs
 *   - All region parent_slug references are valid
 *   - Slug format compliance (must match SLUG_PATTERN)
 *   - Month values are 1–12
 *   - Required fields are present
 *
 * Exits with code 1 if any violations are found.
 */

import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

const SEED_DIR = resolve('./db/seed-data');
// Must match the runtime pattern in src/lib/validate.ts exactly
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,98}[a-z0-9]$|^[a-z0-9]$/;

// ---------------------------------------------------------------------------
// Types (matching seed JSON shapes)
// ---------------------------------------------------------------------------

interface BirdRow {
  slug: string;
  common_name: string;
  scientific_name: string;
  family?: string | null;
  description?: string | null;
  conservation_status?: string | null;
}

interface PlantRow {
  slug: string;
  common_name: string;
  scientific_name: string;
  family?: string | null;
  plant_type?: string | null;
  description?: string | null;
  usda_zone_min?: number | null;
  usda_zone_max?: number | null;
  bloom_start?: number | null;
  bloom_end?: number | null;
}

interface RegionRow {
  slug: string;
  name: string;
  level: string;
  parent_slug: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

interface BirdPlantRow {
  bird_slug: string;
  plant_slug: string;
  attraction_type?: string | null;
}

interface SongRow {
  bird_slug: string;
  filename: string;
  format?: string;
  duration_sec?: number | null;
  source_url?: string;
  license?: string;
  recordist?: string | null;
  recording_date?: string | null;
  recording_loc?: string | null;
}

interface ImageRow {
  entity_type: 'bird' | 'plant';
  entity_slug: string;
  filename: string;
  alt_text?: string;
  source_url?: string;
  license?: string;
  author?: string | null;
  is_primary?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const errors: string[] = [];
const warnings: string[] = [];

function load<T>(filename: string): T[] {
  const path = join(SEED_DIR, filename);
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as T[];
  } catch (err) {
    errors.push(`Cannot read ${filename}: ${err}`);
    return [];
  }
}

function error(msg: string) {
  errors.push(msg);
}

function warn(msg: string) {
  warnings.push(msg);
}

function checkSlug(slug: unknown, context: string): boolean {
  if (typeof slug !== 'string' || !SLUG_PATTERN.test(slug)) {
    error(`Invalid slug ${JSON.stringify(slug)} in ${context}`);
    return false;
  }
  return true;
}

function checkMonth(month: unknown, context: string): boolean {
  if (month !== null && month !== undefined) {
    if (typeof month !== 'number' || !Number.isInteger(month) || month < 1 || month > 12) {
      error(`Invalid month ${JSON.stringify(month)} in ${context} (must be 1–12)`);
      return false;
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// Load all seed files
// ---------------------------------------------------------------------------

const birds = load<BirdRow>('birds.json');
const plants = load<PlantRow>('plants.json');
const regions = load<RegionRow>('regions.json');
const birdPlant = load<BirdPlantRow>('bird-plant.json');
const songs = load<SongRow>('songs.json');
const images = load<ImageRow>('images.json');

const birdSlugs = new Set<string>();
const plantSlugs = new Set<string>();
const regionSlugs = new Set<string>();

// ---------------------------------------------------------------------------
// Validate birds.json
// ---------------------------------------------------------------------------

console.log(`Validating birds.json (${birds.length} entries)…`);
for (const [i, bird] of birds.entries()) {
  const ctx = `birds.json[${i}]`;

  if (!bird.slug) {
    error(`Missing slug in ${ctx}`);
    continue;
  }
  if (!checkSlug(bird.slug, ctx)) continue;
  if (birdSlugs.has(bird.slug)) {
    error(`Duplicate bird slug "${bird.slug}" in ${ctx}`);
  }
  birdSlugs.add(bird.slug);

  if (!bird.common_name) error(`Missing common_name for bird "${bird.slug}"`);
  if (!bird.scientific_name) error(`Missing scientific_name for bird "${bird.slug}"`);
}

// ---------------------------------------------------------------------------
// Validate plants.json
// ---------------------------------------------------------------------------

console.log(`Validating plants.json (${plants.length} entries)…`);
const VALID_PLANT_TYPES = new Set(['tree', 'shrub', 'perennial', 'grass', 'vine', null, undefined]);

for (const [i, plant] of plants.entries()) {
  const ctx = `plants.json[${i}]`;

  if (!plant.slug) {
    error(`Missing slug in ${ctx}`);
    continue;
  }
  if (!checkSlug(plant.slug, ctx)) continue;
  if (plantSlugs.has(plant.slug)) {
    error(`Duplicate plant slug "${plant.slug}" in ${ctx}`);
  }
  plantSlugs.add(plant.slug);

  if (!plant.common_name) error(`Missing common_name for plant "${plant.slug}"`);
  if (!plant.scientific_name) error(`Missing scientific_name for plant "${plant.slug}"`);

  if (plant.plant_type !== null && plant.plant_type !== undefined && !VALID_PLANT_TYPES.has(plant.plant_type)) {
    warn(`Unknown plant_type "${plant.plant_type}" for plant "${plant.slug}"`);
  }

  checkMonth(plant.bloom_start, `plants.json bloom_start for "${plant.slug}"`);
  checkMonth(plant.bloom_end, `plants.json bloom_end for "${plant.slug}"`);

  if (
    plant.usda_zone_min !== null && plant.usda_zone_min !== undefined &&
    plant.usda_zone_max !== null && plant.usda_zone_max !== undefined &&
    plant.usda_zone_min > plant.usda_zone_max
  ) {
    error(`usda_zone_min (${plant.usda_zone_min}) > usda_zone_max (${plant.usda_zone_max}) for plant "${plant.slug}"`);
  }
}

// ---------------------------------------------------------------------------
// Validate regions.json
// ---------------------------------------------------------------------------

console.log(`Validating regions.json (${regions.length} entries)…`);
const VALID_LEVELS = new Set(['continent', 'country', 'state_province', 'ecoregion', 'hardiness_zone']);

for (const [i, region] of regions.entries()) {
  const ctx = `regions.json[${i}]`;

  if (!region.slug) {
    error(`Missing slug in ${ctx}`);
    continue;
  }
  if (!checkSlug(region.slug, ctx)) continue;
  if (regionSlugs.has(region.slug)) {
    error(`Duplicate region slug "${region.slug}" in ${ctx}`);
  }
  regionSlugs.add(region.slug);

  if (!region.name) error(`Missing name for region "${region.slug}"`);

  if (!VALID_LEVELS.has(region.level)) {
    error(`Invalid level "${region.level}" for region "${region.slug}"`);
  }
}

// Second pass: check parent_slug references (requires all slugs collected first)
for (const region of regions) {
  if (region.parent_slug !== null && region.parent_slug !== undefined) {
    if (!regionSlugs.has(region.parent_slug)) {
      error(`Region "${region.slug}" references unknown parent_slug "${region.parent_slug}"`);
    }
  }
}

// ---------------------------------------------------------------------------
// Validate bird-plant.json
// ---------------------------------------------------------------------------

console.log(`Validating bird-plant.json (${birdPlant.length} entries)…`);
const VALID_ATTRACTION_TYPES = new Set([
  'food_seed', 'food_berry', 'food_nectar', 'food_insect',
  'nesting', 'cover', 'water', null, undefined,
]);

const birdPlantPairs = new Set<string>();
for (const [i, bp] of birdPlant.entries()) {
  const ctx = `bird-plant.json[${i}]`;

  if (!bp.bird_slug || !bp.plant_slug) {
    error(`Missing bird_slug or plant_slug in ${ctx}`);
    continue;
  }

  if (!birdSlugs.has(bp.bird_slug)) {
    error(`bird-plant.json[${i}]: unknown bird_slug "${bp.bird_slug}"`);
  }
  if (!plantSlugs.has(bp.plant_slug)) {
    error(`bird-plant.json[${i}]: unknown plant_slug "${bp.plant_slug}"`);
  }

  // PK is (bird_id, plant_id, attraction_type) so include all three in duplicate check
  const pair = `${bp.bird_slug}:${bp.plant_slug}:${bp.attraction_type ?? ''}`;
  if (birdPlantPairs.has(pair)) {
    error(`Duplicate bird-plant-attraction triple (${bp.bird_slug}, ${bp.plant_slug}, ${bp.attraction_type}) in ${ctx}`);
  }
  birdPlantPairs.add(pair);

  if (!VALID_ATTRACTION_TYPES.has(bp.attraction_type)) {
    warn(`Unknown attraction_type "${bp.attraction_type}" in ${ctx}`);
  }
}

// ---------------------------------------------------------------------------
// Validate songs.json (may be empty)
// ---------------------------------------------------------------------------

if (songs.length > 0) {
  console.log(`Validating songs.json (${songs.length} entries)…`);
  for (const [i, song] of songs.entries()) {
    const ctx = `songs.json[${i}]`;
    if (!song.bird_slug) {
      error(`Missing bird_slug in ${ctx}`);
      continue;
    }
    if (!birdSlugs.has(song.bird_slug)) {
      error(`songs.json[${i}]: unknown bird_slug "${song.bird_slug}"`);
    }
    if (!song.filename) error(`Missing filename in ${ctx}`);
  }
}

// ---------------------------------------------------------------------------
// Validate images.json (may be empty)
// ---------------------------------------------------------------------------

if (images.length > 0) {
  console.log(`Validating images.json (${images.length} entries)…`);
  for (const [i, img] of images.entries()) {
    const ctx = `images.json[${i}]`;
    if (!img.entity_slug) {
      error(`Missing entity_slug in ${ctx}`);
      continue;
    }
    if (!img.entity_type || !['bird', 'plant'].includes(img.entity_type)) {
      error(`Invalid entity_type "${img.entity_type}" in ${ctx}`);
      continue;
    }
    const validSlugs = img.entity_type === 'bird' ? birdSlugs : plantSlugs;
    if (!validSlugs.has(img.entity_slug)) {
      error(`images.json[${i}]: unknown ${img.entity_type}_slug "${img.entity_slug}"`);
    }
    if (!img.filename) error(`Missing filename in ${ctx}`);
  }
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log('');
console.log('=== Validation Summary ===');
console.log(`  Birds:            ${birdSlugs.size}`);
console.log(`  Plants:           ${plantSlugs.size}`);
console.log(`  Regions:          ${regionSlugs.size}`);
console.log(`  Bird-plant pairs: ${birdPlantPairs.size}`);
console.log(`  Songs:            ${songs.length}`);
console.log(`  Images:           ${images.length}`);

if (warnings.length > 0) {
  console.warn('');
  console.warn(`Warnings (${warnings.length}):`);
  for (const w of warnings) console.warn(`  ⚠  ${w}`);
}

if (errors.length > 0) {
  console.error('');
  console.error(`Errors (${errors.length}):`);
  for (const e of errors) console.error(`  ✗  ${e}`);
  console.error('');
  console.error('Validation FAILED.');
  process.exit(1);
} else {
  console.log('');
  console.log('Validation passed ✓');
}
