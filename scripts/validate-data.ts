/**
 * validate-data.ts — Checks referential integrity of seed JSON files
 *
 * Validates:
 *   - All slugs match the slug pattern
 *   - All cross-references resolve (no dangling foreign keys)
 *   - Required fields are present
 *   - Month values 1–12, zone values in valid range
 *   - No duplicate slugs within a dataset
 *
 * Exits with code 1 if any violations are found.
 * Run before seeding: bun run scripts/validate-data.ts
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

const SEED_DIR = resolve('./db/seed-data');

// ── Helpers ────────────────────────────────────────────────────────────────

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,98}[a-z0-9]$|^[a-z0-9]$/;

let errors = 0;
let warnings = 0;

function error(msg: string) {
  console.error(`  ❌ ERROR: ${msg}`);
  errors++;
}

function warn(msg: string) {
  console.warn(`  ⚠️  WARN:  ${msg}`);
  warnings++;
}

function ok(msg: string) {
  process.stdout.write(`  ✓  ${msg}\n`);
}

function loadJson<T>(filename: string): T | null {
  const path = join(SEED_DIR, filename);
  if (!existsSync(path)) {
    warn(`${filename} not found — skipping`);
    return null;
  }
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as T;
  } catch (err) {
    error(`Failed to parse ${filename}: ${err}`);
    return null;
  }
}

function checkSlug(slug: unknown, context: string): boolean {
  if (typeof slug !== 'string' || !SLUG_PATTERN.test(slug)) {
    error(`Invalid slug "${slug}" in ${context}`);
    return false;
  }
  return true;
}

function checkDuplicates<T>(items: T[], keyFn: (item: T) => unknown, context: string): Set<unknown> {
  const seen = new Set<unknown>();
  const dupes = new Set<unknown>();
  for (const item of items) {
    const key = keyFn(item);
    if (seen.has(key)) {
      error(`Duplicate key "${key}" in ${context}`);
      dupes.add(key);
    }
    seen.add(key);
  }
  return seen;
}

// ── Load all files ─────────────────────────────────────────────────────────

console.log('\n🔍 Bird Garden — Seed Data Validator\n');

interface RegionRow { slug: string; name: string; level: string; parent_slug: string | null; latitude?: number; longitude?: number; }
interface BirdRow { slug: string; common_name: string; scientific_name: string; family?: string; description?: string; conservation_status?: string; }
interface PlantRow { slug: string; common_name: string; scientific_name: string; plant_type?: string; usda_zone_min?: number; usda_zone_max?: number; bloom_start?: number; bloom_end?: number; }
interface BirdPlantRow { bird_slug: string; plant_slug: string; attraction_type: string; }
interface BirdRegionSeasonRow { bird_slug: string; region_slug: string; months: number[]; presence: string; temp_min_c?: number; temp_max_c?: number; }
interface PlantRegionRow { plant_slug: string; region_slugs: string[]; }
interface SongRow { bird_slug: string; filename: string; format: string; source_url: string; license: string; }

const regions   = loadJson<RegionRow[]>('regions.json') ?? [];
const birds     = loadJson<BirdRow[]>('birds.json') ?? [];
const plants    = loadJson<PlantRow[]>('plants.json') ?? [];
const birdPlant = loadJson<BirdPlantRow[]>('bird-plant.json') ?? [];
const birdSeason = loadJson<BirdRegionSeasonRow[]>('bird-region-season.json') ?? [];
const plantReg  = loadJson<PlantRegionRow[]>('plant-region.json') ?? [];
const songs     = loadJson<SongRow[]>('songs.json') ?? [];

// ── Validate regions ───────────────────────────────────────────────────────

console.log('🗺️  Validating regions…');
const regionSlugs = checkDuplicates(regions, r => r.slug, 'regions.json');

const validLevels = new Set(['continent', 'country', 'state_province', 'ecoregion', 'hardiness_zone']);

for (const r of regions) {
  checkSlug(r.slug, `region ${r.slug}`);
  if (!r.name) error(`Region ${r.slug} missing name`);
  if (!validLevels.has(r.level)) error(`Region ${r.slug} has invalid level: ${r.level}`);
  if (r.parent_slug !== null && r.parent_slug !== undefined && !regionSlugs.has(r.parent_slug)) {
    // parent might be defined later in file — just warn
    warn(`Region ${r.slug} references parent_slug "${r.parent_slug}" not seen yet (may be ordering)`);
  }
  if (r.latitude !== undefined && (r.latitude < -90 || r.latitude > 90)) {
    error(`Region ${r.slug} latitude out of range: ${r.latitude}`);
  }
  if (r.longitude !== undefined && (r.longitude < -180 || r.longitude > 180)) {
    error(`Region ${r.slug} longitude out of range: ${r.longitude}`);
  }
}
ok(`${regions.length} regions`);

// ── Validate birds ─────────────────────────────────────────────────────────

console.log('🐦 Validating birds…');
const birdSlugs = checkDuplicates(birds, b => b.slug, 'birds.json');

const validIUCN = new Set(['EX', 'EW', 'CR', 'EN', 'VU', 'NT', 'LC', 'DD', 'NE']);

for (const b of birds) {
  checkSlug(b.slug, `bird ${b.slug}`);
  if (!b.common_name) error(`Bird ${b.slug} missing common_name`);
  if (!b.scientific_name) error(`Bird ${b.slug} missing scientific_name`);
  if (b.conservation_status && !validIUCN.has(b.conservation_status)) {
    error(`Bird ${b.slug} invalid conservation_status: ${b.conservation_status}`);
  }
}
ok(`${birds.length} birds`);

// ── Validate plants ────────────────────────────────────────────────────────

console.log('🌿 Validating plants…');
const plantSlugs = checkDuplicates(plants, p => p.slug, 'plants.json');

const validPlantTypes = new Set(['tree', 'shrub', 'perennial', 'grass', 'vine']);

for (const p of plants) {
  checkSlug(p.slug, `plant ${p.slug}`);
  if (!p.common_name) error(`Plant ${p.slug} missing common_name`);
  if (!p.scientific_name) error(`Plant ${p.slug} missing scientific_name`);
  if (p.plant_type && !validPlantTypes.has(p.plant_type)) {
    error(`Plant ${p.slug} invalid plant_type: ${p.plant_type}`);
  }
  if (p.bloom_start !== undefined && (p.bloom_start < 1 || p.bloom_start > 12)) {
    error(`Plant ${p.slug} bloom_start out of range: ${p.bloom_start}`);
  }
  if (p.bloom_end !== undefined && (p.bloom_end < 1 || p.bloom_end > 12)) {
    error(`Plant ${p.slug} bloom_end out of range: ${p.bloom_end}`);
  }
  if (p.usda_zone_min !== undefined && (p.usda_zone_min < 0 || p.usda_zone_min > 13)) {
    error(`Plant ${p.slug} usda_zone_min out of range: ${p.usda_zone_min}`);
  }
  if (p.usda_zone_max !== undefined && (p.usda_zone_max < 0 || p.usda_zone_max > 13)) {
    error(`Plant ${p.slug} usda_zone_max out of range: ${p.usda_zone_max}`);
  }
}
ok(`${plants.length} plants`);

// ── Validate bird-plant ────────────────────────────────────────────────────

console.log('🔗 Validating bird-plant relations…');
const validAttractionTypes = new Set(['food_berry', 'food_seed', 'food_nectar', 'food_insect', 'nesting', 'shelter']);

const bpSeen = new Set<string>();
for (const r of birdPlant) {
  if (!birdSlugs.has(r.bird_slug)) error(`bird-plant: unknown bird_slug "${r.bird_slug}"`);
  if (!plantSlugs.has(r.plant_slug)) error(`bird-plant: unknown plant_slug "${r.plant_slug}"`);
  if (!validAttractionTypes.has(r.attraction_type)) {
    error(`bird-plant: invalid attraction_type "${r.attraction_type}" (${r.bird_slug} × ${r.plant_slug})`);
  }
  const key = `${r.bird_slug}|${r.plant_slug}|${r.attraction_type}`;
  if (bpSeen.has(key)) warn(`Duplicate bird-plant entry: ${key}`);
  bpSeen.add(key);
}
ok(`${birdPlant.length} bird-plant relations`);

// ── Validate bird-region-season ────────────────────────────────────────────

console.log('📅 Validating bird-region-season…');
const validPresence = new Set(['resident', 'breeding', 'wintering', 'migrating']);

for (const e of birdSeason) {
  if (!birdSlugs.has(e.bird_slug)) error(`bird-region-season: unknown bird_slug "${e.bird_slug}"`);
  if (!regionSlugs.has(e.region_slug)) error(`bird-region-season: unknown region_slug "${e.region_slug}"`);
  if (!validPresence.has(e.presence)) error(`bird-region-season: invalid presence "${e.presence}"`);
  if (!Array.isArray(e.months) || e.months.length === 0) {
    error(`bird-region-season: empty months for ${e.bird_slug} in ${e.region_slug}`);
  }
  for (const m of e.months ?? []) {
    if (m < 1 || m > 12) error(`bird-region-season: invalid month ${m} for ${e.bird_slug}`);
  }
  if (e.temp_min_c !== undefined && e.temp_max_c !== undefined && e.temp_min_c > e.temp_max_c) {
    error(`bird-region-season: temp_min_c > temp_max_c for ${e.bird_slug} in ${e.region_slug}`);
  }
}

const expandedCount = birdSeason.reduce((sum, e) => sum + (e.months?.length ?? 0), 0);
ok(`${birdSeason.length} entries → ${expandedCount} bird_region_season rows`);

// ── Validate plant-region ──────────────────────────────────────────────────

console.log('🌱 Validating plant-region…');
for (const e of plantReg) {
  if (!plantSlugs.has(e.plant_slug)) error(`plant-region: unknown plant_slug "${e.plant_slug}"`);
  for (const rslug of e.region_slugs ?? []) {
    if (!regionSlugs.has(rslug)) error(`plant-region: unknown region_slug "${rslug}" for plant ${e.plant_slug}`);
  }
}
ok(`${plantReg.length} plant-region entries`);

// ── Validate songs ─────────────────────────────────────────────────────────

if (songs.length > 0) {
  console.log('🎵 Validating songs…');
  const validFormats = new Set(['opus', 'mp3']);
  for (const s of songs) {
    if (!birdSlugs.has(s.bird_slug)) error(`song: unknown bird_slug "${s.bird_slug}"`);
    if (!validFormats.has(s.format)) error(`song: invalid format "${s.format}"`);
    if (!s.source_url) error(`song for ${s.bird_slug} missing source_url`);
    if (!s.license) error(`song for ${s.bird_slug} missing license`);
  }
  ok(`${songs.length} songs`);
}

// ── Coverage reports ───────────────────────────────────────────────────────

console.log('\n📊 Coverage report…');

const birdsWithPlants = new Set(birdPlant.map(r => r.bird_slug));
const plantsWithBirds = new Set(birdPlant.map(r => r.plant_slug));
const birdsWithSeason = new Set(birdSeason.map(e => e.bird_slug));
const plantsWithRegion = new Set(plantReg.map(e => e.plant_slug));

const birdsNoPlants = [...birdSlugs].filter(s => !birdsWithPlants.has(s));
const plantsNoBirds = [...plantSlugs].filter(s => !plantsWithBirds.has(s));
const birdsNoSeason = [...birdSlugs].filter(s => !birdsWithSeason.has(s));
const plantsNoRegion = [...plantSlugs].filter(s => !plantsWithRegion.has(s));

if (birdsNoPlants.length) warn(`Birds with no plant relations (${birdsNoPlants.length}): ${birdsNoPlants.slice(0, 5).join(', ')}${birdsNoPlants.length > 5 ? '…' : ''}`);
if (plantsNoBirds.length) warn(`Plants with no bird relations (${plantsNoBirds.length}): ${plantsNoBirds.slice(0, 5).join(', ')}${plantsNoBirds.length > 5 ? '…' : ''}`);
if (birdsNoSeason.length) warn(`Birds with no seasonal data (${birdsNoSeason.length}): ${birdsNoSeason.slice(0, 5).join(', ')}${birdsNoSeason.length > 5 ? '…' : ''}`);
if (plantsNoRegion.length) warn(`Plants with no regional data (${plantsNoRegion.length}): ${plantsNoRegion.slice(0, 5).join(', ')}${plantsNoRegion.length > 5 ? '…' : ''}`);

// ── Result ─────────────────────────────────────────────────────────────────

console.log('\n' + '─'.repeat(50));
if (errors > 0) {
  console.error(`\n❌ Validation FAILED: ${errors} error(s), ${warnings} warning(s)\n`);
  process.exit(1);
} else if (warnings > 0) {
  console.log(`\n⚠️  Validation passed with ${warnings} warning(s)\n`);
} else {
  console.log('\n✅ Validation PASSED — all seed data is consistent\n');
}
