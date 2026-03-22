/**
 * fetch-media.ts — Downloads bird song recordings and images
 *
 * Reads source URLs from db/seed-data/songs.json and db/seed-data/images.json.
 * Verifies CC license before download.
 * Skips files that already exist on disk.
 * Implements exponential backoff/retry for transient failures.
 *
 * Output directories:
 *   public/media/audio/         — .opus song files
 *   public/media/images/birds/  — bird photos
 *   public/media/images/plants/ — plant photos
 *
 * Usage:
 *   bun run scripts/fetch-media.ts
 *   bun run scripts/fetch-media.ts --dry-run   # show what would be downloaded
 *   bun run scripts/fetch-media.ts --songs-only
 *   bun run scripts/fetch-media.ts --images-only
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { readFileSync } from 'node:fs';

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------

const args = new Set(process.argv.slice(2));
const DRY_RUN    = args.has('--dry-run');
const SONGS_ONLY = args.has('--songs-only');
const IMG_ONLY   = args.has('--images-only');

if (DRY_RUN) console.log('[dry-run] No files will be written.\n');

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const SEED_DIR   = resolve('./db/seed-data');
const AUDIO_DIR  = resolve('./public/media/audio');
const BIRDS_DIR  = resolve('./public/media/images/birds');
const PLANTS_DIR = resolve('./public/media/images/plants');

function ensureDir(dir: string) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

// ---------------------------------------------------------------------------
// License allow-list (CC licenses acceptable for redistribution)
// ---------------------------------------------------------------------------

const ALLOWED_LICENSE_PREFIXES = [
  'CC0',
  'CC BY',
  'CC BY-SA',
  'CC BY-NC',
  'CC BY-NC-SA',
  'Public Domain',
];

function isLicenseAllowed(license: string): boolean {
  return ALLOWED_LICENSE_PREFIXES.some((prefix) =>
    license.toUpperCase().startsWith(prefix.toUpperCase()),
  );
}

// ---------------------------------------------------------------------------
// HTTP fetch with retry / exponential backoff
// ---------------------------------------------------------------------------

async function fetchWithRetry(
  url: string,
  maxRetries = 4,
  baseDelayMs = 1000,
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'BirdGarden/1.0 (educational; contact@birdgarden.app)' },
        signal: AbortSignal.timeout(30_000),
      });
      if (res.ok) return res;
      // Retry on 429 or 5xx
      if (res.status === 429 || res.status >= 500) {
        const retryAfter = res.headers.get('Retry-After');
        const delay = retryAfter
          ? parseInt(retryAfter, 10) * 1000
          : baseDelayMs * Math.pow(2, attempt);
        console.warn(`  HTTP ${res.status} — retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
        await sleep(delay);
        lastError = new Error(`HTTP ${res.status}`);
        continue;
      }
      throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt);
        console.warn(`  Fetch error — retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries}): ${err}`);
        await sleep(delay);
      }
    }
  }
  throw lastError;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Download a single file
// ---------------------------------------------------------------------------

async function downloadFile(url: string, destPath: string): Promise<boolean> {
  if (existsSync(destPath)) {
    console.log(`  skip  (exists) ${destPath}`);
    return false;
  }

  if (DRY_RUN) {
    console.log(`  would download → ${destPath}`);
    return false;
  }

  ensureDir(dirname(destPath));

  const res = await fetchWithRetry(url);
  const buffer = await res.arrayBuffer();
  writeFileSync(destPath, Buffer.from(buffer));
  return true;
}

// ---------------------------------------------------------------------------
// Type definitions
// ---------------------------------------------------------------------------

interface SongRecord {
  bird_slug: string;
  filename: string;
  format: string;
  source_url: string;
  license: string;
  recordist?: string;
}

interface ImageRecord {
  entity_type: 'bird' | 'plant';
  entity_slug: string;
  filename: string;
  source_url: string;
  license: string;
}

function loadJson<T>(filename: string): T {
  return JSON.parse(readFileSync(join(SEED_DIR, filename), 'utf-8')) as T;
}

// ---------------------------------------------------------------------------
// Xeno-canto: resolve download URL from recording page
// ---------------------------------------------------------------------------

/**
 * Xeno-canto source_urls look like: https://xeno-canto.org/490876
 * The API endpoint is: https://xeno-canto.org/api/2/recordings?query=nr:490876
 * The file URL is in recording.file.
 */
