/**
 * fetch-media.ts — Downloads bird song recordings and bird/plant images
 *
 * Sources:
 *   - Songs: Xeno-canto API v2 (CC0/CC-BY licenses only)
 *   - Images: Wikimedia Commons REST API
 *
 * Reads bird/plant slugs from db/seed-data/birds.json and db/seed-data/plants.json.
 * Writes manifests compatible with scripts/seed-db.ts:
 *   - db/seed-data/songs.json  (SongRecord[] format)
 *   - db/seed-data/images.json (ImageRecord[] format)
 * Downloads audio to media/songs/ and images to media/images/{birds|plants}/
 * (paths match src/lib/media.ts conventions used by the Caddy reverse proxy)
 *
 * Usage:
 *   bun run scripts/fetch-media.ts
 *   DRY_RUN=1 bun run scripts/fetch-media.ts   # log only, no downloads
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const DRY_RUN = process.env['DRY_RUN'] === '1';
const SEED_DIR = resolve('./db/seed-data');
// Match the MEDIA_ROOT convention in src/lib/media.ts
const MEDIA_ROOT = resolve(process.env['MEDIA_PATH'] ?? './media');
const AUDIO_DIR = join(MEDIA_ROOT, 'songs');
const IMAGES_DIR = join(MEDIA_ROOT, 'images');
const MAX_SONGS_PER_BIRD = 3;
const MAX_RETRIES = 4;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchWithRetry(url: string, options?: RequestInit): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = 1000 * 2 ** attempt; // 2s, 4s, 8s
      console.log(`  Retry ${attempt}/${MAX_RETRIES - 1} after ${delay}ms…`);
      await sleep(delay);
    }
    try {
      const res = await fetch(url, options);
      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`HTTP ${res.status}`);
        continue;
      }
      return res;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

function ensureDir(dir: string) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function loadJson<T>(filename: string): T {
  return JSON.parse(readFileSync(join(SEED_DIR, filename), 'utf-8')) as T;
}

function saveJson(filename: string, data: unknown) {
  writeFileSync(join(SEED_DIR, filename), JSON.stringify(data, null, 2) + '\n');
}

// ---------------------------------------------------------------------------
// Xeno-canto song fetching
// ---------------------------------------------------------------------------

interface XenoCantoRecording {
  id: string;
  gen: string;
  sp: string;
  en: string;      // English name
  lic: string;     // license URL
  file: string;    // direct audio URL
  'file-name': string;
  length: string;  // "mm:ss"
  q: string;       // quality A/B/C/D/E
  rec: string;     // recordist name
  cnt: string;     // country
  loc: string;     // locality
  date: string;    // recording date
  type: string;    // sound type (call/song)
}

interface XenoCantoResponse {
  numRecordings: string;
  numSpecies: string;
  page: number;
  numPages: number;
  recordings: XenoCantoRecording[];
}

/** Matches the SongRecord interface in seed-db.ts */
interface SongRecord {
  bird_slug: string;
  filename: string;
  format: string;
  duration_sec?: number;
  source_url: string;
  license: string;
  recordist?: string;
  recording_date?: string;
  recording_loc?: string;
}

const CC_LICENSES = [
  '//creativecommons.org/licenses/by/4.0',
  '//creativecommons.org/licenses/by/3.0',
  '//creativecommons.org/publicdomain/zero/1.0',
];

function isPermissiveLicense(licUrl: string): boolean {
  return CC_LICENSES.some((cc) => licUrl.includes(cc));
}

/** Parse "mm:ss" → seconds */
function parseLength(length: string): number | undefined {
  const parts = length.split(':');
  if (parts.length === 2) {
    const m = parseInt(parts[0] ?? '0', 10);
    const s = parseInt(parts[1] ?? '0', 10);
    if (!isNaN(m) && !isNaN(s)) return m * 60 + s;
  }
  return undefined;
}

