/**
 * GET /api/regions
 *
 * Returns the region hierarchy for use by the client-side region selector
 * and geolocation lookup. Includes lat/lng centroids so the client can
 * find the nearest region without sending coordinates to the server.
 *
 * Query params:
 *   level      {continent|country|state_province|ecoregion|hardiness_zone} (optional)
 *   parent_id  {integer} (optional)
 */
import type { APIRoute } from 'astro';
import { getDb } from '@lib/db.ts';
import { getRegions } from '@lib/queries.ts';
import { rateLimit, getRateLimitHeaders } from '@/middleware/rateLimit.ts';
import {
  ValidationError,
  validateRegionLevel,
  validatePositiveIntId,
} from '@lib/validate.ts';

export const prerender = false;

export const GET: APIRoute = async ({ request, clientAddress }) => {
  const ip = clientAddress ?? request.headers.get('x-forwarded-for') ?? 'unknown';

  const rateLimitHeaders = getRateLimitHeaders(ip, 'api');
  if (!rateLimit(ip, 'api')) {
    return new Response(
      JSON.stringify({ error: 'Too many requests', code: 'RATE_LIMITED' }),
      { status: 429, headers: { 'Content-Type': 'application/json', ...rateLimitHeaders } },
    );
  }

  const url = new URL(request.url);
  const levelParam = url.searchParams.get('level');
  const parentIdParam = url.searchParams.get('parent_id');

  try {
    const level = levelParam ? validateRegionLevel(levelParam) : undefined;
    const parentId = parentIdParam ? validatePositiveIntId(parentIdParam) : undefined;

    const db = getDb();
    const regions = getRegions(db, { level, parentId });

    return new Response(JSON.stringify({ regions }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...rateLimitHeaders },
    });
  } catch (err) {
    if (err instanceof ValidationError) {
      return new Response(
        JSON.stringify({ error: 'Invalid request parameters', code: 'VALIDATION_ERROR' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...rateLimitHeaders } },
      );
    }
    console.error('[GET /api/regions]', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error', code: 'SERVER_ERROR' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...rateLimitHeaders } },
    );
  }
};
