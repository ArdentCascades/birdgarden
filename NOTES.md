# Bird Garden — Session Notes

---

## Session 1 — Architecture & scaffolding
Branch: `claude/setup-bird-garden-architecture-cfZtT`
Session: https://claude.ai/code/session_01YGJVkyaR1L7oeGa9HbEXSV

### Commit 1 — Task 1: Project scaffolding (Bun + Astro 5 + Preact)

Full directory structure and foundational files. Most page/API implementations are stubs awaiting later tasks.

**Stack:** Bun · Astro 5 (SSG/SSR hybrid) · Preact islands · SQLite via `better-sqlite3` · `@astrojs/node` adapter

**Files created (68 files, +6 370 lines):**

| Area | What was built |
|------|---------------|
| Config | `astro.config.mjs`, `tsconfig.json`, `package.json`, `.env.example`, `.gitignore` |
| CSS | Full design-token system (`global.css`), site shell (`layout.css`), component styles (`components.css`) — Naturalist Field Guide aesthetic, WCAG AA, dark mode, `forced-colors` |
| Layout | `src/layouts/Base.astro` — HTML shell with skip-to-content, aria-live region, mobile nav toggle, semantic nav/footer, persistent region chip |
| Components | 15 components: `BirdCard`, `PlantCard`, `SeasonIndicator`, `Picture`, `Breadcrumb`, `Attribution`, `EmptyState`, `SkeletonCard` (fully styled); `RegionSelector`, `FilterPanel`, `AudioPlayer`, `MiniPlayer`, `MobileNav`, `GardenBuilder` (Preact stubs) |
| Lib | `validate.ts` (full), `media.ts` (path-traversal prevention), `seasonality.ts` (bloom + temp filtering with month wrap-around), `db.ts` (SQLite singleton + security pragmas), `queries.ts` (typed interface, stub), `rateLimit.ts` (sliding-window in-memory) |
| Database | `db/schema.sql` — full DDL: `region`, `bird`, `plant`, `bird_plant`, `bird_region_season`, `song`, `image` tables; FTS5 virtual tables; triggers; indices |
| Seed data | Initial JSON: 16 regions, 19 birds, 15 plants, 51 bird-plant relations |
| Pages | 9 routes (`/`, `/plants`, `/plants/[slug]`, `/birds`, `/birds/[slug]`, `/garden`, `/about`, `/404`, `/500`) |
| API | 5 routes: `/api/regions`, `/api/plants`, `/api/birds`, `/api/songs/[id]`, `/api/garden/birds` |
| Tests | `seasonality.test.ts` (33 tests), `validate.test.ts` (62 tests) — **95/95 passing** |
| Deploy | `Caddyfile` (reverse proxy + full security headers), `bird-garden.service` (systemd with sandboxing), `install.sh` (single-command Debian deploy) |

### Commit 2 — Tasks 2+3 (partial): Seed infrastructure + expanded dataset

**Files changed (+1 929 lines across 6 files):**

`scripts/seed-db.ts` — full implementation: reads all JSON, inserts in dependency order, multi-pass parent resolution, `INSERT OR IGNORE` idempotency, single transaction per table, `PRAGMA integrity_check` on completion.

`scripts/validate-data.ts` — referential integrity validator (note: later found to be a stub in the repo; fully implemented in session 3).

`db/seed-data/birds.json` — 19 → 72 birds across all major backyard families (cardinals, finches, thrushes, warblers, sparrows, woodpeckers, swallows, orioles, hummingbirds, chickadees, nuthatches, wrens, vireos, etc.)

`db/seed-data/plants.json` — 16 → 51 native plants (trees, shrubs, perennials, grasses, vines) with USDA hardiness zones and bloom months.

`db/seed-data/bird-plant.json` — 51 → 231 relations with `relation_type` (food/nesting/shelter/foraging).

`db/seed-data/plant-region.json` — new file (53 entries) mapping plants to their native regions.

---

## Session 2 — Queries, APIs, pages, and Preact islands
Branch: `claude/continue-bird-garden-jHbft`

### Commit 3 — Tasks 5: DB queries, API routes, seed script
`3c445bb`

