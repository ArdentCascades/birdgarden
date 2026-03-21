/**
 * seed-db.ts — Reads JSON seed data → inserts into SQLite
 *
 * Uses bun:sqlite (built-in) since this script runs in Bun's runtime.
 * The production app uses better-sqlite3 (Node.js runtime via Astro node adapter).
 *
 * Usage:
 *   bun run scripts/seed-db.ts
 */

import { Database } from 'bun:sqlite';
import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

const DB_PATH = resolve(process.env['DB_PATH'] ?? './db/bird-garden.sqlite');
const SCHEMA_PATH = resolve('./db/schema.sql');
const SEED_DIR = resolve('./db/seed-data');

const db = new Database(DB_PATH, { create: true });
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');
db.exec('PRAGMA trusted_schema = OFF');
db.exec('PRAGMA cell_size_check = ON');

function loadJson<T>(filename: string): T {
  return JSON.parse(readFileSync(join(SEED_DIR, filename), 'utf-8')) as T;
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------
function applySchema() {
  const schema = readFileSync(SCHEMA_PATH, 'utf-8');
  db.exec(schema);
  console.log('Schema applied.');
}

// ---------------------------------------------------------------------------
// Regions
// ---------------------------------------------------------------------------
interface RegionRecord {
  slug: string;
  name: string;
  level: string;
  parent_slug: string | null;
  latitude: number | null;
  longitude: number | null;
}

function seedRegions() {
  const regions = loadJson<RegionRecord[]>('regions.json');
  const levelOrder = ['continent', 'country', 'state_province', 'ecoregion', 'hardiness_zone'];
  const sorted = [...regions].sort(
    (a, b) => levelOrder.indexOf(a.level) - levelOrder.indexOf(b.level),
  );

  const insertRegion = db.prepare(`
    INSERT OR IGNORE INTO region (slug, name, level, parent_id, latitude, longitude)
    VALUES ($slug, $name, $level, $parent_id, $latitude, $longitude)
  `);
  const getIdBySlug = db.prepare<{ id: number }, [string]>(
    'SELECT id FROM region WHERE slug = ?',
  );

  const insertMany = db.transaction((rows: RegionRecord[]) => {
    for (const r of rows) {
      let parent_id: number | null = null;
      if (r.parent_slug) {
        const parent = getIdBySlug.get(r.parent_slug);
        parent_id = parent?.id ?? null;
      }
      insertRegion.run({
        $slug: r.slug,
        $name: r.name,
        $level: r.level,
        $parent_id: parent_id,
        $latitude: r.latitude ?? null,
        $longitude: r.longitude ?? null,
      });
    }
  });
  insertMany(sorted);
  console.log(`Seeded ${regions.length} regions.`);
}

// ---------------------------------------------------------------------------
// Birds
// ---------------------------------------------------------------------------
interface BirdRecord {
  slug: string;
  common_name: string;
  scientific_name: string;
  family?: string;
  description?: string;
  conservation_status?: string;
}

function seedBirds() {
  const birds = loadJson<BirdRecord[]>('birds.json');
  const insert = db.prepare(`
    INSERT OR IGNORE INTO bird (slug, common_name, scientific_name, family, description, conservation_status)
    VALUES ($slug, $common_name, $scientific_name, $family, $description, $conservation_status)
  `);
  const insertMany = db.transaction((rows: BirdRecord[]) => {
    for (const b of rows) {
      insert.run({
        $slug: b.slug,
        $common_name: b.common_name,
        $scientific_name: b.scientific_name,
        $family: b.family ?? null,
        $description: b.description ?? null,
        $conservation_status: b.conservation_status ?? null,
      });
    }
  });
  insertMany(birds);
  const { n } = db.prepare('SELECT COUNT(*) as n FROM bird').get() as { n: number };
  console.log(`Seeded ${n} birds.`);
}

// ---------------------------------------------------------------------------
// Plants
// ---------------------------------------------------------------------------
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

function seedPlants() {
  const plants = loadJson<PlantRecord[]>('plants.json');
  const insert = db.prepare(`
    INSERT OR IGNORE INTO plant
      (slug, common_name, scientific_name, family, plant_type, description,
       usda_zone_min, usda_zone_max, bloom_start, bloom_end)
    VALUES
      ($slug, $common_name, $scientific_name, $family, $plant_type, $description,
       $usda_zone_min, $usda_zone_max, $bloom_start, $bloom_end)
  `);
  const insertMany = db.transaction((rows: PlantRecord[]) => {
    for (const p of rows) {
      insert.run({
        $slug: p.slug,
        $common_name: p.common_name,
        $scientific_name: p.scientific_name,
        $family: p.family ?? null,
        $plant_type: p.plant_type ?? null,
        $description: p.description ?? null,
        $usda_zone_min: p.usda_zone_min ?? null,
        $usda_zone_max: p.usda_zone_max ?? null,
        $bloom_start: p.bloom_start ?? null,
        $bloom_end: p.bloom_end ?? null,
      });
    }
  });
  insertMany(plants);
  const { n } = db.prepare('SELECT COUNT(*) as n FROM plant').get() as { n: number };
  console.log(`Seeded ${n} plants.`);
}

// ---------------------------------------------------------------------------
// Plant ↔ Region  (all plants linked to all state-level regions)
// ---------------------------------------------------------------------------
function seedPlantRegions() {
  const allPlants = db.prepare('SELECT id FROM plant').all() as { id: number }[];
  const stateRegions = db
    .prepare("SELECT id FROM region WHERE level = 'state_province'")
    .all() as { id: number }[];

  const insert = db.prepare(
    'INSERT OR IGNORE INTO plant_region (plant_id, region_id) VALUES (?, ?)',
  );
  const insertMany = db.transaction(() => {
    for (const plant of allPlants) {
      for (const region of stateRegions) {
        insert.run(plant.id, region.id);
      }
    }
  });
  insertMany();
  const { n } = db.prepare('SELECT COUNT(*) as n FROM plant_region').get() as { n: number };
  console.log(`Seeded ${n} plant_region rows.`);
}

// ---------------------------------------------------------------------------
// Bird ↔ Plant  (bird-plant.json)
// ---------------------------------------------------------------------------
interface BirdPlantRecord {
  bird_slug: string;
  plant_slug: string;
  attraction_type: string;
}

function seedBirdPlant() {
  const rows = loadJson<BirdPlantRecord[]>('bird-plant.json');
  const getBirdId = db.prepare<{ id: number }, [string]>('SELECT id FROM bird WHERE slug = ?');
  const getPlantId = db.prepare<{ id: number }, [string]>('SELECT id FROM plant WHERE slug = ?');
  const insert = db.prepare(
    'INSERT OR IGNORE INTO bird_plant (bird_id, plant_id, attraction_type) VALUES (?, ?, ?)',
  );

  const insertMany = db.transaction((items: BirdPlantRecord[]) => {
    for (const row of items) {
      const bird = getBirdId.get(row.bird_slug);
      const plant = getPlantId.get(row.plant_slug);
      if (!bird) { console.warn(`  Unknown bird slug: ${row.bird_slug}`); continue; }
      if (!plant) { console.warn(`  Unknown plant slug: ${row.plant_slug}`); continue; }
      insert.run(bird.id, plant.id, row.attraction_type);
    }
  });
  insertMany(rows);
  const { n } = db.prepare('SELECT COUNT(*) as n FROM bird_plant').get() as { n: number };
  console.log(`Seeded ${n} bird_plant rows.`);
}

// ---------------------------------------------------------------------------
// Bird ↔ Region ↔ Season  (generated from rules)
// ---------------------------------------------------------------------------
function seedBirdRegionSeason() {
  const getBirdId = db.prepare<{ id: number }, [string]>('SELECT id FROM bird WHERE slug = ?');
  const getRegionId = db.prepare<{ id: number }, [string]>('SELECT id FROM region WHERE slug = ?');
  const insert = db.prepare(`
    INSERT OR IGNORE INTO bird_region_season
      (bird_id, region_id, month, presence, temp_min_c, temp_max_c)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const ALL_MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const SUMMER = [4, 5, 6, 7, 8, 9];
  const WINTER = [10, 11, 12, 1, 2, 3];

  const EASTERN = ['texas', 'florida', 'new-york', 'illinois', 'georgia-us', 'pennsylvania', 'michigan', 'ontario'];
  const WESTERN = ['california', 'oregon', 'washington', 'colorado', 'british-columbia'];
  const ALL_REGIONS = [...EASTERN, ...WESTERN];

  type Rule = {
    bird_slug: string;
    regions: string[];
    months: number[];
    presence: string;
    temp_min_c: number | null;
    temp_max_c: number | null;
  };

  const rules: Rule[] = [
    { bird_slug: 'northern-cardinal',       regions: EASTERN,     months: ALL_MONTHS, presence: 'resident',  temp_min_c: -15, temp_max_c: 40 },
    { bird_slug: 'tufted-titmouse',          regions: EASTERN,     months: ALL_MONTHS, presence: 'resident',  temp_min_c: -10, temp_max_c: 38 },
    { bird_slug: 'carolina-wren',            regions: EASTERN,     months: ALL_MONTHS, presence: 'resident',  temp_min_c: -5,  temp_max_c: 40 },
    { bird_slug: 'eastern-bluebird',         regions: EASTERN,     months: ALL_MONTHS, presence: 'resident',  temp_min_c: -10, temp_max_c: 38 },
    { bird_slug: 'northern-mockingbird',     regions: ['texas', 'florida', 'georgia-us', 'pennsylvania', 'new-york'], months: ALL_MONTHS, presence: 'resident', temp_min_c: -5, temp_max_c: 42 },
    { bird_slug: 'american-goldfinch',       regions: ALL_REGIONS, months: ALL_MONTHS, presence: 'resident',  temp_min_c: -20, temp_max_c: 38 },
    { bird_slug: 'american-robin',           regions: ALL_REGIONS, months: ALL_MONTHS, presence: 'resident',  temp_min_c: -15, temp_max_c: 38 },
    { bird_slug: 'black-capped-chickadee',   regions: ['new-york', 'illinois', 'pennsylvania', 'michigan', 'ontario', 'oregon', 'washington', 'colorado', 'british-columbia'], months: ALL_MONTHS, presence: 'resident', temp_min_c: -30, temp_max_c: 30 },
    { bird_slug: 'cedar-waxwing',            regions: ALL_REGIONS, months: ALL_MONTHS, presence: 'resident',  temp_min_c: -20, temp_max_c: 35 },
    { bird_slug: 'house-finch',              regions: ALL_REGIONS, months: ALL_MONTHS, presence: 'resident',  temp_min_c: -15, temp_max_c: 40 },
    { bird_slug: 'downy-woodpecker',         regions: ALL_REGIONS, months: ALL_MONTHS, presence: 'resident',  temp_min_c: -25, temp_max_c: 38 },
    { bird_slug: 'white-breasted-nuthatch',  regions: ALL_REGIONS, months: ALL_MONTHS, presence: 'resident',  temp_min_c: -20, temp_max_c: 35 },
    { bird_slug: 'song-sparrow',             regions: ALL_REGIONS, months: ALL_MONTHS, presence: 'resident',  temp_min_c: -20, temp_max_c: 38 },
    { bird_slug: 'ruby-throated-hummingbird',regions: EASTERN,     months: SUMMER,     presence: 'breeding',  temp_min_c: 10,  temp_max_c: 40 },
    { bird_slug: 'baltimore-oriole',         regions: EASTERN,     months: SUMMER,     presence: 'breeding',  temp_min_c: 10,  temp_max_c: 38 },
    { bird_slug: 'yellow-warbler',           regions: ALL_REGIONS, months: SUMMER,     presence: 'breeding',  temp_min_c: 5,   temp_max_c: 38 },
    { bird_slug: 'indigo-bunting',           regions: EASTERN,     months: SUMMER,     presence: 'breeding',  temp_min_c: 10,  temp_max_c: 38 },
    { bird_slug: 'gray-catbird',             regions: EASTERN,     months: SUMMER,     presence: 'breeding',  temp_min_c: 8,   temp_max_c: 38 },
    { bird_slug: 'dark-eyed-junco',          regions: ALL_REGIONS, months: WINTER,     presence: 'wintering', temp_min_c: -25, temp_max_c: 15 },
  ];

  const insertMany = db.transaction(() => {
    for (const rule of rules) {
      const bird = getBirdId.get(rule.bird_slug);
      if (!bird) { console.warn(`  Unknown bird slug: ${rule.bird_slug}`); continue; }
      for (const regionSlug of rule.regions) {
        const region = getRegionId.get(regionSlug);
        if (!region) { console.warn(`  Unknown region slug: ${regionSlug}`); continue; }
        for (const month of rule.months) {
          insert.run(bird.id, region.id, month, rule.presence, rule.temp_min_c, rule.temp_max_c);
        }
      }
    }
  });
  insertMany();

  const { n } = db.prepare('SELECT COUNT(*) as n FROM bird_region_season').get() as { n: number };
  console.log(`Seeded ${n} bird_region_season rows.`);
}

// ---------------------------------------------------------------------------
// Songs and Images (empty seed data for now)
// ---------------------------------------------------------------------------
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

function seedSongs() {
  const songs = loadJson<SongRecord[]>('songs.json');
  if (songs.length === 0) { console.log('No songs to seed.'); return; }

  const getBirdId = db.prepare<{ id: number }, [string]>('SELECT id FROM bird WHERE slug = ?');
  const insert = db.prepare(`
    INSERT OR IGNORE INTO song
      (bird_id, filename, format, duration_sec, source_url, license, recordist, recording_date, recording_loc)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertMany = db.transaction((rows: SongRecord[]) => {
    for (const s of rows) {
      const bird = getBirdId.get(s.bird_slug);
      if (!bird) { console.warn(`  Unknown bird slug: ${s.bird_slug}`); continue; }
      insert.run(bird.id, s.filename, s.format, s.duration_sec ?? null, s.source_url, s.license, s.recordist ?? null, s.recording_date ?? null, s.recording_loc ?? null);
    }
  });
  insertMany(songs);
  console.log(`Seeded ${songs.length} songs.`);
}

interface ImageRecord {
  entity_type: 'bird' | 'plant';
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

function seedImages() {
  const images = loadJson<ImageRecord[]>('images.json');
  if (images.length === 0) { console.log('No images to seed.'); return; }

  const getBirdId = db.prepare<{ id: number }, [string]>('SELECT id FROM bird WHERE slug = ?');
  const getPlantId = db.prepare<{ id: number }, [string]>('SELECT id FROM plant WHERE slug = ?');
  const insert = db.prepare(`
    INSERT OR IGNORE INTO image
      (entity_type, entity_id, filename, alt_text, width, height, source_url, license, author, is_primary)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertMany = db.transaction((rows: ImageRecord[]) => {
    for (const img of rows) {
      const entity = img.entity_type === 'bird'
        ? getBirdId.get(img.entity_slug)
        : getPlantId.get(img.entity_slug);
      if (!entity) { console.warn(`  Unknown ${img.entity_type} slug: ${img.entity_slug}`); continue; }
      insert.run(img.entity_type, entity.id, img.filename, img.alt_text, img.width ?? null, img.height ?? null, img.source_url, img.license, img.author ?? null, img.is_primary ?? 0);
    }
  });
  insertMany(images);
  console.log(`Seeded ${images.length} images.`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
console.log(`Seeding database: ${DB_PATH}`);
applySchema();
seedRegions();
seedBirds();
seedPlants();
seedPlantRegions();
seedBirdPlant();
seedBirdRegionSeason();
seedSongs();
seedImages();
db.close();
console.log('Done.');
