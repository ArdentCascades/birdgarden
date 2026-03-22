/**
 * optimize-images.ts — Image optimization pipeline
 *
 * Source images: media/images/{birds|plants}/ (downloaded by fetch-media.ts)
 * For each source image:
 *   - Generates AVIF at 400w, 800w, 1200w
 *   - Generates WebP at 400w, 800w, 1200w
 *   - Generates JPEG at 800w (fallback)
 *   - Generates 20px LQIP as base64 data URI
 *   - Applies subtle warm color grade for visual cohesion
 *
 * Output written alongside source: media/images/{birds|plants}/opt/
 * Manifest written to db/seed-data/images-opt.json (LQIP data URIs for inline use)
 *
 * Uses: sharp
 *
 * Usage:
 *   bun run scripts/optimize-images.ts
 *   FORCE=1 bun run scripts/optimize-images.ts   # re-generate existing outputs
 */

import { existsSync, mkdirSync, readdirSync, writeFileSync, statSync, readFileSync } from 'node:fs';
import { join, resolve, extname, basename } from 'node:path';

// Dynamic import so the script fails gracefully if sharp isn't installed
let sharp: typeof import('sharp');
try {
  sharp = (await import('sharp')).default as unknown as typeof import('sharp');
} catch {
  console.error('sharp is not installed. Run: bun add sharp');
  process.exit(1);
}

const FORCE = process.env['FORCE'] === '1';
const MEDIA_ROOT = resolve(process.env['MEDIA_PATH'] ?? './media');
const IMAGES_DIR = join(MEDIA_ROOT, 'images');
const SEED_DIR = resolve('./db/seed-data');
const WIDTHS = [400, 800, 1200] as const;
const LQIP_WIDTH = 20;

// Warm color grade: subtle orange lift
const WARM_TINT = { r: 4, g: 2, b: -3 };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ensureDir(dir: string) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function toBase64DataUri(buf: Buffer, mime: string): string {
  return `data:${mime};base64,${buf.toString('base64')}`;
}

// ---------------------------------------------------------------------------
// Processing
// ---------------------------------------------------------------------------

interface OptimizedImageEntry {
  entity_slug: string;    // matches ImageRecord.entity_slug in seed-db.ts
  entity_type: string;    // 'bird' or 'plant'
  source_filename: string;
  lqip: string;           // base64 data URI for inline CSS blur-up
  avif: { w400: string; w800: string; w1200: string };
  webp: { w400: string; w800: string; w1200: string };
  jpeg_800: string;
}

async function processImage(
  sourcePath: string,
  typeDir: string,   // e.g. "birds" or "plants"
): Promise<OptimizedImageEntry | null> {
  const file = basename(sourcePath);
  const base = basename(sourcePath, extname(sourcePath));
  // slug = filename without extension (e.g. "northern-cardinal")
  const slug = base;

  const outDir = join(typeDir, 'opt');
  ensureDir(outDir);

  // Public URL base: served by Caddy at /media/images/{type}/opt/
  const relType = typeDir.replace(IMAGES_DIR + '/', '');
  const publicBase = `/media/images/${relType}/opt/${base}`;

  // Check if already processed (unless FORCE)
  const lqipPath = join(outDir, `${base}-lqip.webp`);
  if (!FORCE && existsSync(lqipPath)) {
    console.log(`  Skipping (already optimized): ${file}`);
    const lqipBuf = readFileSync(lqipPath);
    return {
      entity_slug: slug,
      entity_type: relType.replace(/s$/, ''), // "birds" → "bird"
      source_filename: file,
      lqip: toBase64DataUri(lqipBuf, 'image/webp'),
      avif: {
        w400: `${publicBase}-400.avif`,
        w800: `${publicBase}-800.avif`,
        w1200: `${publicBase}-1200.avif`,
      },
      webp: {
        w400: `${publicBase}-400.webp`,
        w800: `${publicBase}-800.webp`,
        w1200: `${publicBase}-1200.webp`,
      },
      jpeg_800: `${publicBase}-800.jpg`,
    };
  }

  try {
    const img = sharp(sourcePath).tint(WARM_TINT);
    const avif: Record<string, string> = {};
    const webp: Record<string, string> = {};
    let jpeg800 = '';

    for (const w of WIDTHS) {
      const resized = img.clone().resize(w);

      await resized.clone().avif({ quality: 65, effort: 4 }).toFile(join(outDir, `${base}-${w}.avif`));
      avif[`w${w}`] = `${publicBase}-${w}.avif`;

      await resized.clone().webp({ quality: 75 }).toFile(join(outDir, `${base}-${w}.webp`));
      webp[`w${w}`] = `${publicBase}-${w}.webp`;

      if (w === 800) {
        await resized.clone().jpeg({ quality: 80, mozjpeg: true }).toFile(join(outDir, `${base}-${w}.jpg`));
        jpeg800 = `${publicBase}-${w}.jpg`;
      }
    }

    // LQIP
    const lqipBuf = await img.clone().resize(LQIP_WIDTH).webp({ quality: 20 }).toBuffer();
    writeFileSync(lqipPath, lqipBuf);

    return {
      entity_slug: slug,
      entity_type: relType.replace(/s$/, ''),
      source_filename: file,
      lqip: toBase64DataUri(lqipBuf, 'image/webp'),
      avif: avif as OptimizedImageEntry['avif'],
      webp: webp as OptimizedImageEntry['webp'],
      jpeg_800: jpeg800,
    };
  } catch (err) {
    console.warn(`  Error processing ${sourcePath}: ${err}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('Bird Garden — optimize-images');
  console.log('─'.repeat(50));
  console.log(`Media root: ${MEDIA_ROOT}`);

  if (!existsSync(IMAGES_DIR)) {
    console.error(`\nSource images directory not found: ${IMAGES_DIR}`);
    console.error('Run `bun run fetch-media` first.');
    process.exit(1);
  }

  const manifest: OptimizedImageEntry[] = [];
  let total = 0;
  let errors = 0;

  // Walk media/images/{type}/ directories (birds, plants)
  const typeDirs = readdirSync(IMAGES_DIR)
    .map((d) => join(IMAGES_DIR, d))
    .filter((d) => statSync(d).isDirectory() && !basename(d).startsWith('opt'));

  for (const typeDir of typeDirs) {
    const typeName = basename(typeDir);
    const files = readdirSync(typeDir).filter((f) =>
      /\.(jpe?g|png|webp|avif|gif)$/i.test(f) && statSync(join(typeDir, f)).isFile(),
    );

    if (files.length === 0) {
      console.log(`\n[${typeName}] No images found.`);
      continue;
    }

    console.log(`\n[${typeName}] ${files.length} images`);

    for (const file of files) {
      total++;
      const sourcePath = join(typeDir, file);
      console.log(`  ${file}`);
      const entry = await processImage(sourcePath, typeDir);
      if (entry) {
        manifest.push(entry);
      } else {
        errors++;
      }
    }
  }

  if (total === 0) {
    console.log('\nNo source images found.');
    console.log('Run `bun run fetch-media` first to download images.');
  }

  const manifestPath = join(SEED_DIR, 'images-opt.json');
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

  console.log('\n─'.repeat(50));
  console.log(`Total: ${total} | OK: ${total - errors} | Errors: ${errors}`);
  console.log(`Manifest written to db/seed-data/images-opt.json`);
  console.log('Done.');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