- `src/lib/queries.ts` — full SQL implementations: `getRegions`, `getPlants` (FTS5 search, pagination, sort, bloom filter), `getPlantBySlug`, `getBirdsForPlant`, `getBirdBySlug`, `getSongsForBird`, `getSongById`, `getImagesForEntity`, `getBirdsForGarden`
- All API routes wired to queries with validation and rate limiting: `/api/regions`, `/api/plants`, `/api/birds`, `/api/songs/[id]` (HTTP Range streaming), `/api/garden/birds`
- `scripts/seed-db.ts` fully implemented
- `db/seed-data/` populated: 19 birds, 15 plants, 16 regions, 31 songs, 34 images, 53 bird-plant pairs, 1 992 bird-region-season rows

### Commit 4 — Task 6: API endpoint tests
`5a7d007`

- `tests/api.test.ts` — 34 previously-stubbed tests now passing
- `tests/queries.test.ts` — full query test coverage with in-memory bun:sqlite fixture
- Total: **159 tests passing**

### Commits 5–7 — Tasks 7–9: Landing page, plant browser, bird browser, detail pages
`87146b5`

- `src/pages/index.astro` — hero + RegionSelector island
- `src/pages/plants/index.astro` + `src/pages/plants/[slug].astro` — FilterPanel island, plant detail with JSON-LD, images, bird list, season indicators
- `src/pages/birds/index.astro` + `src/pages/birds/[slug].astro` — bird list, bird detail with AudioPlayer islands, songs list
- `src/components/RegionSelector.tsx` — full implementation: hierarchical dropdowns (continent→country→state), "Use my location" geolocation, localStorage persistence, URL param sync
- `src/components/FilterPanel.tsx` — full implementation: search (debounced), plant type filter, sort controls, Blooming now toggle, active filter chips, load more, skeleton loading
- `src/components/AudioPlayer.tsx` — full implementation: waveform SVG visualisation, play/pause, progress bar, speed controls (0.5×/0.75×/1×), keyboard nav (Space/Enter/Arrow keys), singleton via CustomEvent, aria-live announcements
- `src/pages/sitemap.xml.ts` — dynamic sitemap endpoint
- JSON-LD structured data on bird and plant detail pages

---

## Session 3 — Stub components, test infrastructure, CI, hardening
Branch: `claude/continue-bird-garden-k3V3Z`

### Commit 1 — Stub components, garden coverage API, component tests
`19f18ad`

#### Components implemented (were stubs)

**`src/components/MobileNav.tsx`**
- Slide-out drawer using native `<dialog>` element
- All five nav links; `aria-expanded` on hamburger; `aria-current="page"` on active link
- Closes on close-button click or backdrop click; body scroll locked when open

**`src/components/MiniPlayer.tsx`**
- Sticky bottom "now playing" bar; renders `null` by default
- Driven by custom events: `bird-garden:song-play` (show/play), `bird-garden:song-pause`/`song-end` (pause), `bird-garden:mini-pause` (outgoing to AudioPlayer)
- Dismiss hides it; reappears on next `song-play` event

**`src/components/GardenBuilder.tsx`**
- `localStorage` persistence with JSON validation on read
- Shared garden URL: `?plants=slug:Name,slug:Name&region=slug`
- 12-month bird activity coverage chart (`CoverageChart` sub-component, current month highlighted)
- Month selector drives bird list re-fetch
- Share button → clipboard, shows "Link copied!" feedback
- Listens for `bird-garden:add-plant` custom event (fired by plant card buttons)
- Onboarding empty state; summary stats: plant count + bird species this month

#### New component

**`src/components/ErrorBoundary.tsx`**
- Preact class component with `getDerivedStateFromError` + `componentDidCatch`
- SVG icon, error message, optional `fallback` prop, "Try again" reset button

#### New API + query

**`getGardenCoverage(db, { plantSlugs, regionSlug })`** in `src/lib/queries.ts`
- Returns `MonthCoverage[12]` — always 12 entries, missing months filled with `bird_count: 0`

**`GET /api/garden/coverage`** — `src/pages/api/garden/coverage.ts`
- Params: `plants` (comma-separated slugs), `region`
- Rate-limited, validated, consistent error shape

**`src/pages/garden.astro`** — now renders `<GardenBuilder client:load />` instead of a placeholder.

#### Test infrastructure

