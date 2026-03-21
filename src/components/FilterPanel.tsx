/**
 * FilterPanel.tsx — Preact island for plant browser filtering
 *
 * Features:
 *   - Plant type filter, "blooming now" toggle
 *   - Sort controls: Most birds attracted / Alphabetical / Bloom period
 *   - Active filter chips (dismissible) above the grid
 *   - Skeleton loading states during fetch
 *   - Empty state with "clear filters" action
 */
import { useState, useEffect, useRef } from 'preact/hooks';

interface Plant {
  id: number;
  slug: string;
  common_name: string;
  scientific_name: string;
  family: string | null;
  plant_type: string | null;
  description: string | null;
  usda_zone_min: number | null;
  usda_zone_max: number | null;
  bloom_start: number | null;
  bloom_end: number | null;
  bird_count: number;
}

interface Props {
  initialRegion?: string;
  initialMonth?: number;
  initialType?: string;
  initialSort?: string;
  initialSearch?: string;
}

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

const PLANT_TYPES = ['tree','shrub','perennial','grass','vine'];
const SORT_OPTIONS = [
  { value: 'birds',  label: 'Most birds' },
  { value: 'alpha',  label: 'A – Z' },
  { value: 'bloom',  label: 'Bloom order' },
];

function formatBloom(start: number | null, end: number | null): string {
  if (!start || !end) return 'Year-round';
  const s = MONTH_NAMES[start - 1]?.slice(0, 3) ?? '';
  const e = MONTH_NAMES[end - 1]?.slice(0, 3) ?? '';
  return `${s} – ${e}`;
}

/** Pulsing skeleton grid */
function Skeletons({ count = 8 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} class="skeleton-card" aria-hidden="true">
          <div class="skeleton-image" />
          <div class="skeleton-body">
            <div class="skeleton-line skeleton-line-medium" />
            <div class="skeleton-line skeleton-line-short" style="height:0.75rem;" />
            <div class="skeleton-line" style="width:5rem;height:1.5rem;border-radius:var(--radius-full);" />
          </div>
        </div>
      ))}
    </>
  );
}

/** Single plant card rendered by the island */
function PlantCardItem({ plant }: { plant: Plant }) {
  const birdLabel = plant.bird_count === 1 ? '1 bird' : `${plant.bird_count} birds`;
  const typeLabel = plant.plant_type
    ? plant.plant_type.charAt(0).toUpperCase() + plant.plant_type.slice(1)
    : null;
  const bloomLabel = formatBloom(plant.bloom_start, plant.bloom_end);

  return (
    <div class="plant-card animate-card-appear">
      <a href={`/plants/${plant.slug}`} class="plant-card-image" tabindex={-1} aria-hidden="true"
        style="display:block;aspect-ratio:4/3;background:var(--color-green-100);display:flex;align-items:center;justify-content:center;">
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none" aria-hidden="true">
          <path d="M24 6C24 6 10 14 10 28C10 36.837 16.268 44 24 44C31.732 44 38 36.837 38 28C38 14 24 6 24 6Z"
            fill="var(--color-green-300)"/>
          <path d="M24 44V28" stroke="var(--color-green-600)" stroke-width="2" stroke-linecap="round"/>
        </svg>
      </a>
      <div class="plant-card-body">
        <a href={`/plants/${plant.slug}`} style="text-decoration:none;color:inherit;">
          <h3 class="plant-card-name">{plant.common_name}</h3>
        </a>
        {plant.bird_count > 0 && (
          <span class="plant-card-birds-badge" aria-label={`Attracts ${birdLabel}`}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
              <path d="M2 9C2 9 4 6 6 5C8 4 10 5 10 7C10 9 8 10 6 10C5 10 3 9.5 2 9Z"/>
              <circle cx="7.5" cy="4.5" r="1"/>
            </svg>
            {birdLabel}
          </span>
        )}
        <div class="plant-card-meta">
          {typeLabel && <span class="badge badge-sage">{typeLabel}</span>}
          {plant.bloom_start !== null && (
            <span title="Bloom period">{bloomLabel}</span>
          )}
        </div>
        <p class="plant-card-scientific scientific-name">{plant.scientific_name}</p>
      </div>
      <div class="plant-card-footer">
        <button
          class="add-to-garden-btn"
          data-plant-slug={plant.slug}
          data-plant-name={plant.common_name}
          aria-label={`Add ${plant.common_name} to your garden`}
          type="button"
        >
          Add to Garden
        </button>
      </div>
    </div>
  );
}

