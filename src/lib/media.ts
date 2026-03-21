/**
 * media.ts — Safe file path resolution for audio and image files
 *
 * Security: All resolved paths are verified to stay within the media root
 * directory. This prevents path traversal attacks.
 *
 * Filenames come from the database (trusted source), but we still verify
 * as defense-in-depth.
 */

import { resolve, join } from 'node:path';

const MEDIA_ROOT = resolve(process.env['MEDIA_PATH'] ?? './media');

/**
 * Resolve a song filename to an absolute path within the media/songs directory.
 * Throws if the resolved path escapes the media root.
 */
export function getSongPath(filename: string): string {
  // Reject obvious traversal patterns early (defense-in-depth)
  if (filename.includes('\0') || filename.includes('..')) {
    throw new Error('Invalid file path');
  }

  const resolved = resolve(join(MEDIA_ROOT, 'songs', filename));

  if (!resolved.startsWith(MEDIA_ROOT + '/') && resolved !== MEDIA_ROOT) {
    throw new Error('Invalid file path');
  }

  return resolved;
}

/**
 * Resolve an image filename to an absolute path within media/images/.
 * Throws if the resolved path escapes the media root.
 */
export function getImagePath(entityType: 'bird' | 'plant', filename: string): string {
  if (filename.includes('\0') || filename.includes('..')) {
    throw new Error('Invalid file path');
  }

  const resolved = resolve(join(MEDIA_ROOT, 'images', entityType + 's', filename));

  if (!resolved.startsWith(MEDIA_ROOT + '/') && resolved !== MEDIA_ROOT) {
    throw new Error('Invalid file path');
  }

  return resolved;
}

/** Returns the public URL path for a song file (served by Caddy) */
export function getSongPublicUrl(filename: string): string {
  // Validate it's a safe filename before constructing URL
  if (!isSafeFilename(filename)) {
    throw new Error('Invalid filename');
  }
  return `/media/songs/${encodeURIComponent(filename)}`;
}

/** Returns the public URL path for an image file */
export function getImagePublicUrl(entityType: 'bird' | 'plant', filename: string): string {
  if (!isSafeFilename(filename)) {
    throw new Error('Invalid filename');
  }
  return `/media/images/${entityType}s/${encodeURIComponent(filename)}`;
}

/** Check that a filename contains only safe characters */
function isSafeFilename(filename: string): boolean {
  // Allow: alphanumeric, hyphens, underscores, dots, forward slashes (for subdirs)
  // Disallow: null bytes, double dots, absolute paths
  return (
    typeof filename === 'string' &&
    filename.length > 0 &&
    filename.length <= 255 &&
    !filename.includes('\0') &&
    !filename.includes('..') &&
    !filename.startsWith('/') &&
    /^[a-zA-Z0-9._/-]+$/.test(filename)
  );
}
