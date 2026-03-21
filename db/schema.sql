-- Bird Garden — Database Schema
-- SQLite 3 with FTS5 extension
-- Managed via: bun run scripts/seed-db.ts
-- Applied via: migrations/001_initial.sql

-- ============================================================================
-- Regions — hierarchical, supports global expansion
-- ============================================================================
CREATE TABLE IF NOT EXISTS region (
    id          INTEGER PRIMARY KEY,
    slug        TEXT UNIQUE NOT NULL,
    name        TEXT NOT NULL,
    parent_id   INTEGER REFERENCES region(id),
    level       TEXT NOT NULL CHECK (level IN ('continent','country','state_province','ecoregion','hardiness_zone')),
    latitude    REAL,    -- centroid for client-side geo-lookup
    longitude   REAL,
    metadata    TEXT     -- JSON blob: USDA zone, Köppen climate, etc.
);

CREATE INDEX IF NOT EXISTS idx_region_parent ON region(parent_id);
CREATE INDEX IF NOT EXISTS idx_region_level ON region(level);
CREATE INDEX IF NOT EXISTS idx_region_slug ON region(slug);

-- ============================================================================
-- Birds
-- ============================================================================
CREATE TABLE IF NOT EXISTS bird (
    id              INTEGER PRIMARY KEY,
    slug            TEXT UNIQUE NOT NULL,
    common_name     TEXT NOT NULL,
    scientific_name TEXT NOT NULL,
    family          TEXT,
    description     TEXT,
    conservation_status TEXT,    -- IUCN: LC, NT, VU, EN, CR
    metadata        TEXT         -- JSON: wingspan, weight, diet, etc.
);

CREATE INDEX IF NOT EXISTS idx_bird_slug ON bird(slug);

-- Full-text search over birds
CREATE VIRTUAL TABLE IF NOT EXISTS bird_fts USING fts5(
    common_name,
    scientific_name,
    family,
    description,
    content='bird',
    content_rowid='id'
);

-- Keep FTS in sync with the bird table
CREATE TRIGGER IF NOT EXISTS bird_ai AFTER INSERT ON bird BEGIN
    INSERT INTO bird_fts(rowid, common_name, scientific_name, family, description)
    VALUES (new.id, new.common_name, new.scientific_name, new.family, new.description);
END;

CREATE TRIGGER IF NOT EXISTS bird_ad AFTER DELETE ON bird BEGIN
    INSERT INTO bird_fts(bird_fts, rowid, common_name, scientific_name, family, description)
    VALUES ('delete', old.id, old.common_name, old.scientific_name, old.family, old.description);
END;

CREATE TRIGGER IF NOT EXISTS bird_au AFTER UPDATE ON bird BEGIN
    INSERT INTO bird_fts(bird_fts, rowid, common_name, scientific_name, family, description)
    VALUES ('delete', old.id, old.common_name, old.scientific_name, old.family, old.description);
    INSERT INTO bird_fts(rowid, common_name, scientific_name, family, description)
    VALUES (new.id, new.common_name, new.scientific_name, new.family, new.description);
END;

-- ============================================================================
-- Plants
-- ============================================================================
CREATE TABLE IF NOT EXISTS plant (
    id              INTEGER PRIMARY KEY,
    slug            TEXT UNIQUE NOT NULL,
    common_name     TEXT NOT NULL,
    scientific_name TEXT NOT NULL,
    family          TEXT,
    plant_type      TEXT CHECK (plant_type IN ('tree','shrub','perennial','grass','vine')),
    description     TEXT,
    usda_zone_min   INTEGER,        -- USDA hardiness zone range
    usda_zone_max   INTEGER,
    bloom_start     INTEGER CHECK (bloom_start BETWEEN 1 AND 12),
    bloom_end       INTEGER CHECK (bloom_end BETWEEN 1 AND 12),
    metadata        TEXT            -- JSON: height, spread, soil, sun, water, etc.
);

CREATE INDEX IF NOT EXISTS idx_plant_slug ON plant(slug);
CREATE INDEX IF NOT EXISTS idx_plant_type ON plant(plant_type);

-- Full-text search over plants
CREATE VIRTUAL TABLE IF NOT EXISTS plant_fts USING fts5(
    common_name,
    scientific_name,
    family,
    description,
    content='plant',
    content_rowid='id'
);

CREATE TRIGGER IF NOT EXISTS plant_ai AFTER INSERT ON plant BEGIN
    INSERT INTO plant_fts(rowid, common_name, scientific_name, family, description)
    VALUES (new.id, new.common_name, new.scientific_name, new.family, new.description);
END;

