/**
 * GET /api/birds
 *
 * Query params:
 *   plant    {slug}   — birds attracted to this plant (required)
 *   region   {slug}   — present in this region (required)
 *   month    {1-12}   — present this month (required)
 *   temp_c   {number} — within temperature range (optional)
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
