/**
 * GET /api/garden/birds
 *
 * Returns the combined bird list for a garden (multiple plants).
 *
 * Query params:
 *   plants   {slug1,slug2,...} — comma-separated plant slugs (max 50)
 *   region   {slug}
 *   month    {1-12}
 *   temp_c   {number} (optional)
 */
import type { APIRoute } from 'astro';
import { getDb } from '@lib/db.ts';
import { getBirdsForGarden, getSongsForBird } from '@lib/queries.ts';
import { rateLimit, getRateLimitHeaders } from '@/middleware/rateLimit.ts';
import {
  ValidationError,
  validateSlug,
  validateMonth,
  validateTemp,
  validatePlantList,
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
  const plantsParam = url.searchParams.get('plants');
  const regionParam = url.searchParams.get('region');
  const monthParam = url.searchParams.get('month');
  const tempParam = url.searchParams.get('temp_c');

  if (!plantsParam || !regionParam || !monthParam) {
    return new Response(
      JSON.stringify({
        error: 'Missing required parameters: plants, region, month',
        code: 'VALIDATION_ERROR',
      }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...rateLimitHeaders } },
    );
  }

  try {
    const plantSlugs = validatePlantList(plantsParam);
    const regionSlug = validateSlug(regionParam);
    const month = validateMonth(monthParam);
    const tempC = tempParam ? validateTemp(tempParam) : undefined;

    const db = getDb();
    const birds = getBirdsForGarden(db, { plantSlugs, regionSlug, month, tempC });

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
    console.error('[GET /api/garden/birds]', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error', code: 'SERVER_ERROR' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...rateLimitHeaders } },
    );
  }
};