async function fetchSongsForBird(
  slug: string,
  scientificName: string,
): Promise<SongRecord[]> {
  const query = encodeURIComponent(`"${scientificName}"`);
  const apiUrl = `https://xeno-canto.org/api/2/recordings?query=${query}+q:A&page=1`;

  console.log(`  Querying Xeno-canto for ${scientificName}…`);

  let response: XenoCantoResponse;
  try {
    const res = await fetchWithRetry(apiUrl);
    if (!res.ok) {
      console.warn(`  Xeno-canto API error ${res.status} for ${scientificName}`);
      return [];
    }
    response = (await res.json()) as XenoCantoResponse;
  } catch (err) {
    console.warn(`  Failed to query Xeno-canto for ${scientificName}: ${err}`);
    return [];
  }

  const eligible = response.recordings
    .filter((r) => isPermissiveLicense(r.lic) && r.file)
    .slice(0, MAX_SONGS_PER_BIRD);

  if (eligible.length === 0) {
    console.log(`  No CC recordings found for ${scientificName}`);
    return [];
  }

  ensureDir(AUDIO_DIR);

  const records: SongRecord[] = [];

  for (const rec of eligible) {
    const ext = (rec['file-name']?.split('.').pop() ?? 'mp3').toLowerCase();
    const format = ext === 'opus' ? 'opus' : 'mp3';
    // Flat filename: bird-slug_xcID.ext (matches media.ts getSongPath)
    const filename = `${slug}_xc${rec.id}.${ext}`;
    const localPath = join(AUDIO_DIR, filename);
    const xcUrl = `https://xeno-canto.org/${rec.id}`;

    if (!DRY_RUN && !existsSync(localPath)) {
      try {
        console.log(`  Downloading ${filename}…`);
        const fileRes = await fetchWithRetry(rec.file);
        if (fileRes.ok) {
          const buf = await fileRes.arrayBuffer();
          writeFileSync(localPath, Buffer.from(buf));
        } else {
          console.warn(`  Failed to download ${filename}: HTTP ${fileRes.status}`);
          continue;
        }
      } catch (err) {
        console.warn(`  Error downloading ${filename}: ${err}`);
        continue;
      }
    } else if (DRY_RUN) {
      console.log(`  [DRY RUN] Would download → media/songs/${filename}`);
    } else {
      console.log(`  Already exists: ${filename}`);
    }

    records.push({
      bird_slug: slug,
      filename,
      format,
      duration_sec: parseLength(rec.length),
      source_url: xcUrl,
      license: rec.lic,
      recordist: rec.rec || undefined,
      recording_date: rec.date || undefined,
      recording_loc: [rec.loc, rec.cnt].filter(Boolean).join(', ') || undefined,
    });
  }

  return records;
}

// ---------------------------------------------------------------------------
// Wikimedia Commons image fetching
// ---------------------------------------------------------------------------

/** Matches the ImageRecord interface in seed-db.ts */
interface ImageRecord {
  entity_type: 'bird' | 'plant';
  entity_slug: string;
  filename: string;
  alt_text: string;
  width?: number;
  height?: number;
  source_url: string;
  license: string;
  author?: string;
  is_primary: 0 | 1;
}

interface WikiPageImageResponse {
  query?: {
    pages?: Record<string, {
      thumbnail?: { source: string; width: number; height: number };
      pageimage?: string;
    }>;
  };
}

interface WikiImageInfoResponse {
  query?: {
    pages?: Record<string, {
      imageinfo?: Array<{
        url: string;
        width: number;
        height: number;
        extmetadata?: {
          License?: { value: string };
          LicenseUrl?: { value: string };
          Artist?: { value: string };
        };
      }>;
    }>;
  };
}

async function fetchWikimediaImage(
  searchTerm: string,
): Promise<{
  url: string;
  width: number;
  height: number;
  license: string;
  attribution: string;
} | null> {
  const pageUrl = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(searchTerm)}&prop=pageimages&pithumbsize=1200&format=json&origin=*`;

  try {
    const res = await fetchWithRetry(pageUrl);
    if (!res.ok) return null;

    const data = (await res.json()) as WikiPageImageResponse;
    const pages = data.query?.pages ?? {};
    const page = Object.values(pages)[0];
    const thumbnail = page?.thumbnail;
    const pageimage = page?.pageimage;

    if (!thumbnail || !pageimage) return null;

    // Fetch license + attribution via imageinfo
    const infoUrl = `https://en.wikipedia.org/w/api.php?action=query&titles=File:${encodeURIComponent(pageimage)}&prop=imageinfo&iiprop=url|size|extmetadata&format=json&origin=*`;
    const infoRes = await fetchWithRetry(infoUrl);
    if (!infoRes.ok) {
      return {
        url: thumbnail.source,
        width: thumbnail.width,
        height: thumbnail.height,
        license: 'unknown',
        attribution: '',
      };
    }

    const infoData = (await infoRes.json()) as WikiImageInfoResponse;
    const infoPages = infoData.query?.pages ?? {};
    const infoPage = Object.values(infoPages)[0];
    const imageinfo = infoPage?.imageinfo?.[0];

    const license = imageinfo?.extmetadata?.License?.value ?? 'unknown';
    const artist = imageinfo?.extmetadata?.Artist?.value ?? '';
    const attribution = artist.replace(/<[^>]+>/g, '').trim();

    return {
      url: thumbnail.source,
      width: imageinfo?.width ?? thumbnail.width,
      height: imageinfo?.height ?? thumbnail.height,
      license,
      attribution,
    };
  } catch (err) {
    console.warn(`  Wikimedia lookup failed for "${searchTerm}": ${err}`);
    return null;
  }
}

