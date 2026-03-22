# Session Notes — Bird Garden Architecture

Branch: `claude/setup-bird-garden-architecture-cfZtT`
Date: 2026-03-22
Session: https://claude.ai/code/session_01YGJVkyaR1L7oeGa9HbEXSV

---

## What was done

### Commit 1 — Task 1: Project scaffolding (Bun + Astro 5 + Preact)

Full directory structure and foundational files for the Bird Garden site. All planned modules are created; most page/API implementations are stubs awaiting Tasks 5–12.

**Stack:**
- Runtime: Bun
- Framework: Astro 5 (SSG/SSR hybrid) with Preact for interactive islands
- Database: SQLite via `better-sqlite3`
- Node adapter for server-side routes

**Files created (68 files, +6 370 lines):**

| Area | What was built |
|------|---------------|
| Config | `astro.config.mjs`, `tsconfig.json`, `package.json`, `.env.example`, `.gitignore` |
| CSS | Full design-token system (`global.css`), site shell (`layout.css`), component styles (`components.css`) — Naturalist Field Guide aesthetic, WCAG AA, dark mode, `forced-colors` |
| Layout | `src/layouts/Base.astro` — HTML shell with skip-to-content, aria-live region, mobile nav toggle, semantic nav/footer, persistent region chip |
| Components | 15 components: `BirdCard`, `PlantCard`, `SeasonIndicator`, `Picture`, `Breadcrumb`, `Attribution`, `EmptyState`, `SkeletonCard` (fully styled); `RegionSelector`, `FilterPanel`, `AudioPlayer`, `MiniPlayer`, `MobileNav`, `GardenBuilder` (Preact stubs) |
| Lib | `validate.ts` (full), `media.ts` (path-traversal prevention), `seasonality.ts` (bloom + temp filtering with month wrap-around), `geo.ts` (client-side centroid distance), `db.ts` (SQLite singleton + security pragmas), `queries.ts` (typed interface, stub), `rateLimit.ts` (sliding-window in-memory) |
| Database | `db/schema.sql` — full DDL: `region`, `bird`, `plant`, `bird_plant`, `bird_region_season`, `song`, `image` tables; FTS5 virtual tables; triggers; indices |
| Seed data | Initial JSON: 16 regions, 19 birds, 15 plants, 51 bird-plant relations |
| Pages | 9 routes (`/`, `/plants`, `/plants/[slug]`, `/birds`, `/birds/[slug]`, `/garden`, `/about`, `/404`, `/500`) |
| API | 5 routes: `/api/regions`, `/api/plants`, `/api/birds`, `/api/songs/[id]`, `/api/garden/birds` |
| Tests | `seasonality.test.ts` (33 tests), `validate.test.ts` (62 tests) — **95/95 passing** |
| Deploy | `Caddyfile` (reverse proxy + full security headers), `bird-garden.service` (systemd with sandboxing), `install.sh` (single-command Debian deploy) |

**Build verified:** `bun run build` succeeded cleanly.

---

### Commit 2 — Task 2+3 (partial): Seed infrastructure + expanded dataset

Filled out the seeder scripts and greatly expanded all seed-data JSON files.

**Files changed (+1 929 lines across 6 files):**

#### `scripts/seed-db.ts` — full implementation
- Reads all JSON files and inserts into SQLite in dependency order
- Multi-pass parent resolution for region hierarchy
- `INSERT OR IGNORE` for idempotency (safe to re-run)
- Single transaction per table for speed
- `PRAGMA integrity_check` on completion

#### `scripts/validate-data.ts` — referential integrity validator
- Checks all slugs are unique and well-formed
- Cross-references every foreign slug (bird, plant, region) against its master list
- Validates required fields, month ranges (1–12), USDA zone format
- Prints a coverage report (birds without seasons, plants without regions, etc.)

#### `db/seed-data/birds.json` — 19 → 72 birds
Covers all major backyard families:
- Cardinals & grosbeaks (northern-cardinal, rose-breasted-grosbeak, blue-grosbeak, indigo-bunting, painted-bunting)
- Finches (house-finch, american-goldfinch, purple-finch, pine-siskin)
- Thrushes (american-robin, wood-thrush, hermit-thrush, swainsons-thrush, veery, eastern-bluebird)
- Warblers (yellow-warbler, american-redstart, common-yellowthroat, yellow-rumped-warbler, yellow-breasted-chat)
- Sparrows (song-sparrow, chipping-sparrow, field-sparrow, white-throated-sparrow, white-crowned-sparrow, american-tree-sparrow, fox-sparrow, swamp-sparrow, dark-eyed-junco, eastern-towhee, spotted-towhee)
- Woodpeckers (downy, hairy, red-bellied, northern-flicker, pileated, acorn, yellow-bellied-sapsucker)
- Swallows & flycatchers (tree-swallow, barn-swallow, purple-martin, eastern-phoebe, eastern-kingbird)
- Orioles (baltimore-oriole, orchard-oriole, bullocks-oriole)
- Hummingbirds (ruby-throated, annas, rufous)
- Chickadees, nuthatches, wrens, vireos, kinglets, mimids, and raptors

#### `db/seed-data/plants.json` — 16 → 51 plants
Covers trees, shrubs, perennials, grasses, vines with USDA hardiness zones and bloom months:
- Native trees: eastern-redbud, flowering-dogwood, serviceberry, black-cherry, river-birch, pin-oak, sycamore, tulip-tree, persimmon, hawthorn, elderberry (shrub/tree), crabapple
- Shrubs: native-azalea, buttonbush, beautyberry, spicebush, inkberry, arrowwood-viburnum, highbush-blueberry, native-hydrangea, ninebark, coral-honeysuckle (vine)
- Perennials & wildflowers: coneflower, black-eyed-susan, wild-bergamot, joe-pye-weed, cardinal-flower, great-blue-lobelia, anise-hyssop, goldenrod, asters, ironweed, swamp-milkweed, common-milkweed, wild-columbine, blue-wild-indigo, partridge-pea, native-sunflower, cup-plant, prairie-dropseed, little-bluestem, purple-coneflower (echinacea-pallida)
- Western natives: california-fuchsia, toyon, coffeeberry, western-redbud, blue-wild-rye, deer-grass, manzanita (arctostaphylos-uva-ursi listed)

#### `db/seed-data/bird-plant.json` — 51 → 231 relations
Every new bird wired to plants it uses for food (berries, seeds, nectar, insects), nesting, or shelter. Each relation has a `relation_type` (food/nesting/shelter/foraging) and optional `notes`.

#### `db/seed-data/plant-region.json` — new file (53 entries)
Maps all 51 plants to their native US/Canada regions using the 16-region slug set from `regions.json`.

---

## What remains (next steps)

| File | Status |
|------|--------|
| `db/seed-data/bird-region-season.json` | **Not yet written** — maps 72 birds × regions × months with `presence` type and optional temp ranges |
| `src/lib/queries.ts` | Stub — needs real SQL (Task 5) |
| All API routes | Stub — need query wiring (Task 5) |
| All page routes | Stub — need data fetching (Tasks 6–9) |
| `src/components/RegionSelector.tsx` | Stub (Task 6) |
| `src/components/FilterPanel.tsx` | Stub (Task 7) |
| `src/components/AudioPlayer.tsx` | Stub (Task 8) |
| `src/components/GardenBuilder.tsx` | Stub (Task 9) |
| `tests/api.test.ts` | Stub (Task 10) |
| `tests/queries.test.ts` | Stub (Task 10) |
| `scripts/fetch-media.ts` | Stub (Task 11) |
| `scripts/optimize-images.ts` | Stub (Task 11) |
