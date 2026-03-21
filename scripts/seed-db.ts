/**
 * seed-db.ts — Reads JSON seed data → inserts into SQLite
 *
 * Usage:
 *   bun run scripts/seed-db.ts
 *   SEED_MODE=true bun run scripts/seed-db.ts   (explicit write mode)
 *
 * Inserts in dependency order using a single transaction per table.
 * Uses INSERT OR IGNORE — safe to re-run on existing database.
 */

import Database from 'better-sqlite3';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

// ── Configuration ──────────────────────────────────────────────────────────

const DB_PATH  = resolve(process.env['DB_PATH']  ?? './db/bird-garden.sqlite');
const SEED_DIR = resolve('./db/seed-data');
const SCHEMA   = resolve('./db/schema.sql');

// ── Seed data types ────────────────────────────────────────────────────────

interface RegionRow {
  slug: string;
  name: string;
  level: 'continent' | 'country' | 'state_province' | 'ecoregion' | 'hardiness_zone';
  parent_slug: string | null;
  latitude?: number | null;
  longitude?: number | null;
  metadata?: Record<string, unknown> | null;
}

interface BirdRow {
  slug: string;
  common_name: string;
  scientific_name: string;
  family?: string | null;
  description?: string | null;
  conservation_status?: string | null;
  metadata?: Record<string, unknown> | null;
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
  metadata?: Record<string, unknown> | null;
}

interface BirdPlantRow {
  bird_slug: string;
  plant_slug: string;
  attraction_type: string;
}

/** Compact format: one entry = one bird × one region × N months */
interface BirdRegionSeasonRow {
  bird_slug: string;
  region_slug: string;
  months: number[];
  presence: 'resident' | 'breeding' | 'wintering' | 'migrating';
  temp_min_c?: number | null;
  temp_max_c?: number | null;
}

interface PlantRegionRow {
  plant_slug: string;
  region_slugs: string[];
}

interface SongRow {
  bird_slug: string;
  filename: string;
  format: 'opus' | 'mp3';
  duration_sec?: number | null;
  source_url: string;
  license: string;
  recordist?: string | null;
  recording_date?: string | null;
  recording_loc?: string | null;
  metadata?: Record<string, unknown> | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function loadJson<T>(filename: string): T {
  const path = join(SEED_DIR, filename);
  if (!existsSync(path)) {
    console.warn(`  [skip] ${filename} not found`);
    return [] as unknown as T;
  }
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as T;
  } catch (err) {
    throw new Error(`Failed to parse ${filename}: ${err}`);
  }
}

function log(msg: string) { process.stdout.write(`  ${msg}\n`); }

// ── Main ───────────────────────────────────────────────────────────────────

console.log('\n🌱 Bird Garden — Database Seeder\n');
console.log(`  DB:     ${DB_PATH}`);
console.log(`  Schema: ${SCHEMA}\n`);

const db = new Database(DB_PATH);

// Security + performance pragmas
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = OFF'); // OFF during seeding to allow bulk inserts in any order
db.pragma('trusted_schema = OFF');
db.pragma('synchronous = NORMAL');

// ── Apply schema ───────────────────────────────────────────────────────────

console.log('📋 Applying schema…');
const schema = readFileSync(SCHEMA, 'utf-8');
db.exec(schema);
log('Schema applied (CREATE IF NOT EXISTS — idempotent)');

// ── Load seed data ─────────────────────────────────────────────────────────

console.log('\n📂 Loading seed data…');
const regions    = loadJson<RegionRow[]>('regions.json');
const birds      = loadJson<BirdRow[]>('birds.json');
const plants     = loadJson<PlantRow[]>('plants.json');
const birdPlant  = loadJson<BirdPlantRow[]>('bird-plant.json');
const birdSeason = loadJson<BirdRegionSeasonRow[]>('bird-region-season.json');
const plantReg   = loadJson<PlantRegionRow[]>('plant-region.json');
const songs      = loadJson<SongRow[]>('songs.json');

// Deduplicate within each dataset (guard against duplicate slugs in JSON)
function dedupBy<T>(arr: T[], key: keyof T): T[] {
  const seen = new Set<unknown>();
  return arr.filter(item => {
    if (seen.has(item[key])) return false;
    seen.add(item[key]);
    return true;
  });
}

const uniqueRegions = dedupBy(regions, 'slug');
const uniqueBirds   = dedupBy(birds, 'slug');
const uniquePlants  = dedupBy(plants, 'slug');

log(`Regions:      ${uniqueRegions.length}`);
log(`Birds:        ${uniqueBirds.length}`);
log(`Plants:       ${uniquePlants.length}`);
log(`Bird-Plant:   ${birdPlant.length}`);
log(`Bird-Season:  ${birdSeason.length} entries (will expand to rows)`);
log(`Plant-Region: ${plantReg.length} entries`);
log(`Songs:        ${songs.length}`);

// ── Build ID maps (slug → id) ──────────────────────────────────────────────

const regionId = new Map<string, number>();
const birdId   = new Map<string, number>();
const plantId  = new Map<string, number>();

