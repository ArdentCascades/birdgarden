/**
 * db.ts — SQLite connection singleton
 *
 * Security pragmas applied at connection time:
 *   - WAL mode for concurrent reads without blocking
 *   - foreign_keys = ON for referential integrity enforcement
 *   - trusted_schema = OFF prevents malicious schema exploitation
 *   - cell_size_check = ON detects database corruption
 *   - query_only = ON in production — web app cannot write to DB
 *
 * The seed script overrides query_only = OFF to perform writes.
 */

import Database from 'better-sqlite3';
import { resolve } from 'node:path';

const DB_PATH = process.env['DB_PATH'] ?? './db/bird-garden.sqlite';
const IS_PROD = process.env['NODE_ENV'] === 'production';
const IS_SEED = process.env['SEED_MODE'] === 'true';

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;

  const dbPath = resolve(DB_PATH);
  _db = new Database(dbPath, {
    // Open read-only in prod (belt-and-suspenders with query_only pragma)
    readonly: IS_PROD && !IS_SEED,
  });

  // Security pragmas
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  _db.pragma('trusted_schema = OFF');
  _db.pragma('cell_size_check = ON');
  _db.pragma('busy_timeout = 5000');

  // Production: read-only enforcement at the SQLite level
  // query_only prevents any writes even if readonly flag is bypassed
  if (IS_PROD && !IS_SEED) {
    _db.pragma('query_only = ON');
  }

  return _db;
}

/** Close the database connection (used in tests and cleanup) */
export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}
