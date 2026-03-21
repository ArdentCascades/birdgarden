/**
 * GET /api/plants
 *
 * Query params:
 *   region   {slug}  — plants native to region (required)
 *   month    {1-12}  — currently blooming (optional)
 *   type     {tree|shrub|perennial|grass|vine} (optional)
 *   sort     {birds|alpha|bloom} (optional, default: birds)
 *   q        {search} — FTS5 search (optional)
 *   limit    {1-100}  — pagination (optional, default: 20)
 *   offset   {0-10000} (optional, default: 0)
 */
import type { APIRoute } from 'astro';
import { getDb } from '@lib/db.ts';
import { getPlants } from '@lib/queries.ts';
import { rateLimit, getRateLimitHeaders } from '@/middleware/rateLimit.ts';
import {
  ValidationError,
  validateSlug,
  validateMonth,
  validatePlantType,
  validatePlantSort,
  validateSearch,
  validateLimit,
  validateOffset,
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
  const regionParam = url.searchParams.get('region');
  const monthParam = url.searchParams.get('month');
  const typeParam = url.searchParams.get('type');
  const sortParam = url.searchParams.get('sort');
  const searchParam = url.searchParams.get('q');
  const limitParam = url.searchParams.get('limit') ?? '20';
  const offsetParam = url.searchParams.get('offset') ?? '0';

  if (!regionParam) {
    return new Response(
      JSON.stringify({ error: 'Missing required parameter: region', code: 'VALIDATION_ERROR' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...rateLimitHeaders } },
    );
  }

  try {
    const regionSlug = validateSlug(regionParam);
    const month = monthParam ? validateMonth(monthParam) : undefined;
    const plantType = typeParam ? validatePlantType(typeParam) : undefined;
    const sort = sortParam ? validatePlantSort(sortParam) : 'birds';
    const search = searchParam ? validateSearch(searchParam) : undefined;
    const limit = validateLimit(limitParam);
    const offset = validateOffset(offsetParam);

    const db = getDb();
    const { plants, total } = getPlants(db, {
      regionSlug,
      month,
      plantType,
      sort,
      search: search && search.length > 0 ? search : undefined,
      limit,
      offset,
    });

    return new Response(
      JSON.stringify({ plants, total, limit, offset }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...rateLimitHeaders } },
    );
  } catch (err) {
    if (err instanceof ValidationError) {
      return new Response(
        JSON.stringify({ error: 'Invalid request parameters', code: 'VALIDATION_ERROR' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...rateLimitHeaders } },
      );
    }
    console.error('[GET /api/plants]', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error', code: 'SERVER_ERROR' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...rateLimitHeaders } },
    );
  }
};