export default function FilterPanel({
  initialRegion = '',
  initialMonth,
  initialType = '',
  initialSort = 'birds',
  initialSearch = '',
}: Props) {
  const currentMonth = new Date().getMonth() + 1;

  const [region, setRegion] = useState(initialRegion);
  const [month, setMonth] = useState<number | undefined>(initialMonth);
  const [type, setType] = useState(initialType);
  const [sort, setSort] = useState(initialSort || 'birds');
  const [search, setSearch] = useState(initialSearch);

  const [plants, setPlants] = useState<Plant[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const LIMIT = 24;
  const searchRef = useRef<HTMLInputElement>(null);
  const liveRef = useRef<HTMLElement | null>(null);

  function buildUrl(customOffset = offset) {
    const params = new URLSearchParams();
    if (region) params.set('region', region);
    if (month !== undefined) params.set('month', String(month));
    if (type) params.set('type', type);
    if (sort && sort !== 'birds') params.set('sort', sort);
    if (search.trim()) params.set('q', search.trim());
    params.set('limit', String(LIMIT));
    params.set('offset', String(customOffset));
    return `/api/plants?${params}`;
  }

  async function fetchPlants(customOffset = 0, append = false) {
    if (!region) {
      setPlants([]);
      setTotal(0);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch(buildUrl(customOffset));
      if (!res.ok) throw new Error('Failed to load plants');
      const data = await res.json() as { plants: Plant[]; total: number };
      setPlants(append ? (prev) => [...prev, ...data.plants] : data.plants);
      setTotal(data.total);
      setOffset(customOffset);

      // Announce result count to screen readers
      const el = liveRef.current ?? document.getElementById('aria-live-polite');
      if (el) {
        el.textContent = append
          ? `Showing ${customOffset + data.plants.length} of ${data.total} plants`
          : `${data.total} plant${data.total !== 1 ? 's' : ''} found`;
      }
    } catch {
      setError('Could not load plants. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  // Fetch when filters change (debounced for search)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => fetchPlants(0), search ? 400 : 0);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [region, month, type, sort, search]);

  // Keep URL in sync with filter state (no reload)
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (region) params.set('region', region); else params.delete('region');
    if (month !== undefined) params.set('month', String(month)); else params.delete('month');
    if (type) params.set('type', type); else params.delete('type');
    if (sort && sort !== 'birds') params.set('sort', sort); else params.delete('sort');
    if (search.trim()) params.set('q', search.trim()); else params.delete('q');
    history.replaceState(null, '', `?${params}`);
  }, [region, month, type, sort, search]);

  function clearFilters() {
    setMonth(undefined);
    setType('');
    setSort('birds');
    setSearch('');
    if (searchRef.current) searchRef.current.value = '';
  }

  const hasFilters = month !== undefined || type || sort !== 'birds' || search.trim();

  const canLoadMore = plants.length < total;

  return (
    <div>
      {/* Region notice */}
      {!region && (
        <div style="padding:var(--space-4);background:var(--color-bg-subtle);border-radius:var(--radius-lg);border:1px dashed var(--color-border);text-align:center;margin-bottom:var(--space-6);">
          <p style="color:var(--color-text-muted);">
            <a href="/" style="color:var(--color-primary);">Select your region</a>
            {' '}to see plants native to your area.
          </p>
        </div>
      )}

      {/* Filters toolbar */}
      <div style="display:flex;flex-wrap:wrap;gap:var(--space-3);align-items:flex-end;margin-bottom:var(--space-6);">
        {/* Search */}
        <div style="flex:1;min-width:220px;">
          <label for="plant-search" style="display:block;font-size:var(--text-sm);font-weight:var(--font-medium);margin-bottom:var(--space-1);color:var(--color-text-muted);">
            Search
          </label>
          <input
            id="plant-search"
            ref={searchRef}
            type="search"
            placeholder="Search plants…"
            defaultValue={search}
            onInput={(e) => setSearch((e.target as HTMLInputElement).value)}
            style="width:100%;padding:var(--space-2) var(--space-3);border:1px solid var(--color-border);border-radius:var(--radius-md);background:var(--color-bg-card);color:var(--color-text);font-size:var(--text-base);min-height:2.75rem;"
            aria-label="Search plants by name"
          />
        </div>

        {/* Plant type */}
        <div style="min-width:140px;">
          <label for="plant-type" style="display:block;font-size:var(--text-sm);font-weight:var(--font-medium);margin-bottom:var(--space-1);color:var(--color-text-muted);">
            Type
          </label>
          <select
            id="plant-type"
            value={type}
            onChange={(e) => setType((e.target as HTMLSelectElement).value)}
            style="width:100%;padding:var(--space-2) var(--space-3);border:1px solid var(--color-border);border-radius:var(--radius-md);background:var(--color-bg-card);color:var(--color-text);font-size:var(--text-base);min-height:2.75rem;"
          >
            <option value="">All types</option>
            {PLANT_TYPES.map((t) => (
              <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
            ))}
          </select>
        </div>

        {/* Sort */}
        <div style="min-width:140px;">
          <label for="plant-sort" style="display:block;font-size:var(--text-sm);font-weight:var(--font-medium);margin-bottom:var(--space-1);color:var(--color-text-muted);">
            Sort
          </label>
          <select
            id="plant-sort"
            value={sort}
            onChange={(e) => setSort((e.target as HTMLSelectElement).value)}
            style="width:100%;padding:var(--space-2) var(--space-3);border:1px solid var(--color-border);border-radius:var(--radius-md);background:var(--color-bg-card);color:var(--color-text);font-size:var(--text-base);min-height:2.75rem;"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* Blooming now toggle */}
        <div style="flex-shrink:0;">
          <div style="font-size:var(--text-sm);margin-bottom:var(--space-1);visibility:hidden;" aria-hidden="true">&nbsp;</div>
          <button
            class={`btn ${month === currentMonth ? 'btn-accent' : 'btn-outline'}`}
            type="button"
            onClick={() => setMonth(month === currentMonth ? undefined : currentMonth)}
            aria-pressed={month === currentMonth ? 'true' : 'false'}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M7 1C7 1 2 4 2 8C2 10.761 4.239 13 7 13C9.761 13 12 10.761 12 8C12 4 7 1 7 1Z"
                fill={month === currentMonth ? 'currentColor' : 'none'}
                stroke="currentColor" stroke-width="1.5"/>
            </svg>
            Blooming now
          </button>
        </div>
      </div>

      {/* Active filter chips */}
      {hasFilters && (
        <div style="display:flex;flex-wrap:wrap;gap:var(--space-2);margin-bottom:var(--space-4);" role="list" aria-label="Active filters">
          {month !== undefined && (
            <button class="filter-chip" onClick={() => setMonth(undefined)} role="listitem" type="button">
              {MONTH_NAMES[month - 1]}
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                <path d="M2 2L8 8M8 2L2 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
            </button>
          )}
          {type && (
            <button class="filter-chip" onClick={() => setType('')} role="listitem" type="button">
              {type.charAt(0).toUpperCase() + type.slice(1)}
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                <path d="M2 2L8 8M8 2L2 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
            </button>
          )}
          {sort !== 'birds' && (
            <button class="filter-chip" onClick={() => setSort('birds')} role="listitem" type="button">
              Sort: {SORT_OPTIONS.find((o) => o.value === sort)?.label}
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                <path d="M2 2L8 8M8 2L2 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
            </button>
          )}
          {search.trim() && (
            <button class="filter-chip" onClick={() => { setSearch(''); if (searchRef.current) searchRef.current.value = ''; }} role="listitem" type="button">
              "{search.trim()}"
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                <path d="M2 2L8 8M8 2L2 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
            </button>
          )}
          <button class="btn btn-ghost" onClick={clearFilters} style="font-size:var(--text-sm);min-height:2rem;" type="button">
            Clear all
          </button>
        </div>
      )}

      {/* Results count */}
      {region && !loading && (
        <p style="font-size:var(--text-sm);color:var(--color-text-muted);margin-bottom:var(--space-4);" aria-live="polite">
          {total === 0 ? 'No plants found' : `${total} plant${total !== 1 ? 's' : ''}`}
        </p>
      )}

      {/* Error */}
      {error && (
        <p role="alert" style="color:var(--color-error);padding:var(--space-4);background:var(--color-bg-subtle);border-radius:var(--radius-md);margin-bottom:var(--space-4);">
          {error}
        </p>
      )}

      {/* Card grid */}
      <div class="card-grid" aria-label="Plant list" aria-busy={loading ? 'true' : 'false'}>
        {loading && plants.length === 0 ? (
          <Skeletons count={LIMIT} />
        ) : plants.length > 0 ? (
          plants.map((p) => <PlantCardItem key={p.slug} plant={p} />)
        ) : region && !loading ? (
          <div style="grid-column:1/-1;padding:var(--space-12);text-align:center;">
            <div class="empty-state">
              <svg class="empty-state-icon" viewBox="0 0 64 64" fill="none" aria-hidden="true" style="width:64px;height:64px;margin:auto;">
                <path d="M32 8C32 8 12 18 12 36C12 47.046 21.507 56 32 56C42.493 56 52 47.046 52 36C52 18 32 8 32 8Z"
                  fill="var(--color-green-100)" stroke="var(--color-green-300)" stroke-width="2"/>
                <path d="M32 56L32 38" stroke="var(--color-green-400)" stroke-width="2" stroke-linecap="round"/>
                <text x="32" y="40" text-anchor="middle" font-size="18" font-weight="bold"
                  fill="var(--color-green-500)" font-family="serif">?</text>
              </svg>
              <h2 style="margin-top:var(--space-4);font-family:var(--font-display);">No plants found</h2>
              <p style="color:var(--color-text-muted);margin-top:var(--space-2);">
                Try adjusting your filters or{' '}
                <button
                  class="btn btn-ghost"
                  style="display:inline;padding:0;text-decoration:underline;font-size:inherit;"
                  onClick={clearFilters}
                  type="button"
                >
                  clear them
                </button>
                .
              </p>
            </div>
          </div>
        ) : null}
      </div>

      {/* Load more */}
      {canLoadMore && !loading && (
        <div style="text-align:center;margin-top:var(--space-8);">
          <button
            class="btn btn-outline"
            type="button"
            onClick={() => fetchPlants(offset + LIMIT, true)}
          >
            Load more
            <span style="color:var(--color-text-subtle);margin-left:var(--space-2);" aria-hidden="true">
              ({plants.length} / {total})
            </span>
          </button>
        </div>
      )}

      {/* Loading more spinner */}
      {loading && plants.length > 0 && (
        <div style="text-align:center;margin-top:var(--space-8);" aria-live="polite" aria-label="Loading more plants">
          <div class="skeleton" style="width:120px;height:2.75rem;border-radius:var(--radius-md);margin:auto;" />
        </div>
      )}
    </div>
  );
}
