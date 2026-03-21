/**
 * GET /api/birds
 *
 * Query params:
 *   plant    {slug}   — birds attracted to this plant (required)
 *   region   {slug}   — present in this region (required)
 *   month    {1-12}   — present this month (required)
 *   temp_c   {number} — within temperature range (optional)
 */
import type { APIRoute } from 'astro';
import { getDb } from '@lib/db.ts';
import { getBirdsForPlant, getSongsForBird } from '@lib/queries.ts';
import { rateLimit, getRateLimitHeaders } from '@/middleware/rateLimit.ts';
import {
  ValidationError,
  validateSlug,
  validateMonth,
  validateTemp,
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
  const plantParam = url.searchParams.get('plant');
  const regionParam = url.searchParams.get('region');
  const monthParam = url.searchParams.get('month');
  const tempParam = url.searchParams.get('temp_c');

  // All three are required
  if (!plantParam || !regionParam || !monthParam) {
    return new Response(
      JSON.stringify({
        error: 'Missing required parameters: plant, region, month',
        code: 'VALIDATION_ERROR',
      }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...rateLimitHeaders } },
    );
  }

  try {
    const plantSlug = validateSlug(plantParam);
    const regionSlug = validateSlug(regionParam);
    const month = validateMonth(monthParam);
    const tempC = tempParam ? validateTemp(tempParam) : undefined;

    const db = getDb();
    const birds = getBirdsForPlant(db, { plantSlug, regionSlug, month, tempC });

    // Attach songs to each bird
    const birdsWithSongs = birds.map((bird) => ({
      ...bird,
      songs: getSongsForBird(db, bird.id),
    }));

    return new Response(
      JSON.stringify({ birds: birdsWithSongs }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...rateLimitHeaders } },
    );
  } catch (err) {
    if (err instanceof ValidationError) {
      return new Response(
        JSON.stringify({ error: 'Invalid request parameters', code: 'VALIDATION_ERROR' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...rateLimitHeaders } },
      );
    }
    console.error('[GET /api/birds]', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error', code: 'SERVER_ERROR' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...rateLimitHeaders } },
    );
  }
};
