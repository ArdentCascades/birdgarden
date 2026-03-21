import { defineConfig } from 'astro/config';
import preact from '@astrojs/preact';
import node from '@astrojs/node';

// https://astro.build/config
export default defineConfig({
  output: 'static', // SSG by default; individual routes with prerender = false opt into SSR
  adapter: node({ mode: 'standalone' }),
  integrations: [
    preact({
      // Include Preact devtools in development
      devtools: true,
    }),
  ],
  server: {
    host: process.env.HOST || '0.0.0.0',
    port: parseInt(process.env.PORT || '4321'),
  },
  vite: {
    define: {
      'import.meta.env.DB_PATH': JSON.stringify(process.env.DB_PATH || './db/bird-garden.sqlite'),
      'import.meta.env.MEDIA_PATH': JSON.stringify(process.env.MEDIA_PATH || './media'),
    },
    build: {
      // Target modern browsers; Preact islands are already tiny
      target: 'es2022',
    },
  },
  image: {
    // Use sharp for image optimization
    service: { entrypoint: 'astro/assets/services/sharp' },
  },
  // Prefetch links on hover for instant-feeling navigation
  prefetch: {
    prefetchAll: false,
    defaultStrategy: 'hover',
  },
  // i18n setup for future multi-language support
  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },
});
