/**
 * rateLimit.ts — Sliding-window rate limiter
 *
 * Limits per IP per minute:
 *   - API endpoints:    60 requests
 *   - Audio streaming:  30 requests
 *   - Page requests:   120 requests
 *
 * Storage strategy:
 *   - Production (Node.js + better-sqlite3 available): SQLite-on-disk so that
 *     limits survive process restarts and are visible to all workers sharing
 *     the same filesystem.
 *   - Test / Bun runtime: better-sqlite3 is not supported in Bun (it's a
 *     native Node.js addon). In that case the limiter transparently falls back
 *     to an in-memory Map. Limits reset on restart and are not shared across
 *     processes, but that is acceptable for tests and local dev.
 *
 * The public interface (rateLimit / getRateLimitHeaders) is identical in both
 * modes, so callers never need to care which backend is active.
 */

import { resolve } from 'node:path';

const WINDOW_MS = 60_000; // 1 minute
const MAX_API_REQUESTS = 60;
const MAX_AUDIO_REQUESTS = 30;
const MAX_PAGE_REQUESTS = 120;

// ---------------------------------------------------------------------------
// Backend selection — try SQLite, fall back to in-memory
// ---------------------------------------------------------------------------

type Backend = 'sqlite' | 'memory';

interface SqliteDb {
  upsert: (key: string, newResetAt: number) => { count: number; reset_at: number };
  get: (key: string) => { count: number; reset_at: number } | undefined;
  cleanup: (now: number) => void;
}

let backend: Backend = 'memory';
let sqliteDb: SqliteDb | null = null;

function tryInitSqlite(): void {
  try {
    // Dynamic require so Bun's module resolver doesn't choke on the native import
    // even when better-sqlite3 is unavailable.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Database = require('better-sqlite3') as typeof import('better-sqlite3');

    const RL_DB_PATH = resolve(
      process.env['RL_DB_PATH'] ?? './db/rate-limit.sqlite',
    );

    const db = new Database(RL_DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.pragma('busy_timeout = 1000');

    db.exec(`
      CREATE TABLE IF NOT EXISTS rate_limit (
        key       TEXT    PRIMARY KEY,
        count     INTEGER NOT NULL DEFAULT 0,
        reset_at  INTEGER NOT NULL
      ) STRICT;
    `);

    const upsertStmt = db.prepare(`
      INSERT INTO rate_limit (key, count, reset_at)
      VALUES (?, 1, ?)
      ON CONFLICT(key) DO UPDATE SET
        count    = CASE WHEN excluded.reset_at > reset_at THEN 1 ELSE count + 1 END,
        reset_at = CASE WHEN excluded.reset_at > reset_at THEN excluded.reset_at ELSE reset_at END
      RETURNING count, reset_at
    `);

    const getStmt = db.prepare(
      'SELECT count, reset_at FROM rate_limit WHERE key = ?',
    );

    const cleanupStmt = db.prepare(
      'DELETE FROM rate_limit WHERE reset_at <= ?',
    );

    sqliteDb = {
      upsert: (key, newResetAt) =>
        upsertStmt.get(key, newResetAt) as { count: number; reset_at: number },
      get: (key) =>
        getStmt.get(key) as { count: number; reset_at: number } | undefined,
      cleanup: (now) => cleanupStmt.run(now),
    };

    backend = 'sqlite';

    // Periodically purge expired entries (every minute)
    const interval = setInterval(() => sqliteDb?.cleanup(Date.now()), WINDOW_MS);
    interval.unref?.();
  } catch {
    // better-sqlite3 unavailable (Bun runtime, or missing native build).
    // Fall through — in-memory backend will be used.
    backend = 'memory';
  }
}

// Attempt SQLite init once at module load. In production this succeeds; in
// Bun test runners it fails silently and uses the memory backend.
tryInitSqlite();

// ---------------------------------------------------------------------------
// In-memory fallback
// ---------------------------------------------------------------------------

interface MemEntry {
  count: number;
  resetAt: number;
}

const memWindows = new Map<string, MemEntry>();

const memCleanup = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of memWindows) {
    if (now > entry.resetAt) memWindows.delete(key);
  }
}, WINDOW_MS);
memCleanup.unref?.();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

function maxForType(type: 'api' | 'audio' | 'page'): number {
  return type === 'audio' ? MAX_AUDIO_REQUESTS
    : type === 'page' ? MAX_PAGE_REQUESTS
    : MAX_API_REQUESTS;
}

/**
 * Check if the given IP is within its rate limit for the request type.
 * Returns true if the request should be allowed, false if rate limited.
 */
export function rateLimit(ip: string, type: 'api' | 'audio' | 'page' = 'api'): boolean {
  const max = maxForType(type);
  const key = `${ip}:${type}`;

  if (backend === 'sqlite' && sqliteDb) {
    try {
      const row = sqliteDb.upsert(key, Date.now() + WINDOW_MS);
      return row.count <= max;
    } catch (err) {
      console.error('[rateLimit] SQLite error, falling back to memory:', err);
      backend = 'memory';
      // Fall through to memory path below
    }
  }

  // In-memory path
  const now = Date.now();
  const entry = memWindows.get(key);
  if (!entry || now > entry.resetAt) {
    memWindows.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (entry.count >= max) return false;
  entry.count++;
  return true;
}

/**
 * Returns rate limit headers to include in responses.
 */
export function getRateLimitHeaders(
  ip: string,
  type: 'api' | 'audio' | 'page' = 'api',
): Record<string, string> {
  const max = maxForType(type);
  const key = `${ip}:${type}`;

  let remaining = max;
  let resetAt = Math.ceil((Date.now() + WINDOW_MS) / 1000);

  if (backend === 'sqlite' && sqliteDb) {
    try {
      const row = sqliteDb.get(key);
      if (row) {
        remaining = Math.max(0, max - row.count);
        resetAt = Math.ceil(row.reset_at / 1000);
      }
    } catch {
      // Use defaults
    }
  } else {
    const entry = memWindows.get(key);
    if (entry) {
      remaining = Math.max(0, max - entry.count);
      resetAt = Math.ceil(entry.resetAt / 1000);
    }
  }

  return {
    'X-RateLimit-Limit': String(max),
    'X-RateLimit-Remaining': String(remaining),
    'X-RateLimit-Reset': String(resetAt),
  };
}
