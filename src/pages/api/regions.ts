/**
 * GET /api/regions
 *
 * Returns the region hierarchy for use by the client-side region selector
 * and geolocation lookup. Includes lat/lng centroids so the client can
 * find the nearest region without sending coordinates to the server.
 *
 * Fully implemented in Task 5.
 */
import type { APIRoute } from 'astro';

export const prerender = false;

export const GET: APIRoute = async ({ request: _request }) => {
  // TODO: Implement in Task 5
  // - Validate query params (level, parent_id) via validate.ts
  // - Apply rate limiting via rateLimit.ts
  // - Query DB, return JSON
  return new Response(
    JSON.stringify({ error: 'Not yet implemented', code: 'NOT_IMPLEMENTED' }),
    { status: 501, headers: { 'Content-Type': 'application/json' } },
  );
};
