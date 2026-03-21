/**
 * content.config.ts — Astro content collections configuration
 *
 * Defines the "pages" collection for static Markdown content (e.g., about.md).
 * This prevents the "Auto-generating collections" deprecation warning.
 */
import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const pages = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/pages' }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
  }),
});

export const collections = { pages };
