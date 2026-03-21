/**
 * geo.ts — Region lookup helpers
 *
 * Client-side geolocation: coordinates are resolved to a region slug
 * entirely in the browser using centroid data from /api/regions.
 * Coordinates are NEVER sent to the server.
 *
 * This module is safe to use server-side for region hierarchy traversal
 * (without coordinates).
 */

import type { Region } from './queries.ts';

/**
 * Find the nearest region to given coordinates using Euclidean distance
 * on lat/lng (sufficient for picking the closest centroid — no need for
 * haversine for this use case).
 *
 * Returns the slug of the nearest region, or null if no regions have
 * lat/lng data.
 */
export function findNearestRegion(
  latitude: number,
  longitude: number,
  regions: Region[],
  targetLevel: 'state_province' | 'ecoregion' = 'state_province',
): string | null {
  const candidates = regions.filter(
    (r) => r.level === targetLevel && r.latitude !== null && r.longitude !== null,
  );

  if (candidates.length === 0) return null;

  let nearestSlug: string | null = null;
  let minDistance = Infinity;

  for (const region of candidates) {
    if (region.latitude === null || region.longitude === null) continue;

    const distance = Math.sqrt(
      Math.pow(latitude - region.latitude, 2) +
      Math.pow(longitude - region.longitude, 2),
    );

    if (distance < minDistance) {
      minDistance = distance;
      nearestSlug = region.slug;
    }
  }

  return nearestSlug;
}

/**
 * Build a breadcrumb trail for a region (root → leaf).
 * Returns regions from continent down to the specified region.
 */
export function getRegionAncestors(
  regionSlug: string,
  allRegions: Region[],
): Region[] {
  const regionMap = new Map(allRegions.map((r) => [r.id, r]));
  const slugMap = new Map(allRegions.map((r) => [r.slug, r]));

  const target = slugMap.get(regionSlug);
  if (!target) return [];

  const ancestors: Region[] = [];
  let current: Region | undefined = target;

  while (current) {
    ancestors.unshift(current);
    current = current.parent_id ? regionMap.get(current.parent_id) : undefined;
  }

  return ancestors;
}
