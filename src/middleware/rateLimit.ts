/**
 * rateLimit.ts — In-memory sliding-window rate limiter
 *
 * Limits per IP per minute:
 *   - API endpoints:    60 requests
 *   - Audio streaming:  30 requests
 *   - Page requests:   120 requests
 *
 * Implementation: Simple sliding window. Entry resets after WINDOW_MS.
 * Note: This is per-process. If running multiple instances, use a shared
 * store (Redis) for consistent limiting. For a single-server deploy this
 * is sufficient.
 */

const WINDOW_MS = 60_000; // 1 minute
const MAX_API_REQUESTS = 60;
const MAX_AUDIO_REQUESTS = 30;
const MAX_PAGE_REQUESTS = 120;

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const windows = new Map<string, RateLimitEntry>();

/**
 * Check if the given IP is within its rate limit for the request type.
 * Returns true if the request should be allowed, false if rate limited.
 */
export function rateLimit(ip: string, type: 'api' | 'audio' | 'page' = 'api'): boolean {
  const max =
    type === 'audio' ? MAX_AUDIO_REQUESTS
    : type === 'page' ? MAX_PAGE_REQUESTS
    : MAX_API_REQUESTS;

  const key = `${ip}:${type}`;
  const now = Date.now();
  const entry = windows.get(key);

  if (!entry || now > entry.resetAt) {
    windows.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }

  if (entry.count >= max) return false;

  entry.count++;
  return true;
}

/**
 * Returns rate limit headers to include in responses.
 * Helps clients understand their current limit status.
 */
export function getRateLimitHeaders(
  ip: string,
  type: 'api' | 'audio' | 'page' = 'api',
): Record<string, string> {
  const max =
    type === 'audio' ? MAX_AUDIO_REQUESTS
    : type === 'page' ? MAX_PAGE_REQUESTS
    : MAX_API_REQUESTS;

  const key = `${ip}:${type}`;
  const entry = windows.get(key);
  const remaining = entry ? Math.max(0, max - entry.count) : max;
  const resetAt = entry ? Math.ceil(entry.resetAt / 1000) : Math.ceil((Date.now() + WINDOW_MS) / 1000);

  return {
    'X-RateLimit-Limit': String(max),
    'X-RateLimit-Remaining': String(remaining),
    'X-RateLimit-Reset': String(resetAt),
  };
}

// Periodic cleanup of expired entries to prevent memory growth
const cleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of windows) {
    if (now > entry.resetAt) {
      windows.delete(key);
    }
  }
}, WINDOW_MS);

// Allow the cleanup interval to be cleared in tests
cleanupInterval.unref?.();
