/**
 * validate-data.ts — Checks referential integrity of seed JSON files
 *
 * Validates:
 *   - All bird_plant entries reference valid bird and plant slugs
 *   - All song entries reference valid bird slugs
 *   - All image entries reference valid bird/plant slugs
 *   - Slug format compliance (must match SLUG_PATTERN)
 *   - Month values are 1–12
 *   - Required fields are present and non-empty
 *
 * Exits with code 1 if any violations are found.
 *
 * Usage:
 *   bun run scripts/validate-data.ts
 */

import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

const SEED_DIR = resolve('./db/seed-data');

function loadJson<T>(filename: string): T {
  const path = join(SEED_DIR, filename);
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as T;
  } catch (err) {
    console.error(`Cannot read ${filename}: ${err}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Error tracking
// ---------------------------------------------------------------------------

let errorCount = 0;

function fail(msg: string) {
  console.error(`  ✗ ${msg}`);
  errorCount++;
}

function ok(msg: string) {
  console.log(`  ✓ ${msg}`);
}

function section(title: string) {
  console.log(`\n── ${title}`);
}

// ---------------------------------------------------------------------------
// Slug validation
// ---------------------------------------------------------------------------

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,98}[a-z0-9]$|^[a-z0-9]$/;

function isValidSlug(slug: unknown): slug is string {
  return typeof slug === 'string' && SLUG_PATTERN.test(slug);
}

function validateSlug(slug: unknown, context: string) {
  if (!isValidSlug(slug)) {
    fail(`Invalid slug ${JSON.stringify(slug)} in ${context}`);
  }
}

// ---------------------------------------------------------------------------
// Type definitions
// ---------------------------------------------------------------------------

interface BirdRecord {
  slug: string;
  common_name: string;
  scientific_name: string;
  family?: string;
  description?: string;
  conservation_status?: string;
}

interface PlantRecord {
  slug: string;
  common_name: string;
  scientific_name: string;
  family?: string;
  plant_type?: string;
  description?: string;
  usda_zone_min?: number;
  usda_zone_max?: number;
  bloom_start?: number;
  bloom_end?: number;
}

interface RegionRecord {
  slug: string;
  name: string;
  level: string;
  parent_slug: string | null;
  latitude: number | null;
  longitude: number | null;
}

interface BirdPlantRecord {
  bird_slug: string;
  plant_slug: string;
  attraction_type: string;
}

interface SongRecord {
  bird_slug: string;
  filename: string;
  format: string;
  duration_sec?: number;
  source_url: string;
  license: string;
  recordist?: string;
  recording_date?: string;
  recording_loc?: string;
}

interface ImageRecord {
  entity_type: string;
  entity_slug: string;
  filename: string;
  alt_text: string;
  width?: number;
  height?: number;
  source_url: string;
  license: string;
  author?: string;
  is_primary?: number;
}

// ---------------------------------------------------------------------------
// Load all seed files
// ---------------------------------------------------------------------------

const birds    = loadJson<BirdRecord[]>('birds.json');
const plants   = loadJson<PlantRecord[]>('plants.json');
const regions  = loadJson<RegionRecord[]>('regions.json');
const birdPlant = loadJson<BirdPlantRecord[]>('bird-plant.json');
const songs    = loadJson<SongRecord[]>('songs.json');
const images   = loadJson<ImageRecord[]>('images.json');

const birdSlugs   = new Set(birds.map((b) => b.slug));
const plantSlugs  = new Set(plants.map((p) => p.slug));
const regionSlugs = new Set(regions.map((r) => r.slug));

// ---------------------------------------------------------------------------
// Validate: birds.json
// ---------------------------------------------------------------------------

section('birds.json');

for (const bird of birds) {
  validateSlug(bird.slug, 'birds.json');
  if (!bird.common_name?.trim()) fail(`Missing common_name for bird slug "${bird.slug}"`);
  if (!bird.scientific_name?.trim()) fail(`Missing scientific_name for bird slug "${bird.slug}"`);
}

const birdSlugList = birds.map((b) => b.slug);
const dupBirds = birdSlugList.filter((s, i) => birdSlugList.indexOf(s) !== i);
if (dupBirds.length > 0) {
  fail(`Duplicate bird slugs: ${[...new Set(dupBirds)].join(', ')}`);
} else {
  ok(`${birds.length} birds, no duplicates`);
}

// ---------------------------------------------------------------------------
// Validate: plants.json
// ---------------------------------------------------------------------------

section('plants.json');

const VALID_PLANT_TYPES = new Set([
  'tree', 'shrub', 'perennial', 'annual', 'vine', 'grass', 'groundcover', 'fern',
]);

for (const plant of plants) {
  validateSlug(plant.slug, 'plants.json');
  if (!plant.common_name?.trim()) fail(`Missing common_name for plant slug "${plant.slug}"`);
  if (!plant.scientific_name?.trim()) fail(`Missing scientific_name for plant slug "${plant.slug}"`);
  if (plant.plant_type && !VALID_PLANT_TYPES.has(plant.plant_type)) {
    fail(`Unknown plant_type "${plant.plant_type}" for plant "${plant.slug}"`);
  }
  if (plant.bloom_start != null && (plant.bloom_start < 1 || plant.bloom_start > 12)) {
    fail(`bloom_start out of range for plant "${plant.slug}": ${plant.bloom_start}`);
  }
  if (plant.bloom_end != null && (plant.bloom_end < 1 || plant.bloom_end > 12)) {
    fail(`bloom_end out of range for plant "${plant.slug}": ${plant.bloom_end}`);
  }
  if (plant.usda_zone_min != null && plant.usda_zone_max != null) {
    if (plant.usda_zone_min > plant.usda_zone_max) {
      fail(`usda_zone_min > usda_zone_max for plant "${plant.slug}"`);
    }
  }
}

const plantSlugList = plants.map((p) => p.slug);
const dupPlants = plantSlugList.filter((s, i) => plantSlugList.indexOf(s) !== i);
if (dupPlants.length > 0) {
  fail(`Duplicate plant slugs: ${[...new Set(dupPlants)].join(', ')}`);
} else {
  ok(`${plants.length} plants, no duplicates`);
}

// ---------------------------------------------------------------------------
// Validate: regions.json
// ---------------------------------------------------------------------------

section('regions.json');

const VALID_LEVELS = new Set([
  'continent', 'country', 'state_province', 'ecoregion', 'hardiness_zone',
]);

for (const region of regions) {
  validateSlug(region.slug, 'regions.json');
  if (!region.name?.trim()) fail(`Missing name for region slug "${region.slug}"`);
  if (!VALID_LEVELS.has(region.level)) {
    fail(`Unknown level "${region.level}" for region "${region.slug}"`);
  }
  if (region.parent_slug != null && !regionSlugs.has(region.parent_slug)) {
    fail(`Unknown parent_slug "${region.parent_slug}" for region "${region.slug}"`);
  }
}

const regionSlugList = regions.map((r) => r.slug);
const dupRegions = regionSlugList.filter((s, i) => regionSlugList.indexOf(s) !== i);
if (dupRegions.length > 0) {
  fail(`Duplicate region slugs: ${[...new Set(dupRegions)].join(', ')}`);
} else {
  ok(`${regions.length} regions, no duplicates`);
}

// ---------------------------------------------------------------------------
// Validate: bird-plant.json
// ---------------------------------------------------------------------------

section('bird-plant.json');

const VALID_ATTRACTION_TYPES = new Set([
  'food_seed', 'food_berry', 'food_nectar', 'food_insect',
  'food_fruit', 'nesting', 'shelter', 'water',
]);

const birdPlantPairs = new Set<string>();

for (const [i, bp] of birdPlant.entries()) {
  const ctx = `bird-plant.json[${i}]`;
  if (!birdSlugs.has(bp.bird_slug)) fail(`Unknown bird_slug "${bp.bird_slug}" in ${ctx}`);
  if (!plantSlugs.has(bp.plant_slug)) fail(`Unknown plant_slug "${bp.plant_slug}" in ${ctx}`);
  if (!VALID_ATTRACTION_TYPES.has(bp.attraction_type)) {
    fail(`Unknown attraction_type "${bp.attraction_type}" in ${ctx}`);
  }
  const pair = `${bp.bird_slug}::${bp.plant_slug}`;
  if (birdPlantPairs.has(pair)) {
    fail(`Duplicate bird-plant pair "${bp.bird_slug}" + "${bp.plant_slug}" in ${ctx}`);
  }
  birdPlantPairs.add(pair);
}

if (errorCount === 0) ok(`${birdPlant.length} bird-plant entries valid`);

// ---------------------------------------------------------------------------
// Validate: songs.json
// ---------------------------------------------------------------------------

section('songs.json');

const VALID_FORMATS = new Set(['opus', 'mp3', 'ogg', 'flac', 'wav']);
const songFilenames = new Set<string>();

for (const [i, song] of songs.entries()) {
  const ctx = `songs.json[${i}]`;
  if (!birdSlugs.has(song.bird_slug)) fail(`Unknown bird_slug "${song.bird_slug}" in ${ctx}`);
  if (!song.filename?.trim()) fail(`Missing filename in ${ctx}`);
  if (songFilenames.has(song.filename)) fail(`Duplicate filename "${song.filename}" in ${ctx}`);
  songFilenames.add(song.filename);
  if (!VALID_FORMATS.has(song.format)) fail(`Unknown format "${song.format}" in ${ctx}`);
  if (!song.source_url?.trim()) fail(`Missing source_url in ${ctx}`);
  if (!song.license?.trim()) fail(`Missing license in ${ctx}`);
  if (song.duration_sec != null && (song.duration_sec <= 0 || !Number.isFinite(song.duration_sec))) {
    fail(`Invalid duration_sec in ${ctx}: ${song.duration_sec}`);
  }
  if (song.recording_date && !/^\d{4}-\d{2}-\d{2}$/.test(song.recording_date)) {
    fail(`recording_date must be YYYY-MM-DD in ${ctx}: "${song.recording_date}"`);
  }
}

if (songs.length === 0) {
  console.log('  (no songs — skipping)');
} else {
  ok(`${songs.length} songs valid`);
}

// ---------------------------------------------------------------------------
// Validate: images.json
// ---------------------------------------------------------------------------

section('images.json');

const VALID_ENTITY_TYPES = new Set(['bird', 'plant']);
const imageFilenames = new Set<string>();

for (const [i, img] of images.entries()) {
  const ctx = `images.json[${i}]`;
  if (!VALID_ENTITY_TYPES.has(img.entity_type)) {
    fail(`Unknown entity_type "${img.entity_type}" in ${ctx}`);
    continue;
  }
  const slugSet = img.entity_type === 'bird' ? birdSlugs : plantSlugs;
  if (!slugSet.has(img.entity_slug)) {
    fail(`Unknown ${img.entity_type} slug "${img.entity_slug}" in ${ctx}`);
  }
  if (!img.filename?.trim()) fail(`Missing filename in ${ctx}`);
  if (imageFilenames.has(img.filename)) fail(`Duplicate filename "${img.filename}" in ${ctx}`);
  imageFilenames.add(img.filename);
  if (!img.alt_text?.trim()) fail(`Missing alt_text in ${ctx}`);
  if (!img.source_url?.trim()) fail(`Missing source_url in ${ctx}`);
  if (!img.license?.trim()) fail(`Missing license in ${ctx}`);
  if (img.is_primary != null && img.is_primary !== 0 && img.is_primary !== 1) {
    fail(`is_primary must be 0 or 1 in ${ctx}: ${img.is_primary}`);
  }
}

if (images.length === 0) {
  console.log('  (no images — skipping)');
} else {
  ok(`${images.length} images valid`);
}

// ---------------------------------------------------------------------------
// Coverage report
// ---------------------------------------------------------------------------

section('coverage');

const birdsWithSongs  = new Set(songs.map((s) => s.bird_slug));
const birdsWithImages = new Set(
  images.filter((i) => i.entity_type === 'bird').map((i) => i.entity_slug),
);
const plantsWithImages = new Set(
  images.filter((i) => i.entity_type === 'plant').map((i) => i.entity_slug),
);

const birdsNoSong    = birds.filter((b) => !birdsWithSongs.has(b.slug));
const birdsNoImage   = birds.filter((b) => !birdsWithImages.has(b.slug));
const plantsNoImage  = plants.filter((p) => !plantsWithImages.has(p.slug));

if (birdsNoSong.length > 0) {
  console.log(`  ⚠ Birds missing songs  (${birdsNoSong.length}): ${birdsNoSong.map((b) => b.slug).join(', ')}`);
}
if (birdsNoImage.length > 0) {
  console.log(`  ⚠ Birds missing images (${birdsNoImage.length}): ${birdsNoImage.map((b) => b.slug).join(', ')}`);
}
if (plantsNoImage.length > 0) {
  console.log(`  ⚠ Plants missing images (${plantsNoImage.length}): ${plantsNoImage.map((p) => p.slug).join(', ')}`);
}
if (birdsNoSong.length === 0 && birdsNoImage.length === 0 && plantsNoImage.length === 0) {
  ok('All birds have songs and images; all plants have images');
}

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

console.log('');
if (errorCount > 0) {
  console.error(`Validation FAILED: ${errorCount} error${errorCount === 1 ? '' : 's'} found.`);
  process.exit(1);
} else {
  console.log('Validation PASSED — all seed data is valid.');
}
