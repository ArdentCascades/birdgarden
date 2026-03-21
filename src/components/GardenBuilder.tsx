/**
 * GardenBuilder.tsx — Preact island: main garden feature
 *
 * Features:
 *   - Reads plants from localStorage ("bird-garden-plants" = JSON {slug,name}[])
 *   - Reads region from localStorage ("bird-garden-region")
 *   - Zero-plants onboarding state with link to plant browser
 *   - Garden summary: total plants, bird species count, 12-month coverage chart
 *   - Plant list with ✕ remove button
 *   - Bird list fetched from /api/garden/birds (month + region filtered)
 *   - "Share" button generates URL with plant slugs as ?plants=slug1,slug2
 *   - Loads shared gardens from ?plants= URL param on page load
 *   - localStorage persistence and validation
 */
import { useState, useEffect } from 'preact/hooks';

interface GardenPlant {
  slug: string;
  name: string;
}

interface BirdResult {
  id: number;
  slug: string;
  common_name: string;
  scientific_name: string;
  family: string | null;
  presence: string;
  attraction_type: string | null;
}

const STORAGE_KEY = 'bird-garden-plants';
const REGION_KEY = 'bird-garden-region';
const MAX_PLANTS = 50;

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function loadPlants(): GardenPlant[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (p: unknown): p is GardenPlant =>
          typeof p === 'object' &&
          p !== null &&
          typeof (p as GardenPlant).slug === 'string' &&
          typeof (p as GardenPlant).name === 'string',
      )
      .slice(0, MAX_PLANTS);
  } catch {
    return [];
  }
}

function savePlants(plants: GardenPlant[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(plants));
  } catch {
    // Storage unavailable — fail silently
  }
}

function loadRegion(): string {
  try {
    return localStorage.getItem(REGION_KEY) ?? '';
  } catch {
    return '';
  }
}

