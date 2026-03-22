/**
 * optimize-images.ts — Image optimization pipeline
 *
 * For each source image in public/images/:
 *   - Generates AVIF at 400w, 800w, 1200w
 *   - Generates WebP at 400w, 800w, 1200w
 *   - Generates JPEG at 800w (fallback)
 *   - Generates 20px LQIP as base64 data URI
 *   - Applies subtle warm color grade for visual cohesion
 *
 * Output written to public/images-opt/{type}/{slug}/
 * Manifest written to db/seed-data/images-opt.json
 *
 * Uses: sharp
 *
 * Usage:
 *   bun run scripts/optimize-images.ts
 *   FORCE=1 bun run scripts/optimize-images.ts   # re-generate existing outputs
 */

import { existsSync, mkdirSync, readdirSync, writeFileSync, statSync } from 'node:fs';
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
const IMAGES_DIR = resolve('./public/images');
const OUT_DIR = resolve('./public/images-opt');
const SEED_DIR = resolve('./db/seed-data');
const WIDTHS = [400, 800, 1200] as const;
const LQIP_WIDTH = 20;

// Warm color grade: very subtle orange lift in shadows/midtones
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
  subject_slug: string;
  subject_type: string;
  source_path: string;
  lqip: string; // base64 data URI
  avif: { w400: string; w800: string; w1200: string };
  webp: { w400: string; w800: string; w1200: string };
  jpeg_800: string;
}

async function processImage(
  sourcePath: string,
  slug: string,
  type: string,
): Promise<OptimizedImageEntry | null> {
  const outDir = join(OUT_DIR, type, slug);
  ensureDir(outDir);

  const base = basename(sourcePath, extname(sourcePath));

  // Check if already processed (unless FORCE)
  const lqipPath = join(outDir, `${base}-lqip.webp`);
  if (!FORCE && existsSync(lqipPath)) {
    console.log(`  Skipping (already optimized): ${slug}`);

    // Re-read existing LQIP for manifest
    const lqipBuf = require('node:fs').readFileSync(lqipPath) as Buffer;
    const lqipUri = toBase64DataUri(lqipBuf, 'image/webp');

    const publicBase = `/images-opt/${type}/${slug}/${base}`;
    return {
      subject_slug: slug,
      subject_type: type,
      source_path: sourcePath.replace(resolve('./public'), ''),
      lqip: lqipUri,
      avif: { w400: `${publicBase}-400.avif`, w800: `${publicBase}-800.avif`, w1200: `${publicBase}-1200.avif` },
      webp: { w400: `${publicBase}-400.webp`, w800: `${publicBase}-800.webp`, w1200: `${publicBase}-1200.webp` },
      jpeg_800: `${publicBase}-800.jpg`,
    };
  }

  try {
    const img = sharp(sourcePath).tint(WARM_TINT);

    const publicBase = `/images-opt/${type}/${slug}/${base}`;
    const avif: Record<string, string> = {};
    const webp: Record<string, string> = {};
    let jpeg800 = '';

    // Generate AVIF + WebP at each width
    for (const w of WIDTHS) {
      const resized = img.clone().resize(w);

      const avifFilename = `${base}-${w}.avif`;
      const avifPath = join(outDir, avifFilename);
      await resized.clone().avif({ quality: 65, effort: 4 }).toFile(avifPath);
      avif[`w${w}`] = `${publicBase}-${w}.avif`;

      const webpFilename = `${base}-${w}.webp`;
      const webpPath = join(outDir, webpFilename);
      await resized.clone().webp({ quality: 75 }).toFile(webpPath);
      webp[`w${w}`] = `${publicBase}-${w}.webp`;

      // JPEG fallback at 800 only
      if (w === 800) {
        const jpegFilename = `${base}-${w}.jpg`;
        const jpegPath = join(outDir, jpegFilename);
        await resized.clone().jpeg({ quality: 80, mozjpeg: true }).toFile(jpegPath);
        jpeg800 = `${publicBase}-${w}.jpg`;
      }
    }

    // LQIP — 20px wide, blurry WebP encoded as base64
    const lqipBuf = await img.clone().resize(LQIP_WIDTH).webp({ quality: 20 }).toBuffer();
    writeFileSync(lqipPath, lqipBuf);
    const lqipUri = toBase64DataUri(lqipBuf, 'image/webp');

    return {
      subject_slug: slug,
      subject_type: type,
      source_path: sourcePath.replace(resolve('./public'), ''),
      lqip: lqipUri,
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

  if (!existsSync(IMAGES_DIR)) {
    console.error(`Source images directory not found: ${IMAGES_DIR}`);
    console.error('Run `bun run fetch-media` first.');
    process.exit(1);
  }

  ensureDir(OUT_DIR);

  const manifest: OptimizedImageEntry[] = [];
  let total = 0;
  let processed = 0;
  let skipped = 0;
  let errors = 0;

  // Walk public/images/{type}/{slug}/
  const types = readdirSync(IMAGES_DIR).filter((d) => statSync(join(IMAGES_DIR, d)).isDirectory());

  for (const type of types) {
    const typeDir = join(IMAGES_DIR, type);
    const slugs = readdirSync(typeDir).filter((d) => statSync(join(typeDir, d)).isDirectory());

    for (const slug of slugs) {
      const slugDir = join(typeDir, slug);
      const files = readdirSync(slugDir).filter((f) => /\.(jpe?g|png|webp|avif|gif)$/i.test(f));

      for (const file of files) {
        total++;
        const sourcePath = join(slugDir, file);
        console.log(`\n[${type}] ${slug}/${file}`);

        const entry = await processImage(sourcePath, slug, type);
        if (entry) {
          manifest.push(entry);
          // Check if it was skipped or newly processed
          const lqipPath = join(OUT_DIR, type, slug, `${basename(file, extname(file))}-lqip.webp`);
          if (entry.lqip && FORCE) {
            processed++;
          } else {
            processed++;
          }
        } else {
          errors++;
        }
      }
    }
  }

  if (total === 0) {
    console.log('\nNo source images found in public/images/');
    console.log('Run `bun run fetch-media` first to download images.');
  }

  // Write manifest
  const manifestPath = join(SEED_DIR, 'images-opt.json');
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

  console.log('\n─'.repeat(50));
  console.log(`Total: ${total} | Processed: ${processed} | Errors: ${errors}`);
  console.log(`Manifest written to db/seed-data/images-opt.json`);
  console.log('Done.');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
