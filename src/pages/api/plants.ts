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
 *
 * Fully implemented in Task 5.
 */
import type { APIRoute } from 'astro';

export const prerender = false;

export const GET: APIRoute = async ({ request: _request }) => {
  // TODO: Implement in Task 5
  return new Response(
    JSON.stringify({ error: 'Not yet implemented', code: 'NOT_IMPLEMENTED' }),
    { status: 501, headers: { 'Content-Type': 'application/json' } },
  );
};