// ── Insert regions ─────────────────────────────────────────────────────────

console.log('\n🗺️  Inserting regions…');

// Regions have a self-referential parent_id — insert in multiple passes
// until all parents are resolved.
const insertRegion = db.prepare(`
  INSERT OR IGNORE INTO region (slug, name, level, parent_id, latitude, longitude, metadata)
  VALUES (@slug, @name, @level, @parent_id, @latitude, @longitude, @metadata)
`);

// First pass: build a map of already-inserted region IDs
function refreshRegionIds() {
  const rows = db.prepare('SELECT id, slug FROM region').all() as { id: number; slug: string }[];
  for (const r of rows) regionId.set(r.slug, r.id);
}

// Insert with up to 5 passes to resolve parent references
let remaining = [...uniqueRegions];
for (let pass = 0; pass < 5 && remaining.length > 0; pass++) {
  refreshRegionIds();
  const nextPass: RegionRow[] = [];

  const insertMany = db.transaction((rows: RegionRow[]) => {
    for (const r of rows) {
      const parent_id = r.parent_slug ? (regionId.get(r.parent_slug) ?? null) : null;
      if (r.parent_slug && parent_id === null) {
        nextPass.push(r); // parent not yet inserted — defer
        continue;
      }
      insertRegion.run({
        slug: r.slug,
        name: r.name,
        level: r.level,
        parent_id,
        latitude: r.latitude ?? null,
        longitude: r.longitude ?? null,
        metadata: r.metadata ? JSON.stringify(r.metadata) : null,
      });
    }
  });

  insertMany(remaining);
  remaining = nextPass;
}

if (remaining.length > 0) {
  console.error(`  ERROR: Could not resolve parents for: ${remaining.map(r => r.slug).join(', ')}`);
  process.exit(1);
}

refreshRegionIds();
log(`Inserted: ${regionId.size} regions`);

// ── Insert birds ───────────────────────────────────────────────────────────

console.log('\n🐦 Inserting birds…');

const insertBird = db.prepare(`
  INSERT OR IGNORE INTO bird (slug, common_name, scientific_name, family, description, conservation_status, metadata)
  VALUES (@slug, @common_name, @scientific_name, @family, @description, @conservation_status, @metadata)
`);

const insertBirds = db.transaction((rows: BirdRow[]) => {
  for (const b of rows) {
    insertBird.run({
      slug: b.slug,
      common_name: b.common_name,
      scientific_name: b.scientific_name,
      family: b.family ?? null,
      description: b.description ?? null,
      conservation_status: b.conservation_status ?? null,
      metadata: b.metadata ? JSON.stringify(b.metadata) : null,
    });
  }
});

insertBirds(uniqueBirds);

const birdRows = db.prepare('SELECT id, slug FROM bird').all() as { id: number; slug: string }[];
for (const b of birdRows) birdId.set(b.slug, b.id);
log(`Inserted: ${birdId.size} birds`);

// ── Insert plants ──────────────────────────────────────────────────────────

console.log('\n🌿 Inserting plants…');

const insertPlant = db.prepare(`
  INSERT OR IGNORE INTO plant (slug, common_name, scientific_name, family, plant_type, description,
    usda_zone_min, usda_zone_max, bloom_start, bloom_end, metadata)
  VALUES (@slug, @common_name, @scientific_name, @family, @plant_type, @description,
    @usda_zone_min, @usda_zone_max, @bloom_start, @bloom_end, @metadata)
`);

const insertPlants = db.transaction((rows: PlantRow[]) => {
  for (const p of rows) {
    insertPlant.run({
      slug: p.slug,
      common_name: p.common_name,
      scientific_name: p.scientific_name,
      family: p.family ?? null,
      plant_type: p.plant_type ?? null,
      description: p.description ?? null,
      usda_zone_min: p.usda_zone_min ?? null,
      usda_zone_max: p.usda_zone_max ?? null,
      bloom_start: p.bloom_start ?? null,
      bloom_end: p.bloom_end ?? null,
      metadata: p.metadata ? JSON.stringify(p.metadata) : null,
    });
  }
});

insertPlants(uniquePlants);

const plantRows = db.prepare('SELECT id, slug FROM plant').all() as { id: number; slug: string }[];
for (const p of plantRows) plantId.set(p.slug, p.id);
log(`Inserted: ${plantId.size} plants`);

// ── Insert plant_region ────────────────────────────────────────────────────

console.log('\n🗺️  Inserting plant_region…');

const insertPlantRegion = db.prepare(`
  INSERT OR IGNORE INTO plant_region (plant_id, region_id) VALUES (@plant_id, @region_id)
`);

let prCount = 0;
let prSkipped = 0;

const insertPlantRegions = db.transaction((rows: PlantRegionRow[]) => {
  for (const entry of rows) {
    const pid = plantId.get(entry.plant_slug);
    if (!pid) { log(`  WARN: plant not found: ${entry.plant_slug}`); prSkipped++; continue; }
    for (const rslug of entry.region_slugs) {
      const rid = regionId.get(rslug);
      if (!rid) { log(`  WARN: region not found: ${rslug}`); prSkipped++; continue; }
      insertPlantRegion.run({ plant_id: pid, region_id: rid });
      prCount++;
    }
  }
});

