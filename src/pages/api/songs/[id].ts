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
 */
import type { APIRoute } from 'astro';
import { openSync, readSync, closeSync, statSync, existsSync } from 'node:fs';
import { getDb } from '@lib/db.ts';
import { getSongById } from '@lib/queries.ts';
import { getSongPath } from '@lib/media.ts';
import { rateLimit, getRateLimitHeaders } from '@/middleware/rateLimit.ts';
import { ValidationError, validatePositiveIntId } from '@lib/validate.ts';

export const prerender = false;

const MIME: Record<string, string> = {
  opus: 'audio/ogg; codecs=opus',
  mp3: 'audio/mpeg',
};

export const GET: APIRoute = async ({ params, request, clientAddress }) => {
  const ip = clientAddress ?? request.headers.get('x-forwarded-for') ?? 'unknown';

  const rateLimitHeaders = getRateLimitHeaders(ip, 'audio');
  if (!rateLimit(ip, 'audio')) {
    return new Response(
      JSON.stringify({ error: 'Too many requests', code: 'RATE_LIMITED' }),
      { status: 429, headers: { 'Content-Type': 'application/json', ...rateLimitHeaders } },
    );
  }

  try {
    const id = validatePositiveIntId(params['id']);

    const db = getDb();
    const song = getSongById(db, id);
    if (!song) {
      return new Response(
        JSON.stringify({ error: 'Not found', code: 'NOT_FOUND' }),
        { status: 404, headers: { 'Content-Type': 'application/json', ...rateLimitHeaders } },
      );
    }

    let filePath: string;
    try {
      filePath = getSongPath(song.filename);
    } catch {
      return new Response(
        JSON.stringify({ error: 'Not found', code: 'NOT_FOUND' }),
        { status: 404, headers: { 'Content-Type': 'application/json', ...rateLimitHeaders } },
      );
    }

    if (!existsSync(filePath)) {
      return new Response(
        JSON.stringify({ error: 'Not found', code: 'NOT_FOUND' }),
        { status: 404, headers: { 'Content-Type': 'application/json', ...rateLimitHeaders } },
      );
    }

    const stats = statSync(filePath);
    const fileSize = stats.size;
    const mimeType = MIME[song.format] ?? 'application/octet-stream';

    const rangeHeader = request.headers.get('range');
    if (rangeHeader) {
      const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
      if (match) {
        const start = parseInt(match[1]!, 10);
        const end = match[2] ? parseInt(match[2], 10) : fileSize - 1;

        if (start > end || start >= fileSize) {
          return new Response(null, {
            status: 416,
            headers: {
              'Content-Range': `bytes */${fileSize}`,
              ...rateLimitHeaders,
            },
          });
        }

        const chunkSize = end - start + 1;
        const buffer = Buffer.alloc(chunkSize);
        const fd = openSync(filePath, 'r');
        readSync(fd, buffer, 0, chunkSize, start);
        closeSync(fd);

        return new Response(buffer, {
          status: 206,
          headers: {
            'Content-Type': mimeType,
            'Content-Length': String(chunkSize),
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Disposition': 'inline',
            'Cache-Control': 'public, max-age=3600',
            ...rateLimitHeaders,
          },
        });
      }
    }

    // Full file response
    const buffer = Buffer.alloc(fileSize);
    const fd = openSync(filePath, 'r');
    readSync(fd, buffer, 0, fileSize, 0);
    closeSync(fd);

    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': mimeType,
        'Content-Length': String(fileSize),
        'Accept-Ranges': 'bytes',
        'Content-Disposition': 'inline',
        'Cache-Control': 'public, max-age=3600',
        ...rateLimitHeaders,
      },
    });
  } catch (err) {
    if (err instanceof ValidationError) {
      return new Response(
        JSON.stringify({ error: 'Invalid identifier', code: 'VALIDATION_ERROR' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...rateLimitHeaders } },
      );
    }
    console.error('[GET /api/songs/[id]]', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error', code: 'SERVER_ERROR' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...rateLimitHeaders } },
    );
  }
};
