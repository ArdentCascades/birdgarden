/**
 * optimize-images.ts — Image optimization pipeline
 *
 * For each source JPEG/PNG in public/media/images/{birds,plants}/:
 *   - Generates AVIF at 400w, 800w, 1200w
 *   - Generates WebP at 400w, 800w, 1200w
 *   - Generates JPEG at 800w (fallback, replaces source if oversized)
 *   - Generates 20px LQIP (Low-Quality Image Placeholder) as base64 data URI
 *     and writes it to public/media/lqip/{entityType}/{slug}.txt
 *   - Applies a subtle warm colour grade (+5° hue, +5 saturation, 1.02 brightness)
 *     for visual cohesion across the site
 *
 * Skips output files that are already newer than the source (incremental).
 *
 * Uses: sharp (npm dependency)
 *
 * Usage:
 *   bun run scripts/optimize-images.ts
 *   bun run scripts/optimize-images.ts --force    # re-process everything
 *   bun run scripts/optimize-images.ts --dry-run  # show what would be done
 */

import sharp from 'sharp';
import { readdirSync, existsSync, mkdirSync, writeFileSync, statSync } from 'node:fs';
import { resolve, join, basename, extname } from 'node:path';

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has('--dry-run');
const FORCE   = args.has('--force');

if (DRY_RUN) console.log('[dry-run] No files will be written.\n');

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const PUBLIC_DIR = resolve('./public/media/images');
const LQIP_DIR  = resolve('./public/media/lqip');

const ENTITY_TYPES = ['birds', 'plants'] as const;
const WIDTHS: number[] = [400, 800, 1200];

// ---------------------------------------------------------------------------
// Colour grade — subtle warmth applied to all images
// ---------------------------------------------------------------------------

const TINT_HUE        = 5;    // degrees (warm)
const TINT_SATURATION = 1.05; // 5% boost
const TINT_BRIGHTNESS = 1.02; // 2% lift

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ensureDir(dir: string) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function isNewer(src: string, dest: string): boolean {
  if (!existsSync(dest)) return true;
  return statSync(src).mtimeMs > statSync(dest).mtimeMs;
}

function log(msg: string) {
  if (!DRY_RUN) process.stdout.write(`${msg}\n`);
  else process.stdout.write(`[dry] ${msg}\n`);
}

// ---------------------------------------------------------------------------
// Process a single source image
// ---------------------------------------------------------------------------

async function processImage(srcPath: string, entityType: 'birds' | 'plants') {
  const name = basename(srcPath, extname(srcPath)); // e.g. "northern-cardinal"
  const outDir = join(PUBLIC_DIR, entityType);
  const lqipEntityDir = join(LQIP_DIR, entityType);

  if (!DRY_RUN) {
    ensureDir(outDir);
    ensureDir(lqipEntityDir);
  }

  // Base pipeline with colour grade
  const pipeline = () =>
    sharp(srcPath)
      .modulate({ brightness: TINT_BRIGHTNESS, saturation: TINT_SATURATION, hue: TINT_HUE });

  let anyProcessed = false;

  // ── AVIF variants ──────────────────────────────────────────────────────────
  for (const width of WIDTHS) {
    const dest = join(outDir, `${name}-${width}.avif`);
    if (!FORCE && !isNewer(srcPath, dest)) continue;
    log(`  avif ${width}w → ${basename(dest)}`);
    if (!DRY_RUN) {
      await pipeline()
        .resize(width, null, { withoutEnlargement: true })
        .avif({ quality: 65, effort: 6 })
        .toFile(dest);
    }
    anyProcessed = true;
  }

  // ── WebP variants ──────────────────────────────────────────────────────────
  for (const width of WIDTHS) {
    const dest = join(outDir, `${name}-${width}.webp`);
    if (!FORCE && !isNewer(srcPath, dest)) continue;
    log(`  webp ${width}w → ${basename(dest)}`);
    if (!DRY_RUN) {
      await pipeline()
        .resize(width, null, { withoutEnlargement: true })
        .webp({ quality: 80 })
        .toFile(dest);
    }
    anyProcessed = true;
  }

  // ── JPEG 800w fallback ─────────────────────────────────────────────────────
  const jpegDest = join(outDir, `${name}-800.jpg`);
  if (FORCE || isNewer(srcPath, jpegDest)) {
    log(`  jpeg 800w → ${basename(jpegDest)}`);
    if (!DRY_RUN) {
      await pipeline()
        .resize(800, null, { withoutEnlargement: true })
        .jpeg({ quality: 82, mozjpeg: true })
        .toFile(jpegDest);
    }
    anyProcessed = true;
  }

  // ── LQIP — 20px wide, base64 WebP ─────────────────────────────────────────
  const lqipDest = join(lqipEntityDir, `${name}.txt`);
  if (FORCE || isNewer(srcPath, lqipDest)) {
    log(`  lqip → ${basename(lqipDest)}`);
    if (!DRY_RUN) {
      const lqipBuf = await pipeline()
        .resize(20, null, { withoutEnlargement: true })
        .webp({ quality: 20 })
        .toBuffer();
      const dataUri = `data:image/webp;base64,${lqipBuf.toString('base64')}`;
      writeFileSync(lqipDest, dataUri, 'utf-8');
    }
    anyProcessed = true;
  }

  if (!anyProcessed) {
    log(`  skip  (all outputs up-to-date)`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

console.log(`Bird Garden — optimize-images${DRY_RUN ? ' [dry-run]' : ''}${FORCE ? ' [force]' : ''}`);
console.log(`Source: ${PUBLIC_DIR}\n`);

let total = 0;
let processed = 0;

for (const entityType of ENTITY_TYPES) {
  const dir = join(PUBLIC_DIR, entityType);
  if (!existsSync(dir)) {
    console.log(`[${entityType}] Directory not found — skipping (run fetch-media first)`);
    continue;
  }

  const sourceFiles = readdirSync(dir).filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f));

  if (sourceFiles.length === 0) {
    console.log(`[${entityType}] No source images found.`);
    continue;
  }

  console.log(`[${entityType}] Processing ${sourceFiles.length} source image(s)…`);

  for (const file of sourceFiles) {
    // Skip already-optimised variants (e.g. northern-cardinal-400.avif)
    if (/-\d+\.(avif|webp|jpg)$/.test(file)) continue;

    const srcPath = join(dir, file);
    console.log(`\n${file}`);
    total++;

    try {
      await processImage(srcPath, entityType);
      processed++;
    } catch (err) {
      console.error(`  ERROR processing ${file}: ${err}`);
    }
  }
}

console.log(`\nDone. Processed ${processed}/${total} source image(s).`);