async function fetchImageForSubject(
  slug: string,
  commonName: string,
  scientificName: string,
  type: 'bird' | 'plant',
): Promise<ImageRecord | null> {
  console.log(`  Fetching image for ${commonName} (${scientificName})…`);

  // Images saved to media/images/{type}s/ (plural, matching media.ts getImagePath)
  const imgDir = join(IMAGES_DIR, type + 's');
  ensureDir(imgDir);

  // Try scientific name first, fall back to common name
  let imageData = await fetchWikimediaImage(scientificName);
  if (!imageData) {
    imageData = await fetchWikimediaImage(commonName);
  }
  if (!imageData) {
    console.log(`  No image found for ${commonName}`);
    return null;
  }

  const urlParts = imageData.url.split('/');
  const originalFilename = urlParts[urlParts.length - 1] ?? 'image.jpg';
  const ext = originalFilename.split('.').pop()?.toLowerCase() ?? 'jpg';
  // Flat filename: {slug}.{ext} — matches getImagePath(type, filename) in media.ts
  const filename = `${slug}.${ext}`;
  const localPath = join(imgDir, filename);

  if (!DRY_RUN && !existsSync(localPath)) {
    try {
      console.log(`  Downloading ${filename}…`);
      const fileRes = await fetchWithRetry(imageData.url);
      if (fileRes.ok) {
        const buf = await fileRes.arrayBuffer();
        writeFileSync(localPath, Buffer.from(buf));
      } else {
        console.warn(`  Failed to download image: HTTP ${fileRes.status}`);
        return null;
      }
    } catch (err) {
      console.warn(`  Error downloading image for ${commonName}: ${err}`);
      return null;
    }
  } else if (DRY_RUN) {
    console.log(`  [DRY RUN] Would download → media/images/${type}s/${filename}`);
  } else {
    console.log(`  Already exists: ${filename}`);
  }

  return {
    entity_type: type,
    entity_slug: slug,
    filename,
    alt_text: `${commonName} (${scientificName})`,
    width: imageData.width,
    height: imageData.height,
    source_url: imageData.url,
    license: imageData.license,
    author: imageData.attribution || undefined,
    is_primary: 1,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

interface BirdRecord {
  slug: string;
  common_name: string;
  scientific_name: string;
}

interface PlantRecord {
  slug: string;
  common_name: string;
  scientific_name: string;
}

async function main() {
  console.log(`Bird Garden — fetch-media${DRY_RUN ? ' (DRY RUN)' : ''}`);
  console.log('─'.repeat(50));
  console.log(`Media root: ${MEDIA_ROOT}`);
  console.log('');

  ensureDir(AUDIO_DIR);
  ensureDir(join(IMAGES_DIR, 'birds'));
  ensureDir(join(IMAGES_DIR, 'plants'));

  const birds = loadJson<BirdRecord[]>('birds.json');
  const plants = loadJson<PlantRecord[]>('plants.json');

  // ---- Songs ----------------------------------------------------------------
  console.log('\n[1/3] Fetching bird songs from Xeno-canto…');
  const songManifest: SongRecord[] = [];

  for (const bird of birds) {
    console.log(`\n${bird.common_name} (${bird.slug})`);
    const entries = await fetchSongsForBird(bird.slug, bird.scientific_name);
    songManifest.push(...entries);
    await sleep(500); // polite delay between birds
  }

  console.log(`\nSongs fetched: ${songManifest.length}`);
  if (!DRY_RUN) {
    saveJson('songs.json', songManifest);
    console.log('Wrote db/seed-data/songs.json');
  }

  // ---- Bird images ----------------------------------------------------------
  console.log('\n[2/3] Fetching bird images from Wikimedia Commons…');
  const imageManifest: ImageRecord[] = [];

  for (const bird of birds) {
    console.log(`\n${bird.common_name} (${bird.slug})`);
    const entry = await fetchImageForSubject(
      bird.slug,
      bird.common_name,
      bird.scientific_name,
      'bird',
    );
    if (entry) imageManifest.push(entry);
    await sleep(300);
  }

  // ---- Plant images ---------------------------------------------------------
  console.log('\n[3/3] Fetching plant images from Wikimedia Commons…');

  for (const plant of plants) {
    console.log(`\n${plant.common_name} (${plant.slug})`);
    const entry = await fetchImageForSubject(
      plant.slug,
      plant.common_name,
      plant.scientific_name,
      'plant',
    );
    if (entry) imageManifest.push(entry);
    await sleep(300);
  }

  console.log(`\nImages fetched: ${imageManifest.length}`);
  if (!DRY_RUN) {
    saveJson('images.json', imageManifest);
    console.log('Wrote db/seed-data/images.json');
  }

  console.log('\n─'.repeat(50));
  console.log('Done.');
  console.log('\nNext step: bun run optimize-images && bun run seed');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
