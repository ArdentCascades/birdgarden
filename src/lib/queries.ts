/**
 * queries.ts — Typed query functions for all database access
 *
 * RULES:
 *   - ALL queries use parameterized statements — no string concatenation in SQL
 *   - All parameters must be validated by validate.ts BEFORE reaching these functions
 *   - Return typed results only — never expose raw DB objects
 *
 * This module is populated in Task 5. Stubs are here to establish the interface.
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

// --- Query functions (implemented in Task 5) ---

export function getRegions(
  _db: Database,
  opts?: { level?: string; parentId?: number },
): Region[] {
  // TODO: Implement in Task 5
  throw new Error('Not implemented');
}

export function getPlants(
  _db: Database,
  opts: PlantListOptions,
): { plants: Plant[]; total: number } {
  // TODO: Implement in Task 5
  throw new Error('Not implemented');
}

export function getPlantBySlug(
  _db: Database,
  slug: string,
): Plant | null {
  // TODO: Implement in Task 5
  throw new Error('Not implemented');
}

export function getBirdsForPlant(
  _db: Database,
  opts: BirdListOptions,
): BirdWithPresence[] {
  // TODO: Implement in Task 5
  throw new Error('Not implemented');
}

export function getBirdBySlug(
  _db: Database,
  slug: string,
): Bird | null {
  // TODO: Implement in Task 5
  throw new Error('Not implemented');
}

export function getSongsForBird(
  _db: Database,
  birdId: number,
): Song[] {
  // TODO: Implement in Task 5
  throw new Error('Not implemented');
}

export function getSongById(
  _db: Database,
  id: number,
): Song | null {
  // TODO: Implement in Task 5
  throw new Error('Not implemented');
}

export function getImagesForEntity(
  _db: Database,
  entityType: 'bird' | 'plant',
  entityId: number,
): Image[] {
  // TODO: Implement in Task 5
  throw new Error('Not implemented');
}

export function getBirdsForGarden(
  _db: Database,
  opts: {
    plantSlugs: string[];
    regionSlug: string;
    month: number;
    tempC?: number;
  },
): BirdWithPresence[] {
  // TODO: Implement in Task 5
  throw new Error('Not implemented');
}
