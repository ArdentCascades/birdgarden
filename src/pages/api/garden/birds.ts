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
