/**
 * sitemap.xml.ts — Dynamic sitemap endpoint
 *
 * Generates a valid XML sitemap listing:
 *   - Static pages (/, /plants, /birds, /garden, /about)
 *   - All plant detail pages (/plants/[slug])
 *   - All bird detail pages (/birds/[slug])
 *
 * Follows the Sitemap 0.9 protocol (https://www.sitemaps.org/protocol.html).
 */
import type { APIRoute } from 'astro';

const SITE = 'https://birdgarden.app';

const STATIC_PAGES = [
  { loc: '/', priority: '1.0', changefreq: 'weekly' },
  { loc: '/plants', priority: '0.9', changefreq: 'daily' },
  { loc: '/birds', priority: '0.9', changefreq: 'daily' },
  { loc: '/garden', priority: '0.7', changefreq: 'weekly' },
  { loc: '/about', priority: '0.5', changefreq: 'monthly' },
];

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function urlEntry(loc: string, priority: string, changefreq: string, lastmod?: string): string {
  const fullLoc = escapeXml(`${SITE}${loc}`);
  return [
    '  <url>',
    `    <loc>${fullLoc}</loc>`,
    lastmod ? `    <lastmod>${lastmod}</lastmod>` : '',
    `    <changefreq>${changefreq}</changefreq>`,
    `    <priority>${priority}</priority>`,
    '  </url>',
  ].filter(Boolean).join('\n');
}

export const GET: APIRoute = async () => {
  let birdSlugs: string[] = [];
  let plantSlugs: string[] = [];

  try {
    const { getDb } = await import('../lib/db.ts');
    const db = getDb();
    birdSlugs = (db as any)
      .prepare('SELECT slug FROM bird ORDER BY slug')
      .all()
      .map((r: { slug: string }) => r.slug);
    plantSlugs = (db as any)
      .prepare('SELECT slug FROM plant ORDER BY slug')
      .all()
      .map((r: { slug: string }) => r.slug);
  } catch {
    // DB unavailable — serve static pages only
  }

  const today = new Date().toISOString().split('T')[0]!;

  const entries: string[] = [
    // Static pages
    ...STATIC_PAGES.map(({ loc, priority, changefreq }) =>
      urlEntry(loc, priority, changefreq, today),
    ),
    // Plant detail pages
    ...plantSlugs.map((slug) => urlEntry(`/plants/${slug}`, '0.8', 'weekly', today)),
    // Bird detail pages
    ...birdSlugs.map((slug) => urlEntry(`/birds/${slug}`, '0.8', 'weekly', today)),
  ];

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries,
    '</urlset>',
  ].join('\n');

  return new Response(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