export default function GardenBuilder() {
  const [plants, setPlants] = useState<GardenPlant[]>([]);
  const [region, setRegion] = useState('');
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [birds, setBirds] = useState<BirdResult[]>([]);
  const [birdsLoading, setBirdsLoading] = useState(false);
  const [birdsError, setBirdsError] = useState('');
  const [shareMsg, setShareMsg] = useState('');

  // On mount: load from localStorage; check URL for shared garden
  useEffect(() => {
    const savedRegion = loadRegion();
    setRegion(savedRegion);

    const url = new URL(window.location.href);
    const urlPlants = url.searchParams.get('plants');
    if (urlPlants) {
      // Shared garden: load from URL param slugs (names not available — use slug as name)
      const slugs = urlPlants.split(',').slice(0, MAX_PLANTS).map((s) => s.trim()).filter(Boolean);
      const shared: GardenPlant[] = slugs.map((slug) => ({
        slug,
        name: slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      }));
      setPlants(shared);
      savePlants(shared);
      // Clean URL
      url.searchParams.delete('plants');
      window.history.replaceState({}, '', url.toString());
    } else {
      setPlants(loadPlants());
    }
  }, []);

  // Listen for add-to-garden events from plant pages
  useEffect(() => {
    function onAddPlant(e: Event) {
      const { slug, name } = (e as CustomEvent<{ slug: string; name: string }>).detail;
      setPlants((prev) => {
        if (prev.some((p) => p.slug === slug)) return prev;
        if (prev.length >= MAX_PLANTS) return prev;
        const next = [...prev, { slug, name }];
        savePlants(next);
        return next;
      });
    }
    window.addEventListener('bird-garden:add-plant', onAddPlant);
    return () => window.removeEventListener('bird-garden:add-plant', onAddPlant);
  }, []);

  // Fetch birds whenever plants, region, or month changes
  useEffect(() => {
    if (!region || plants.length === 0) {
      setBirds([]);
      return;
    }
    setBirdsLoading(true);
    setBirdsError('');
    const slugs = plants.map((p) => p.slug).join(',');
    fetch(`/api/garden/birds?plants=${encodeURIComponent(slugs)}&region=${encodeURIComponent(region)}&month=${month}`)
      .then((res) => res.json())
      .then((data: { birds?: BirdResult[]; error?: string }) => {
        if (data.error) setBirdsError('Could not load birds.');
        else setBirds(data.birds ?? []);
      })
      .catch(() => setBirdsError('Could not load birds.'))
      .finally(() => setBirdsLoading(false));
  }, [plants, region, month]);

  function removePlant(slug: string) {
    setPlants((prev) => {
      const next = prev.filter((p) => p.slug !== slug);
      savePlants(next);
      return next;
    });
  }

  function handleShare() {
    if (plants.length === 0) return;
    const url = new URL(window.location.href);
    url.searchParams.set('plants', plants.map((p) => p.slug).join(','));
    navigator.clipboard.writeText(url.toString()).then(
      () => {
        setShareMsg('Link copied!');
        setTimeout(() => setShareMsg(''), 2500);
      },
      () => {
        setShareMsg(url.toString());
      },
    );
  }

  // ── Zero-plants onboarding ───────────────────────────────────────────────
  if (plants.length === 0) {
    return (
      <div
        style="text-align:center;padding:var(--space-16) var(--space-4);max-width:480px;margin:0 auto;"
      >
        <div style="margin-bottom:var(--space-6);" aria-hidden="true">
          <svg width="80" height="80" viewBox="0 0 80 80" fill="none" style="margin:0 auto;display:block;">
            <path d="M40 10C40 10 16 24 16 46C16 60.912 26.745 73 40 73C53.255 73 64 60.912 64 46C64 24 40 10 40 10Z"
              fill="var(--color-green-200)"/>
            <path d="M40 73V46" stroke="var(--color-green-500)" stroke-width="3" stroke-linecap="round"/>
            <path d="M40 55L50 45" stroke="var(--color-green-400)" stroke-width="2" stroke-linecap="round"/>
            <path d="M40 62L30 52" stroke="var(--color-green-400)" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </div>
        <h2 style="font-family:var(--font-display);font-size:var(--text-2xl);margin-bottom:var(--space-3);">
          Your garden is empty
        </h2>
        <p style="color:var(--color-text-muted);font-size:var(--text-lg);margin-bottom:var(--space-8);line-height:var(--leading-relaxed);">
          Add native plants from the plant browser to see which birds they attract in your area.
        </p>
        <a href="/plants" class="btn btn-accent" style="display:inline-flex;align-items:center;gap:var(--space-2);">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M8 2V14M2 8H14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
          Browse Native Plants
        </a>
      </div>
    );
  }

  // ── Garden with plants ───────────────────────────────────────────────────
  return (
    <div style="padding-bottom:var(--space-16);">

      {/* Summary bar */}
      <div
        style="display:flex;flex-wrap:wrap;gap:var(--space-4);align-items:center;justify-content:space-between;margin-bottom:var(--space-8);padding:var(--space-4) var(--space-6);background:var(--color-bg-card);border:1px solid var(--color-border);border-radius:var(--radius-xl);"
      >
        <div style="display:flex;gap:var(--space-6);">
          <div style="text-align:center;">
            <div style="font-family:var(--font-display);font-size:var(--text-3xl);font-weight:var(--font-bold);color:var(--color-primary);">
              {plants.length}
            </div>
            <div style="font-size:var(--text-xs);color:var(--color-text-muted);">
              {plants.length === 1 ? 'Plant' : 'Plants'}
            </div>
          </div>
          <div style="text-align:center;">
            <div style="font-family:var(--font-display);font-size:var(--text-3xl);font-weight:var(--font-bold);color:var(--color-sienna-600);">
              {birdsLoading ? '…' : birds.length}
            </div>
            <div style="font-size:var(--text-xs);color:var(--color-text-muted);">
              {birds.length === 1 ? 'Bird species' : 'Bird species'}
            </div>
          </div>
        </div>

        {/* Month selector */}
        <div style="display:flex;align-items:center;gap:var(--space-2);">
          <label
            for="garden-month"
            style="font-size:var(--text-sm);color:var(--color-text-muted);"
          >
            Month:
          </label>
          <select
            id="garden-month"
            value={month}
            onChange={(e) => setMonth(Number((e.target as HTMLSelectElement).value))}
            style="padding:var(--space-1) var(--space-2);border:1px solid var(--color-border);border-radius:var(--radius-md);background:var(--color-bg);color:var(--color-text);font-size:var(--text-sm);"
          >
            {MONTH_NAMES.map((name, i) => (
              <option key={i + 1} value={i + 1}>{name}</option>
            ))}
          </select>
        </div>

        {/* Share button */}
        <button
          type="button"
          onClick={handleShare}
          class="btn btn-outline"
          style="flex-shrink:0;"
          aria-label="Copy shareable garden link"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <circle cx="11" cy="2.5" r="1.5" stroke="currentColor" stroke-width="1.25"/>
            <circle cx="11" cy="11.5" r="1.5" stroke="currentColor" stroke-width="1.25"/>
            <circle cx="3" cy="7" r="1.5" stroke="currentColor" stroke-width="1.25"/>
            <path d="M4.5 6.1L9.5 3.4M4.5 7.9L9.5 10.6" stroke="currentColor" stroke-width="1.25"/>
          </svg>
          Share
        </button>
        {shareMsg && (
          <span
            role="status"
            style="font-size:var(--text-xs);color:var(--color-primary);word-break:break-all;"
          >
            {shareMsg}
          </span>
        )}
      </div>

      {/* No region warning */}
      {!region && (
        <div
          role="alert"
          style="padding:var(--space-4);background:var(--color-parchment-50);border:1px solid var(--color-parchment-300);border-radius:var(--radius-lg);margin-bottom:var(--space-6);font-size:var(--text-sm);"
        >
          <strong>No region selected.</strong>{' '}
          <a href="/" style="color:var(--color-primary);text-decoration:underline;">
            Go to the homepage
          </a>{' '}
          to choose your region and see which birds visit this month.
        </div>
      )}

      <div class="detail-layout">

        {/* Left: plant list */}
        <div class="detail-main">
          <h2
            style="font-family:var(--font-display);font-size:var(--text-xl);margin-bottom:var(--space-4);"
          >
            Your Plants
          </h2>
          <ul role="list" style="list-style:none;display:flex;flex-direction:column;gap:var(--space-3);">
            {plants.map((plant) => (
              <li
                key={plant.slug}
                style="display:flex;align-items:center;gap:var(--space-3);padding:var(--space-3) var(--space-4);background:var(--color-bg-card);border:1px solid var(--color-border);border-radius:var(--radius-lg);"
              >
                {/* Leaf icon */}
                <div
                  style="width:36px;height:36px;border-radius:var(--radius-md);background:var(--color-green-100);display:flex;align-items:center;justify-content:center;flex-shrink:0;"
                  aria-hidden="true"
                >
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                    <path d="M9 2C9 2 3 5.5 3 11C3 14.314 5.686 17 9 17C12.314 17 15 14.314 15 11C15 5.5 9 2 9 2Z"
                      fill="var(--color-green-300)"/>
                    <path d="M9 17V11" stroke="var(--color-green-600)" stroke-width="1.5" stroke-linecap="round"/>
                  </svg>
                </div>

                <div style="flex:1;min-width:0;">
                  <a
                    href={`/plants/${plant.slug}`}
                    style="font-weight:var(--font-semibold);font-size:var(--text-sm);color:var(--color-text);text-decoration:none;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"
                  >
                    {plant.name}
                  </a>
                </div>

                <button
                  type="button"
                  onClick={() => removePlant(plant.slug)}
                  aria-label={`Remove ${plant.name} from garden`}
                  style="display:flex;align-items:center;justify-content:center;width:2rem;height:2rem;border-radius:var(--radius-md);color:var(--color-text-muted);flex-shrink:0;transition:color var(--transition-fast);"
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                    <path d="M2 2L12 12M12 2L2 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                  </svg>
                </button>
              </li>
            ))}
          </ul>

          <div style="margin-top:var(--space-6);">
            <a href="/plants" class="btn btn-outline">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M7 2V12M2 7H12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
              Add more plants
            </a>
          </div>
        </div>

        {/* Right: birds attracted */}
        <aside class="detail-sidebar" aria-labelledby="garden-birds-heading">
          <h2
            id="garden-birds-heading"
            style="font-family:var(--font-display);font-size:var(--text-xl);margin-bottom:var(--space-4);"
          >
            Birds This Month
          </h2>

          {!region ? (
            <p style="color:var(--color-text-muted);font-size:var(--text-sm);">
              Select a region to see birds.
            </p>
          ) : birdsLoading ? (
            <div aria-busy="true" aria-label="Loading birds…">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  class="skeleton"
                  style="height:56px;border-radius:var(--radius-lg);margin-bottom:var(--space-3);"
                />
              ))}
            </div>
          ) : birdsError ? (
            <p role="alert" style="color:var(--color-error);font-size:var(--text-sm);">
              {birdsError}
            </p>
          ) : birds.length === 0 ? (
            <p style="color:var(--color-text-muted);font-size:var(--text-sm);">
              No birds recorded for {region.replace(/-/g, ' ')} in{' '}
              {MONTH_NAMES[month - 1]}. Try a different month.
            </p>
          ) : (
            <ul role="list" style="list-style:none;display:flex;flex-direction:column;gap:var(--space-3);">
              {birds.map((bird) => (
                <li key={bird.id}>
                  <a
                    href={`/birds/${bird.slug}`}
                    style="display:flex;align-items:center;gap:var(--space-3);padding:var(--space-3);background:var(--color-bg-card);border-radius:var(--radius-lg);border:1px solid var(--color-border);text-decoration:none;color:inherit;"
                    class="card"
                  >
                    <div
                      style="width:36px;height:36px;border-radius:var(--radius-md);background:var(--color-sage-100);display:flex;align-items:center;justify-content:center;flex-shrink:0;"
                      aria-hidden="true"
                    >
                      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                        <path d="M3 14C3 14 7 9 10 7.5C13 6 16 8 16 11C16 14 13 15.5 10 15.5C8 15.5 5 14.5 3 14Z"
                          fill="var(--color-sage-300)"/>
                        <circle cx="12" cy="7" r="2" fill="var(--color-sage-400)"/>
                      </svg>
                    </div>
                    <div style="min-width:0;flex:1;">
                      <div style="font-weight:var(--font-semibold);font-size:var(--text-sm);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                        {bird.common_name}
                      </div>
                      <div style="font-size:var(--text-xs);color:var(--color-text-muted);margin-top:2px;display:flex;gap:var(--space-2);">
                        {bird.presence && (
                          <span style={`
                            color:${
                              bird.presence === 'resident' ? 'var(--color-primary)' :
                              bird.presence === 'breeding' ? 'var(--color-sienna-600)' :
                              bird.presence === 'wintering' ? 'var(--color-sage-600)' :
                              'var(--color-parchment-600)'
                            };
                          `}>
                            {bird.presence.charAt(0).toUpperCase() + bird.presence.slice(1)}
                          </span>
                        )}
                        {bird.attraction_type && (
                          <span>{bird.attraction_type.replace(/_/g, ' ')}</span>
                        )}
                      </div>
                    </div>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </div>
  );
}