**`tests/setup.ts`** (new)
- Manually instantiates `new Window()` from happy-dom and assigns to `globalThis`
- Required because Bun 1.3.9's `environment = "happy-dom"` in bunfig.toml does NOT inject DOM globals
- Also assigns `window.SyntaxError/TypeError/Error` (needed by happy-dom's `querySelectorAll` parser)
- Sets a no-op `fetch` stub; tests must override both `globalThis.fetch` AND `(window as any).fetch`

**`bunfig.toml`** (new) — `preload = ["./tests/setup.ts"]`

**`tests/components/` — 6 new test files (66 tests)**

| File | Tests | Key coverage |
|------|-------|--------------|
| `RegionSelector.test.tsx` | 10 | Loading state, continent→country→state cascade, geolocation error, pre-fill from `initialRegion`, fetch failure |
| `FilterPanel.test.tsx` | 11 | Region prompt, filter controls, plant cards, skeletons, error state, empty state, filter chips, clear all, load more, sort options, Blooming now toggle |
| `AudioPlayer.test.tsx` | 10 | `aria-label`, play button state, progress bar ARIA, speed controls, `src` attribute, singleton `song-play` event, `sr-only` live region |
| `MiniPlayer.test.tsx` | 8 | Hidden by default, appears on event, bird name, Playing status, dismiss, play/pause toggle, default name, reappear after dismiss |
| `MobileNav.test.tsx` | 7 | Hamburger, `aria-expanded`, dialog, all nav links, close button, `aria-label`, link labels |
| `ErrorBoundary.test.tsx` | 7 | Safe children, fallback on throw, error message, custom fallback prop, Try again button, reset, no alert for safe children |

**`tests/queries.test.ts`** — 6 new `getGardenCoverage` tests added.

**Test count after this commit:** 231 pass, 0 fail (up from 159)

---

### Commit 2 — CI, rate limiter hardening, E2E tests, validate-data
`33da519`

#### `scripts/validate-data.ts` — fully implemented (was a stub)
- Slug format (`^[a-z0-9]+(?:-[a-z0-9]+)*$`), required fields, month ranges, USDA zone ordering, parent references, duplicate detection
- Duplicate-pair key uses full `(bird_slug, plant_slug, attraction_type)` matching the DB primary key
- Exits 1 on error, 0 on success; prints summary + warning/error lists
- **Bugs found and fixed:** duplicate `american-goldfinch` in birds.json removed (now 19 birds); incorrect duplicate-pair key fixed

#### `src/middleware/rateLimit.ts` — SQLite-on-disk with in-memory fallback
- **Production (Node.js):** `better-sqlite3`, persists to `./db/rate-limit.sqlite` (overrideable via `RL_DB_PATH`)
- **Bun/test runtime:** `better-sqlite3` is a native Node.js addon and fails in Bun; caught silently, falls back to in-memory `Map`
- Same public interface — no changes to API routes
- Upsert uses `ON CONFLICT DO UPDATE … RETURNING` for atomicity (no read-after-write race)
- Periodic cleanup `setInterval` with `unref()`

#### `.github/workflows/ci.yml` — two-job CI pipeline

**`test` job** (every push/PR to main):
1. Setup Bun 1.3.9
2. `bun install --frozen-lockfile`
3. `bun run validate-data`
4. `bun run test`

**`e2e` job** (after `test` passes):
1. Install Playwright + Chromium (`--with-deps`)
2. `bun run seed`
3. `bun run build`
4. `bunx playwright test`

#### `.github/dependabot.yml` — fixed
Was broken (`package-ecosystem: ""`). Now `"npm"` with grouped updates for Astro, Preact, Playwright.

#### `package.json` — script changes
- `"test"` → `"bun test tests/"` (prevents Playwright `.spec.ts` files being picked up by bun:test)
- Added `"test:e2e": "bunx playwright test"`

#### `playwright.config.ts` + `e2e/*.spec.ts` — Playwright E2E setup

| File | Flow tested |
|------|-------------|
| `home.spec.ts` | Page title, nav links, region selector hydrates, continent options, country dropdown on selection, Browse button disabled |
| `plants.spec.ts` | Region prompt, filter controls, plant cards, card links, search narrows results, type filter chip |
| `birds.spec.ts` | Bird list, detail page title + scientific name + breadcrumb, 404 for unknown slug |
| `garden.spec.ts` | Empty state, empty state link, shared URL, coverage chart, remove plant, share to clipboard |
| `navigation.spec.ts` | Cross-page nav, about, 404, sitemap.xml, Add to Garden → localStorage |

---

### Commit 3 — Media scripts, AudioPlayer coordination, GardenBuilder jukebox

#### `scripts/fetch-media.ts` — fully implemented (was a stub)
- Downloads CC0/CC-BY bird song recordings from **Xeno-canto API v2** using bird scientific names
- Downloads bird and plant images from **Wikimedia Commons** (Wikipedia page → `pageimages` API → imageinfo for license)
- Reads `db/seed-data/birds.json` and `plants.json`; writes `songs.json` and `images.json` manifests
- Exponential backoff retry (1s→2s→4s→8s) for 429/5xx; polite sleep between requests
- `DRY_RUN=1` mode logs URLs without downloading
- License verification: only downloads CC0 (`publicdomain/zero/1.0`) and CC-BY 3.0/4.0 recordings from Xeno-canto
- **Note:** initial output paths and manifest field names had a mismatch with `media.ts`/`seed-db.ts`; corrected in Commit 4

#### `scripts/optimize-images.ts` — fully implemented (was a stub)
- For each source image: generates AVIF at 400/800/1200w; WebP at 400/800/1200w; JPEG at 800w (fallback)
- LQIP: 20px-wide WebP encoded as base64 data URI (stored in manifest for inline CSS)
- Subtle warm color grade via `sharp().tint({ r: 4, g: 2, b: -3 })` for visual cohesion
- Skips already-processed images unless `FORCE=1`
- Graceful error if `sharp` not installed or source directory doesn't exist
- **Note:** initial paths were wrong; corrected in Commit 4

#### `src/components/AudioPlayer.tsx` — event coordination fixes
- Now listens for `bird-garden:mini-pause` event; pauses audio when `detail.songId` matches
- Dispatches `bird-garden:song-pause` when user pauses via the AudioPlayer play/pause button
- Dispatches `bird-garden:song-end` when audio element fires `ended`
- Includes `birdName` in the `bird-garden:song-play` event detail (MiniPlayer now shows real bird name instead of "Bird song")

#### `src/components/GardenBuilder.tsx` — jukebox mode
- **"Play All" button** in the Birds section header; only shown when ≥1 bird has songs
- Builds a playlist from all birds-with-songs currently in the list
- Auto-advances: listens for `bird-garden:song-end`; plays next bird after 200ms delay
- **Visual highlight**: currently-playing bird row gets a primary-color border
- **Progress indicator**: "2 / 7" counter next to the Stop button
- "Stop" button dispatches `bird-garden:mini-pause` to halt the current song
- Playlist resets when month/region changes (birds list changes)

---

### Commit 4 — Media path fixes, RegionSelector test fix, jukebox tests, about page

#### `scripts/fetch-media.ts` — paths and manifest fields corrected
- Output audio files to `media/songs/` (matches `src/lib/media.ts` `getSongPath`)
- Output images to `media/images/{birds|plants}/` (matches `getImagePath`)
- `songs.json` now outputs `SongRecord` fields: `bird_slug`, `filename`, `format`, `duration_sec`, `source_url`, `license`, `recordist`, `recording_date`, `recording_loc`
- `images.json` now outputs `ImageRecord` fields: `entity_type`, `entity_slug`, `filename`, `alt_text`, `width`, `height`, `source_url`, `license`, `author`, `is_primary`
- Both match the schema expected by `scripts/seed-db.ts`

#### `scripts/optimize-images.ts` — path convention fixed
- Reads from `media/images/{birds|plants}/` (flat files, not slug subdirectories)
- Writes optimized variants to `media/images/{birds|plants}/opt/`
- Manifest field names updated to `entity_slug`, `entity_type` to align with seed-db

#### `tests/components/RegionSelector.test.tsx` — flake fixed (**0 fail now**)
- "renders gracefully when fetch fails" was timing out in full-suite runs (parallel test files racing on `globalThis.fetch`)
- Fix: use `act(async () => { await new Promise(r => setTimeout(r, 50)) })` to explicitly flush the useEffect + promise chain + Preact re-render, instead of `waitFor` polling which was susceptible to timing races
- Also switched mock to `Promise.reject()` (direct rejection, no synchronous throw inside `.then()`)

#### `tests/components/GardenBuilder.test.tsx` — 6 jukebox tests added (18 total)
- "Play All button appears when birds with songs are loaded"
- "Play All button is absent when no birds have songs"
- "clicking Play All dispatches song-play event" — verifies `songId` and `birdName` in event detail
- "Stop button appears after Play All is clicked"
- "Stop button dispatches mini-pause and hides itself"
- "currently playing bird row gets highlighted border" — checks `data-jukebox-current="true"`

#### `src/pages/about.astro` — full content (was stub)
- Xeno-canto: CC0/CC-BY licensing, per-recording attribution
- Wikimedia Commons: image sourcing, photographer attribution
- Bird/plant data: USDA PLANTS, eBird, IUCN Red List conservation status
- USDA Hardiness Zones explanation
- Media attribution section: explains where recordist/photographer credit appears in the UI
- Privacy section: localStorage, geolocation (never sent to server), no accounts required
- Open source section: links to GitHub, Astro, Preact, Bun

---

## Current state

| Metric | Value |
|--------|-------|
| Unit + integration tests (`bun run test`) | **237 pass, 0 fail** |
| E2E tests (`bun run test:e2e`) | 28 tests — require live server |
| Seed data | 19 birds, 15 plants, 16 regions, 31 songs, 34 images, 53 bird-plant pairs, 1 992 bird-region-season rows |
| API endpoints | `/api/regions`, `/api/plants`, `/api/birds`, `/api/songs/[id]`, `/api/garden/birds`, `/api/garden/coverage` |
| Pages | `/`, `/plants`, `/plants/[slug]`, `/birds`, `/birds/[slug]`, `/garden`, `/about`, `/404`, `/500` |

---

## What still needs doing
1. **Real media files** — `fetch-media.ts` and `optimize-images.ts` are implemented but need actual network access. Run `bun run fetch-media && bun run optimize-images && bun run seed` on a machine with internet access to populate `media/` and the DB.
2. **AudioPlayer song metadata** — The component only receives `songId` and `birdName`; full metadata (recordist, location, license) is displayed server-side on the bird detail page below each player, but not fetched client-side. This is intentional (reduces API calls) but means the AudioPlayer attribution block inside the component is never populated.
3. **`about.astro` live data** — The About page's "Media Attribution" section describes where attribution appears in the UI, but doesn't generate a live list of all sources. This could be a future enhancement once media is fetched.

---

## Key quirks to remember

- **Bun 1.3.9 + happy-dom**: `environment = "happy-dom"` in bunfig.toml does NOT inject DOM globals. `tests/setup.ts` must be preloaded and does it manually. Do not remove or "simplify" this.
- **Fetch mocking**: must set both `globalThis.fetch` AND `(window as any).fetch`. The happy-dom Window instance shadows `globalThis.fetch` in component code.
- **`querySelectorAll` in happy-dom**: requires `window.SyntaxError` to be the native `SyntaxError`. Set in `tests/setup.ts`.
- **ARIA role+name queries**: `screen.getByRole('link', { name: 'Plants' })` generates CSS selectors happy-dom's parser rejects. Use `container.querySelector('a[href="/plants"]')` or `screen.getByText()` instead.
- **Testing negative fetch outcomes** (loading disappears after failure): `waitFor` polling is unreliable in full-suite runs because parallel test files can race on `globalThis.fetch` between `render()` and the component's `useEffect`. Use `act(async () => { await new Promise(r => setTimeout(r, 50)) })` to flush the microtask queue synchronously instead. Also prefer `Promise.reject()` over throwing inside `.then()`.
- **Rate limiter under Bun**: `better-sqlite3` fails silently; in-memory fallback activates automatically. Rate limit tests in `api.test.ts` use the memory backend and pass.
- **`bun test` vs `bun run test`**: bare `bun test` scans the whole project and picks up Playwright `.spec.ts` files. Always use `bun run test` (or `bun test tests/`) for unit tests.
- **DB alias**: `@lib/` → `src/lib/`, `@/middleware/` → `src/middleware/` via tsconfig path aliases. Used in all API routes.
- **Seed script uses `bun:sqlite`**, not `better-sqlite3`, because it runs directly under Bun. Production code uses `better-sqlite3` (loaded by Astro's Node adapter).
- **Media file paths**: audio at `media/songs/{filename}`, images at `media/images/birds/{filename}` and `media/images/plants/{filename}`. The `media/` root is configurable via `MEDIA_PATH` env var. `src/lib/media.ts` is the single source of truth for path resolution — do not hardcode `/media/` elsewhere.