async function resolveXenoCantoUrl(pageUrl: string): Promise<string | null> {
  const match = pageUrl.match(/xeno-canto\.org\/(\d+)/);
  if (!match) return null;
  const id = match[1];

  const apiUrl = `https://xeno-canto.org/api/2/recordings?query=nr:${id}`;
  try {
    const res = await fetchWithRetry(apiUrl);
    const data = await res.json() as { recordings?: { file: string; lic: string }[] };
    const recording = data.recordings?.[0];
    if (!recording?.file) return null;
    // Ensure absolute URL
    return recording.file.startsWith('http')
      ? recording.file
      : `https:${recording.file}`;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Wikimedia Commons: resolve direct file URL from commons page
// ---------------------------------------------------------------------------

/**
 * Wikimedia source_urls look like:
 *   https://commons.wikimedia.org/wiki/File:Northern_Cardinal_Male-27527-2.jpg
 * Use the MediaWiki API to get the actual file URL.
 */
async function resolveWikimediaUrl(pageUrl: string): Promise<string | null> {
  const match = pageUrl.match(/\/wiki\/(File:[^?#]+)/);
  if (!match) return null;
  const title = decodeURIComponent(match[1]!);

  const apiUrl =
    `https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}` +
    `&prop=imageinfo&iiprop=url&format=json&origin=*`;
  try {
    const res = await fetchWithRetry(apiUrl);
    const data = await res.json() as {
      query?: { pages?: Record<string, { imageinfo?: { url: string }[] }> };
    };
    const pages = data.query?.pages ?? {};
    const page = Object.values(pages)[0];
    return page?.imageinfo?.[0]?.url ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Fetch songs
// ---------------------------------------------------------------------------

async function fetchSongs() {
  const songs = loadJson<SongRecord[]>('songs.json');
  if (songs.length === 0) { console.log('No songs configured.'); return; }

  ensureDir(AUDIO_DIR);
  let downloaded = 0;
  let skipped = 0;
  let failed = 0;

  for (const song of songs) {
    console.log(`\n[song] ${song.filename} — ${song.bird_slug}`);

    if (!isLicenseAllowed(song.license)) {
      console.log(`  skip  (license not allowed: ${song.license})`);
      skipped++;
      continue;
    }

    const destPath = join(AUDIO_DIR, song.filename);

    let downloadUrl: string | null = null;
    if (song.source_url.includes('xeno-canto.org')) {
      downloadUrl = await resolveXenoCantoUrl(song.source_url);
      if (!downloadUrl) {
        console.warn(`  warn  Could not resolve Xeno-canto URL for ${song.source_url}`);
        failed++;
        continue;
      }
    } else {
      downloadUrl = song.source_url;
    }

    try {
      const wrote = await downloadFile(downloadUrl, destPath);
      if (wrote) downloaded++;
      else skipped++;
    } catch (err) {
      console.error(`  error ${err}`);
      failed++;
    }

    // Polite delay between requests
    await sleep(500);
  }

  console.log(`\nSongs: ${downloaded} downloaded, ${skipped} skipped, ${failed} failed.`);
}

// ---------------------------------------------------------------------------
// Fetch images
// ---------------------------------------------------------------------------

async function fetchImages() {
  const images = loadJson<ImageRecord[]>('images.json');
  if (images.length === 0) { console.log('No images configured.'); return; }

  ensureDir(BIRDS_DIR);
  ensureDir(PLANTS_DIR);

  let downloaded = 0;
  let skipped = 0;
  let failed = 0;

  for (const img of images) {
    const dir = img.entity_type === 'bird' ? BIRDS_DIR : PLANTS_DIR;
    const destPath = join(dir, img.filename);

    console.log(`\n[image] ${img.filename} — ${img.entity_type}/${img.entity_slug}`);

    if (!isLicenseAllowed(img.license)) {
      console.log(`  skip  (license not allowed: ${img.license})`);
      skipped++;
      continue;
    }

    let downloadUrl: string | null = null;
    if (img.source_url.includes('commons.wikimedia.org')) {
      downloadUrl = await resolveWikimediaUrl(img.source_url);
      if (!downloadUrl) {
        console.warn(`  warn  Could not resolve Wikimedia URL for ${img.source_url}`);
        failed++;
        continue;
      }
    } else {
      downloadUrl = img.source_url;
    }

    try {
      const wrote = await downloadFile(downloadUrl, destPath);
      if (wrote) downloaded++;
      else skipped++;
    } catch (err) {
      console.error(`  error ${err}`);
      failed++;
    }

    // Polite delay between requests
    await sleep(300);
  }

  console.log(`\nImages: ${downloaded} downloaded, ${skipped} skipped, ${failed} failed.`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

console.log(`Bird Garden — fetch-media${DRY_RUN ? ' [dry-run]' : ''}`);
console.log(`Seed dir: ${SEED_DIR}`);
console.log(`Audio dir: ${AUDIO_DIR}`);
console.log(`Images: ${BIRDS_DIR}, ${PLANTS_DIR}\n`);

if (!IMG_ONLY) await fetchSongs();
if (!SONGS_ONLY) await fetchImages();

console.log('\nDone.');