insertPlantRegions(plantReg);
log(`Inserted: ${prCount} plant_region rows${prSkipped ? ` (${prSkipped} skipped)` : ''}`);

// ── Insert bird_plant ──────────────────────────────────────────────────────

console.log('\n🔗 Inserting bird_plant relations…');

const insertBirdPlant = db.prepare(`
  INSERT OR IGNORE INTO bird_plant (bird_id, plant_id, attraction_type)
  VALUES (@bird_id, @plant_id, @attraction_type)
`);

let bpCount = 0;
let bpSkipped = 0;

const insertBirdPlants = db.transaction((rows: BirdPlantRow[]) => {
  for (const r of rows) {
    const bid = birdId.get(r.bird_slug);
    const pid = plantId.get(r.plant_slug);
    if (!bid) { log(`  WARN: bird not found: ${r.bird_slug}`); bpSkipped++; continue; }
    if (!pid) { log(`  WARN: plant not found: ${r.plant_slug}`); bpSkipped++; continue; }
    insertBirdPlant.run({ bird_id: bid, plant_id: pid, attraction_type: r.attraction_type });
    bpCount++;
  }
});

insertBirdPlants(birdPlant);
log(`Inserted: ${bpCount} bird_plant rows${bpSkipped ? ` (${bpSkipped} skipped)` : ''}`);

// ── Insert bird_region_season ──────────────────────────────────────────────

console.log('\n📅 Inserting bird_region_season…');

const insertBRS = db.prepare(`
  INSERT OR IGNORE INTO bird_region_season (bird_id, region_id, month, presence, temp_min_c, temp_max_c)
  VALUES (@bird_id, @region_id, @month, @presence, @temp_min_c, @temp_max_c)
`);

let brsCount = 0;
let brsSkipped = 0;

const insertBRSAll = db.transaction((rows: BirdRegionSeasonRow[]) => {
  for (const entry of rows) {
    const bid = birdId.get(entry.bird_slug);
    const rid = regionId.get(entry.region_slug);
    if (!bid) { brsSkipped++; continue; }
    if (!rid) { brsSkipped++; continue; }
    for (const month of entry.months) {
      insertBRS.run({
        bird_id: bid,
        region_id: rid,
        month,
        presence: entry.presence,
        temp_min_c: entry.temp_min_c ?? null,
        temp_max_c: entry.temp_max_c ?? null,
      });
      brsCount++;
    }
  }
});

insertBRSAll(birdSeason);
log(`Inserted: ${brsCount} bird_region_season rows${brsSkipped ? ` (${brsSkipped} skipped — unknown slug)` : ''}`);

// ── Insert songs ───────────────────────────────────────────────────────────

if (songs.length > 0) {
  console.log('\n🎵 Inserting songs…');

  const insertSong = db.prepare(`
    INSERT OR IGNORE INTO song (bird_id, filename, format, duration_sec, source_url, license,
      recordist, recording_date, recording_loc, metadata)
    VALUES (@bird_id, @filename, @format, @duration_sec, @source_url, @license,
      @recordist, @recording_date, @recording_loc, @metadata)
  `);

  let songCount = 0;
  const insertSongs = db.transaction((rows: SongRow[]) => {
    for (const s of rows) {
      const bid = birdId.get(s.bird_slug);
      if (!bid) { log(`  WARN: bird not found: ${s.bird_slug}`); continue; }
      insertSong.run({
        bird_id: bid,
        filename: s.filename,
        format: s.format,
        duration_sec: s.duration_sec ?? null,
        source_url: s.source_url,
        license: s.license,
        recordist: s.recordist ?? null,
        recording_date: s.recording_date ?? null,
        recording_loc: s.recording_loc ?? null,
        metadata: s.metadata ? JSON.stringify(s.metadata) : null,
      });
      songCount++;
    }
  });

  insertSongs(songs);
  log(`Inserted: ${songCount} songs`);
}

// ── Re-enable foreign keys and verify ─────────────────────────────────────

db.pragma('foreign_keys = ON');

// Quick integrity check
const integrityResult = db.pragma('integrity_check') as { integrity_check: string }[];
const integrityOk = integrityResult[0]?.integrity_check === 'ok';

console.log('\n✅ Summary');
log(`Regions:           ${regionId.size}`);
log(`Birds:             ${birdId.size}`);
log(`Plants:            ${plantId.size}`);
log(`plant_region:      ${prCount}`);
log(`bird_plant:        ${bpCount}`);
log(`bird_region_season: ${brsCount}`);
log(`Songs:             ${songs.length}`);
log(`Integrity check:   ${integrityOk ? 'PASS' : 'FAIL'}`);

if (!integrityOk) {
  console.error('\n❌ Database integrity check failed!');
  process.exit(1);
}

db.close();
console.log('\n🌸 Database seeded successfully.\n');
