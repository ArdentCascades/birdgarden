/**
 * GET /api/songs/[id]
 *
 * Streams an audio file. Supports HTTP Range headers for seeking.
 *
 * Security:
 *   - ID must be a positive integer
 *   - Filename resolved from DB (trusted source)
 *   - Path verified to stay within media root (getSongPath)
 *   - Content-Disposition: inline (prevents unexpected downloads)
 *   - Never reveals internal file paths in error responses
 *
 * Fully implemented in Task 5.
 */
import type { APIRoute } from 'astro';

export const prerender = false;

export const GET: APIRoute = async ({ params: _params, request: _request }) => {
  // TODO: Implement in Task 5
  return new Response(
    JSON.stringify({ error: 'Not yet implemented', code: 'NOT_IMPLEMENTED' }),
    { status: 501, headers: { 'Content-Type': 'application/json' } },
  );
};
