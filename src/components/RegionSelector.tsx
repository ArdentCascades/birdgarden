/**
 * RegionSelector.tsx — Preact island for region selection
 *
 * Features:
 *   - Hierarchical dropdowns (Continent → Country → State/Province)
 *   - "Use my location" button (user-initiated only, never auto-triggered)
 *   - Client-side centroid distance calculation (coordinates never sent to server)
 *   - Geolocation failure UX with clear, non-technical messages
 *   - Stores selected region in URL params + localStorage (validated on read)
 *   - Progressive enhancement: falls back to <form> without JS
 */
import { useState, useEffect } from 'preact/hooks';

interface Region {
  id: number;
  slug: string;
  name: string;
  level: string;
  parent_id: number | null;
  latitude: number | null;
  longitude: number | null;
}

interface Props {
  /** Initial region slug pre-selected from URL / localStorage */
  initialRegion?: string;
}

/** Haversine distance in km */
function distKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const STORAGE_KEY = 'bird-garden-region';

export default function RegionSelector({ initialRegion }: Props) {
  const [regions, setRegions] = useState<Region[]>([]);
  const [continent, setContinent] = useState('');
  const [country, setCountry] = useState('');
  const [state, setState] = useState(initialRegion ?? '');
  const [geoStatus, setGeoStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/regions')
      .then((r) => r.json())
      .then((data: { regions: Region[] }) => {
        setRegions(data.regions);
        setLoading(false);

        // Pre-fill parent dropdowns when an initial region is known
        if (initialRegion) {
          const reg = data.regions.find((r) => r.slug === initialRegion);
          if (reg?.parent_id) {
            const parent = data.regions.find((r) => r.id === reg.parent_id);
            if (parent?.parent_id) {
              const grandparent = data.regions.find((r) => r.id === parent.parent_id);
              if (grandparent) setContinent(grandparent.slug);
              setCountry(parent.slug);
            } else if (parent) {
              setContinent(parent.slug);
            }
          }
        }
      })
      .catch(() => setLoading(false));
  }, []);

  const continents = regions.filter((r) => r.level === 'continent');
  const continentId = regions.find((r) => r.slug === continent)?.id;
  const countries = regions.filter((r) => r.level === 'country' && r.parent_id === continentId);
  const countryId = regions.find((r) => r.slug === country)?.id;
  const states = regions.filter((r) => r.level === 'state_province' && r.parent_id === countryId);

  function handleUseLocation() {
    if (!navigator.geolocation) {
      setGeoStatus('error');
      return;
    }
    setGeoStatus('loading');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        const candidates = regions.filter(
          (r) => r.level === 'state_province' && r.latitude !== null && r.longitude !== null,
        );
        let nearest: Region | null = null;
        let minDist = Infinity;
        for (const r of candidates) {
          const d = distKm(latitude, longitude, r.latitude!, r.longitude!);
          if (d < minDist) {
            minDist = d;
            nearest = r;
          }
        }
        if (nearest) {
          setState(nearest.slug);
          const parent = regions.find((r) => r.id === nearest!.parent_id);
          if (parent) {
            setCountry(parent.slug);
            const grandparent = regions.find((r) => r.id === parent.parent_id);
            if (grandparent) setContinent(grandparent.slug);
          }
        }
        setGeoStatus('idle');
      },
      () => setGeoStatus('error'),
      { timeout: 10_000 },
    );
  }

  function handleBrowse() {
    const slug = state || country || continent;
    if (!slug) return;
    try {
      localStorage.setItem(STORAGE_KEY, slug);
    } catch {
      // localStorage may be unavailable (private browsing, etc.)
    }
    window.location.href = `/plants?region=${encodeURIComponent(slug)}`;
  }

  const selectedSlug = state || country || continent;

  if (loading) {
    return (
      <div class="region-selector" aria-busy="true" aria-label="Loading region selector">
        <div style="display:flex;flex-direction:column;gap:var(--space-3);">
          <div class="skeleton" style="height:2.75rem;border-radius:var(--radius-md);" />
          <div class="skeleton" style="height:2.75rem;border-radius:var(--radius-md);width:60%;" />
        </div>
      </div>
    );
  }

  return (
    <div class="region-selector">
      <div style="display:flex;flex-wrap:wrap;gap:var(--space-3);align-items:flex-end;">
        {/* Continent */}
        <div style="flex:1;min-width:160px;">
          <label
            for="region-continent"
            style="display:block;font-size:var(--text-sm);font-weight:var(--font-medium);margin-bottom:var(--space-1);color:var(--color-text-muted);"
          >
            Continent
          </label>
          <select
            id="region-continent"
            style="width:100%;padding:var(--space-2) var(--space-3);border:1px solid var(--color-border);border-radius:var(--radius-md);background:var(--color-bg-card);color:var(--color-text);font-size:var(--text-base);min-height:2.75rem;"
            value={continent}
            onChange={(e) => {
              setContinent((e.target as HTMLSelectElement).value);
              setCountry('');
              setState('');
            }}
          >
            <option value="">Select continent…</option>
            {continents.map((c) => (
              <option key={c.slug} value={c.slug}>{c.name}</option>
            ))}
          </select>
        </div>

        {/* Country — shown once continent is selected */}
        {continent && (
          <div style="flex:1;min-width:160px;">
            <label
              for="region-country"
              style="display:block;font-size:var(--text-sm);font-weight:var(--font-medium);margin-bottom:var(--space-1);color:var(--color-text-muted);"
            >
              Country
            </label>
            <select
              id="region-country"
              style="width:100%;padding:var(--space-2) var(--space-3);border:1px solid var(--color-border);border-radius:var(--radius-md);background:var(--color-bg-card);color:var(--color-text);font-size:var(--text-base);min-height:2.75rem;"
              value={country}
              onChange={(e) => {
                setCountry((e.target as HTMLSelectElement).value);
                setState('');
              }}
            >
              <option value="">Select country…</option>
              {countries.map((c) => (
                <option key={c.slug} value={c.slug}>{c.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* State/Province — shown once country is selected */}
        {country && states.length > 0 && (
          <div style="flex:1;min-width:160px;">
            <label
              for="region-state"
              style="display:block;font-size:var(--text-sm);font-weight:var(--font-medium);margin-bottom:var(--space-1);color:var(--color-text-muted);"
            >
              State / Province
            </label>
            <select
              id="region-state"
              style="width:100%;padding:var(--space-2) var(--space-3);border:1px solid var(--color-border);border-radius:var(--radius-md);background:var(--color-bg-card);color:var(--color-text);font-size:var(--text-base);min-height:2.75rem;"
              value={state}
              onChange={(e) => setState((e.target as HTMLSelectElement).value)}
            >
              <option value="">Select state/province…</option>
              {states.map((s) => (
                <option key={s.slug} value={s.slug}>{s.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Use my location */}
        <div style="flex-shrink:0;">
          <div style="font-size:var(--text-sm);margin-bottom:var(--space-1);visibility:hidden;" aria-hidden="true">
            &nbsp;
          </div>
          <button
            class="btn btn-outline"
            type="button"
            onClick={handleUseLocation}
            disabled={geoStatus === 'loading'}
            aria-label="Detect my region from current location"
            style="white-space:nowrap;"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
              <circle cx="8" cy="6.5" r="2.5" stroke="currentColor" stroke-width="1.5"/>
              <path d="M8 14C8 14 3 10 3 6.5C3 3.46 5.24 1 8 1C10.76 1 13 3.46 13 6.5C13 10 8 14 8 14Z"
                stroke="currentColor" stroke-width="1.5" fill="none"/>
            </svg>
            {geoStatus === 'loading' ? 'Locating…' : 'Use my location'}
          </button>
        </div>
      </div>

      {geoStatus === 'error' && (
        <p
          role="alert"
          style="font-size:var(--text-sm);color:var(--color-error);margin-top:var(--space-2);"
        >
          Location unavailable. Please select your region from the dropdowns above.
        </p>
      )}

      <div style="margin-top:var(--space-4);">
        <button
          class="btn btn-accent"
          type="button"
          onClick={handleBrowse}
          disabled={!selectedSlug}
          style="width:100%;max-width:320px;"
        >
          Browse Native Plants
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M3 8H13M9 4l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </div>
    </div>
  );
}