CREATE TRIGGER IF NOT EXISTS plant_ad AFTER DELETE ON plant BEGIN
    INSERT INTO plant_fts(plant_fts, rowid, common_name, scientific_name, family, description)
    VALUES ('delete', old.id, old.common_name, old.scientific_name, old.family, old.description);
END;

CREATE TRIGGER IF NOT EXISTS plant_au AFTER UPDATE ON plant BEGIN
    INSERT INTO plant_fts(plant_fts, rowid, common_name, scientific_name, family, description)
    VALUES ('delete', old.id, old.common_name, old.scientific_name, old.family, old.description);
    INSERT INTO plant_fts(rowid, common_name, scientific_name, family, description)
    VALUES (new.id, new.common_name, new.scientific_name, new.family, new.description);
END;

-- ============================================================================
-- Plant ↔ Region (native range)
-- ============================================================================
CREATE TABLE IF NOT EXISTS plant_region (
    plant_id    INTEGER NOT NULL REFERENCES plant(id) ON DELETE CASCADE,
    region_id   INTEGER NOT NULL REFERENCES region(id) ON DELETE CASCADE,
    PRIMARY KEY (plant_id, region_id)
);

CREATE INDEX IF NOT EXISTS idx_plant_region_region ON plant_region(region_id);

-- ============================================================================
-- Bird ↔ Plant attraction relationship
-- ============================================================================
CREATE TABLE IF NOT EXISTS bird_plant (
    bird_id         INTEGER NOT NULL REFERENCES bird(id) ON DELETE CASCADE,
    plant_id        INTEGER NOT NULL REFERENCES plant(id) ON DELETE CASCADE,
    attraction_type TEXT CHECK (attraction_type IN (
        'food_berry','food_seed','food_nectar','food_insect','nesting','shelter'
    )),
    PRIMARY KEY (bird_id, plant_id, attraction_type)
);

CREATE INDEX IF NOT EXISTS idx_bird_plant_plant ON bird_plant(plant_id);
CREATE INDEX IF NOT EXISTS idx_bird_plant_bird ON bird_plant(bird_id);

-- ============================================================================
-- Bird presence in regions by season
-- ============================================================================
CREATE TABLE IF NOT EXISTS bird_region_season (
    bird_id     INTEGER NOT NULL REFERENCES bird(id) ON DELETE CASCADE,
    region_id   INTEGER NOT NULL REFERENCES region(id) ON DELETE CASCADE,
    month       INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
    presence    TEXT NOT NULL CHECK (presence IN ('resident','breeding','wintering','migrating')),
    temp_min_c  REAL,       -- typical temperature range when present
    temp_max_c  REAL,
    PRIMARY KEY (bird_id, region_id, month)
);

CREATE INDEX IF NOT EXISTS idx_brs_region_month ON bird_region_season(region_id, month);
CREATE INDEX IF NOT EXISTS idx_brs_bird ON bird_region_season(bird_id);

-- ============================================================================
-- Song recordings
-- ============================================================================
CREATE TABLE IF NOT EXISTS song (
    id              INTEGER PRIMARY KEY,
    bird_id         INTEGER NOT NULL REFERENCES bird(id) ON DELETE CASCADE,
    filename        TEXT NOT NULL,       -- relative path under media/songs/
    format          TEXT NOT NULL CHECK (format IN ('opus','mp3')),
    duration_sec    REAL,
    source_url      TEXT NOT NULL,       -- original URL for verification
    license         TEXT NOT NULL,       -- 'CC0', 'CC-BY', 'CC-BY-SA', etc.
    recordist       TEXT,               -- attribution name
    recording_date  TEXT,
    recording_loc   TEXT,
    metadata        TEXT                 -- JSON: quality, call type, waveform amplitude array
);

CREATE INDEX IF NOT EXISTS idx_song_bird ON song(bird_id);

-- ============================================================================
-- Images (birds + plants)
-- ============================================================================
CREATE TABLE IF NOT EXISTS image (
    id              INTEGER PRIMARY KEY,
    entity_type     TEXT NOT NULL CHECK (entity_type IN ('bird','plant')),
    entity_id       INTEGER NOT NULL,
    filename        TEXT NOT NULL,
    alt_text        TEXT NOT NULL,       -- accessibility — always required
    width           INTEGER,
    height          INTEGER,
    source_url      TEXT NOT NULL,
    license         TEXT NOT NULL,
    author          TEXT,
    is_primary      INTEGER DEFAULT 0 CHECK (is_primary IN (0, 1)),
    metadata        TEXT                 -- JSON: lqip (base64 blur placeholder), color_palette
);

CREATE INDEX IF NOT EXISTS idx_image_entity ON image(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_image_primary ON image(entity_type, entity_id, is_primary);
