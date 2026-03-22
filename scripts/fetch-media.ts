/**
 * fetch-media.ts — Downloads bird song recordings and bird/plant images
 *
 * Sources:
 *   - Songs: Xeno-canto API v2 (CC0/CC-BY licenses only)
 *   - Images: Wikimedia Commons REST API
 *
 * Reads bird/plant slugs from db/seed-data/birds.json and db/seed-data/plants.json.
 * Writes manifest to db/seed-data/songs.json and db/seed-data/images.json.
 * Downloads audio to public/audio/{bird-slug}/ and images to public/images/{type}/{slug}/
 * Implements exponential backoff/retry for API rate limits.
 *
 * Usage:
 *   bun run scripts/fetch-media.ts
 *   DRY_RUN=1 bun run scripts/fetch-media.ts   # log only, no downloads
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const DRY_RUN = process.env['DRY_RUN'] === '1';
const SEED_DIR = resolve('./db/seed-data');
const AUDIO_DIR = resolve('./public/audio');
const IMAGES_DIR = resolve('./public/images');
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
  en: string; // English name
  lic: string; // license URL
  file: string; // direct audio URL
  'file-name': string;
  length: string; // "mm:ss"
  q: string; // quality A/B/C/D/E
}

interface XenoCantoResponse {
  numRecordings: string;
  numSpecies: string;
  page: number;
  numPages: number;
  recordings: XenoCantoRecording[];
}

interface SongManifestEntry {
  bird_slug: string;
  xeno_canto_id: string;
  license: string;
  filename: string;
  path: string; // public path
  length: string;
  quality: string;
}

const CC_LICENSES = ['//creativecommons.org/licenses/by/4.0', '//creativecommons.org/licenses/by/3.0', '//creativecommons.org/publicdomain/zero/1.0'];

function isPermissiveLicense(licUrl: string): boolean {
  return CC_LICENSES.some((cc) => licUrl.includes(cc));
}

async function fetchSongsForBird(
  slug: string,
  scientificName: string,
): Promise<SongManifestEntry[]> {
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

  const birdAudioDir = join(AUDIO_DIR, slug);
  ensureDir(birdAudioDir);

  const entries: SongManifestEntry[] = [];

  for (const rec of eligible) {
    const ext = rec['file-name']?.split('.').pop() ?? 'mp3';
    const filename = `xc${rec.id}.${ext}`;
    const localPath = join(birdAudioDir, filename);
    const publicPath = `/audio/${slug}/${filename}`;

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
      console.log(`  [DRY RUN] Would download ${publicPath}`);
    } else {
      console.log(`  Already exists: ${filename}`);
    }

    entries.push({
      bird_slug: slug,
      xeno_canto_id: rec.id,
      license: rec.lic,
      filename,
      path: publicPath,
      length: rec.length,
      quality: rec.q,
    });
  }

  return entries;
}

// ---------------------------------------------------------------------------
// Wikimedia Commons image fetching
// ---------------------------------------------------------------------------

interface WikimediaImageInfo {
  url: string;
  descriptionurl: string;
  extmetadata?: {
    License?: { value: string };
    LicenseUrl?: { value: string };
    Artist?: { value: string };
  };
}

interface WikimediaResponse {
  query?: {
    pages?: Record<string, {
      imageinfo?: WikimediaImageInfo[];
    }>;
  };
}

interface ImageManifestEntry {
  subject_slug: string;
  subject_type: 'bird' | 'plant';
  license: string;
  filename: string;
  path: string; // public path
  source_url: string;
  attribution: string;
}

async function fetchWikimediaImage(
  searchTerm: string,
): Promise<{ url: string; license: string; attribution: string } | null> {
  // First search for the image
  const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(searchTerm)}&prop=pageimages&pithumbsize=1200&format=json&origin=*`;

  try {
    const res = await fetchWithRetry(searchUrl);
    if (!res.ok) return null;

    const data = (await res.json()) as {
      query?: { pages?: Record<string, { thumbnail?: { source: string }; pageimage?: string }> };
    };

    const pages = data.query?.pages ?? {};
    const page = Object.values(pages)[0];
    const thumbnail = page?.thumbnail?.source;
    const pageimage = page?.pageimage;

    if (!thumbnail || !pageimage) return null;

    // Fetch image info for license
    const infoUrl = `https://en.wikipedia.org/w/api.php?action=query&titles=File:${encodeURIComponent(pageimage)}&prop=imageinfo&iiprop=url|extmetadata&format=json&origin=*`;
    const infoRes = await fetchWithRetry(infoUrl);
    if (!infoRes.ok) return { url: thumbnail, license: 'unknown', attribution: '' };

    const infoData = (await infoRes.json()) as WikimediaResponse;
    const infoPages = infoData.query?.pages ?? {};
    const infoPage = Object.values(infoPages)[0];
    const imageinfo = infoPage?.imageinfo?.[0];
    const license = imageinfo?.extmetadata?.License?.value ?? 'unknown';
    const artist = imageinfo?.extmetadata?.Artist?.value ?? '';
    // Strip HTML tags from artist field
    const attribution = artist.replace(/<[^>]+>/g, '').trim();

    return { url: thumbnail, license, attribution };
  } catch (err) {
    console.warn(`  Wikimedia lookup failed for "${searchTerm}": ${err}`);
    return null;
  }
}

async function fetchImageForSubject(
  slug: string,
  name: string,
  scientificName: string,
  type: 'bird' | 'plant',
): Promise<ImageManifestEntry | null> {
  console.log(`  Fetching image for ${name} (${scientificName})…`);

  const imgDir = join(IMAGES_DIR, type, slug);
  ensureDir(imgDir);

  // Try scientific name first, fall back to common name
  let imageData = await fetchWikimediaImage(scientificName);
  if (!imageData) {
    imageData = await fetchWikimediaImage(name);
  }
  if (!imageData) {
    console.log(`  No image found for ${name}`);
    return null;
  }

  const urlParts = imageData.url.split('/');
  const originalFilename = urlParts[urlParts.length - 1] ?? 'image.jpg';
  const ext = originalFilename.split('.').pop() ?? 'jpg';
  const filename = `${slug}.${ext}`;
  const localPath = join(imgDir, filename);
  const publicPath = `/images/${type}/${slug}/${filename}`;

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
      console.warn(`  Error downloading image for ${name}: ${err}`);
      return null;
    }
  } else if (DRY_RUN) {
    console.log(`  [DRY RUN] Would download ${publicPath}`);
  } else {
    console.log(`  Already exists: ${filename}`);
  }

  return {
    subject_slug: slug,
    subject_type: type,
    license: imageData.license,
    filename,
    path: publicPath,
    source_url: imageData.url,
    attribution: imageData.attribution,
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

  ensureDir(AUDIO_DIR);
  ensureDir(IMAGES_DIR);

  const birds = loadJson<BirdRecord[]>('birds.json');
  const plants = loadJson<PlantRecord[]>('plants.json');

  // ---- Songs ----------------------------------------------------------------
  console.log('\n[1/3] Fetching bird songs from Xeno-canto…');
  const songManifest: SongManifestEntry[] = [];

  for (const bird of birds) {
    console.log(`\n${bird.common_name} (${bird.slug})`);
    const entries = await fetchSongsForBird(bird.slug, bird.scientific_name);
    songManifest.push(...entries);
    // Polite delay between birds
    await sleep(500);
  }

  console.log(`\nSongs fetched: ${songManifest.length}`);
  if (!DRY_RUN) {
    saveJson('songs.json', songManifest);
    console.log('Wrote db/seed-data/songs.json');
  }

  // ---- Bird images ----------------------------------------------------------
  console.log('\n[2/3] Fetching bird images from Wikimedia Commons…');
  const imageManifest: ImageManifestEntry[] = [];

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
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
