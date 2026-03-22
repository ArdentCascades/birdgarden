/**
 * GET /api/garden/coverage
 *
 * Returns 12-month bird species counts for a given set of plants + region.
 * Used by the GardenBuilder coverage chart.
 *
 * Query params:
 *   plants   {slug1,slug2,...} — comma-separated plant slugs (max 50)
 *   region   {slug}
 *
 * Response:
 *   { coverage: { month: number, count: number }[] }  — 12 entries, months 1–12
 */
import type { APIRoute } from 'astro';
import { getDb } from '@lib/db.ts';
import { getGardenCoverage } from '@lib/queries.ts';
import { rateLimit, getRateLimitHeaders } from '@/middleware/rateLimit.ts';
import { ValidationError, validateSlug, validatePlantList } from '@lib/validate.ts';

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

  if (!plantsParam || !regionParam) {
    return new Response(
      JSON.stringify({
        error: 'Missing required parameters: plants, region',
        code: 'VALIDATION_ERROR',
      }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...rateLimitHeaders } },
    );
  }

  try {
    const plantSlugs = validatePlantList(plantsParam);
    const regionSlug = validateSlug(regionParam);

    const db = getDb();
    const coverage = getGardenCoverage(db, { plantSlugs, regionSlug });

    return new Response(
      JSON.stringify({ coverage }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=300',
          ...rateLimitHeaders,
        },
      },
    );
  } catch (err) {
    if (err instanceof ValidationError) {
      return new Response(
        JSON.stringify({ error: 'Invalid request parameters', code: 'VALIDATION_ERROR' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...rateLimitHeaders } },
      );
    }
    console.error('[GET /api/garden/coverage]', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error', code: 'SERVER_ERROR' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...rateLimitHeaders } },
    );
  }
};
